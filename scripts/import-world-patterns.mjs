import { createReadStream, existsSync } from 'node:fs';
import { basename } from 'node:path';
import process from 'node:process';
import pg from 'pg';
import { from as copyFrom } from 'pg-copy-streams';
import xlsx from 'xlsx';
import countries from 'i18n-iso-countries';

const sourceId = 'undesa-ims-2024-destination-origin';
const sourceUrl = 'https://www.un.org/development/desa/pd/sites/www.un.org.development.desa.pd/files/undesa_pd_2024_ims_stock_by_sex_destination_and_origin.xlsx';
const expectedFilename = 'undesa_pd_2024_ims_stock_by_sex_destination_and_origin.xlsx';
const years = [1990, 1995, 2000, 2005, 2010, 2015, 2020, 2024];

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function parseStock(value) {
  const parsed = Number(String(value ?? '').replaceAll(' ', '').replaceAll(',', ''));
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : null;
}

function escapeCopy(value) {
  return String(value).replaceAll('\\', '\\\\').replaceAll('\t', '\\t').replaceAll('\n', '\\n').replaceAll('\r', '\\r');
}

async function workbook() {
  const file = argument('--file');
  if (file) {
    if (!existsSync(file)) throw new Error(`Official workbook not found: ${file}`);
    return { book: xlsx.readFile(file, { dense: true }), input: basename(file) };
  }
  console.log(`Downloading official UN DESA workbook: ${expectedFilename}`);
  const response = await fetch(sourceUrl);
  if (!response.ok) throw new Error(`UN DESA download failed (${response.status}). Download ${sourceUrl} and pass --file <path>.`);
  const bytes = await response.arrayBuffer();
  return { book: xlsx.read(bytes, { type: 'array', dense: true }), input: expectedFilename };
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required.');
const { book, input } = await workbook();
const sheet = book.Sheets['Table 1'];
if (!sheet) throw new Error('The official workbook must contain “Table 1”.');
const rows = xlsx.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: '' });
const headerIndex = rows.findIndex((row) => row[0] === 'Index' && String(row[4]).includes('destination'));
if (headerIndex < 0) throw new Error('Could not find the Table 1 header in the official workbook.');

const pool = new pg.Pool({ connectionString: databaseUrl, max: 1, ssl: databaseUrl.includes('localhost') ? undefined : { rejectUnauthorized: true } });
const client = await pool.connect();
try {
  const countryRows = await client.query('SELECT code FROM countries');
  const availableCodes = new Set(countryRows.rows.map((row) => row.code));
  await client.query('BEGIN');
  await client.query(`
    CREATE TEMP TABLE migrant_stock_import (
      source_id text NOT NULL,
      year integer NOT NULL,
      origin_country_code text NOT NULL,
      destination_country_code text NOT NULL,
      stock bigint NOT NULL
    ) ON COMMIT DROP
  `);
  const stream = client.query(copyFrom('COPY migrant_stock_import (source_id, year, origin_country_code, destination_country_code, stock) FROM STDIN'));
  let imported = 0;
  let skipped = 0;
  for (const row of rows.slice(headerIndex + 1)) {
    const destinationM49 = Number(row[4]);
    const originM49 = Number(row[6]);
    if (!Number.isInteger(destinationM49) || !Number.isInteger(originM49) || destinationM49 < 1 || destinationM49 > 899 || originM49 < 1 || originM49 > 899) { skipped += 1; continue; }
    const destinationCode = countries.numericToAlpha2(String(destinationM49).padStart(3, '0'));
    const originCode = countries.numericToAlpha2(String(originM49).padStart(3, '0'));
    if (!destinationCode || !originCode || !availableCodes.has(destinationCode) || !availableCodes.has(originCode) || destinationCode === originCode) { skipped += 1; continue; }
    for (let index = 0; index < years.length; index += 1) {
      const stock = parseStock(row[7 + index]);
      if (stock === null) continue;
      if (!stream.write([sourceId, years[index], originCode, destinationCode, stock].map(escapeCopy).join('\t') + '\n')) await new Promise((resolve) => stream.once('drain', resolve));
      imported += 1;
    }
  }
  stream.end();
  await new Promise((resolve, reject) => { stream.on('finish', resolve); stream.on('error', reject); });
  await client.query('DELETE FROM migrant_stock WHERE source_id = $1', [sourceId]);
  await client.query('DELETE FROM migration_data_sources WHERE id = $1', [sourceId]);
  await client.query(`
    INSERT INTO migration_data_sources (id, provider, dataset_name, version, source_url, metadata)
    VALUES ($1, 'UN DESA Population Division', 'International Migrant Stock: Destination and origin', '2024 / POP/DB/MIG/Stock/Rev.2024', $2, $3::jsonb)
  `, [sourceId, sourceUrl, JSON.stringify({ input, years, semantics: 'International migrant stock estimates; not annual migration flows.', skippedWorkbookRows: skipped })]);
  await client.query('INSERT INTO migrant_stock SELECT * FROM migrant_stock_import ON CONFLICT DO NOTHING');
  await client.query('ANALYZE migrant_stock');
  await client.query('COMMIT');
  console.log(`Imported ${imported.toLocaleString()} country-pair-year stock estimates from UN DESA International Migrant Stock 2024.`);
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  client.release();
  await pool.end();
}
