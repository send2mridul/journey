import { closeSync, createReadStream, openSync, readFileSync, readSync, statSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import iconv from 'iconv-lite';
import pg from 'pg';
import { from as copyFrom } from 'pg-copy-streams';

const { Client } = pg;

function argument(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const dataDirectory = process.env.LOCATION_DATA_DIR;
const paths = {
  countries: resolve(argument('countries', dataDirectory ? `${dataDirectory}/country_uploaded.csv` : 'country_uploaded.csv')),
  states: resolve(argument('states', dataDirectory ? `${dataDirectory}/state_uploaded.csv` : 'state_uploaded.csv')),
  cities: resolve(argument('cities', dataDirectory ? `${dataDirectory}/cities_uploaded.csv` : 'cities_uploaded.csv')),
};
const canonicalStatesPath = resolve(argument('canonical-states', 'data/admin1CodesASCII.txt'));

const cityBatchSize = Number(argument('batch-size', '100000'));
if (!Number.isSafeInteger(cityBatchSize) || cityBatchSize < 1000) {
  throw new Error('--batch-size must be an integer of at least 1000.');
}
const cityStartRow = Number(argument('start-row', '1'));
if (!Number.isSafeInteger(cityStartRow) || cityStartRow < 1) {
  throw new Error('--start-row must be a positive integer.');
}
const appendOnly = process.argv.includes('--append-only');
const skipCities = process.argv.includes('--skip-cities');

const expectedHeaders = {
  countries: 'country_id,country_name,country_code',
  states: 'state_id,country_code,admin1_code,state_name',
  cities: 'city_id,city_name,country_code,admin1_code,latitude,longitude,population',
};

function normalizedHeader(path) {
  const descriptor = openSync(path, 'r');
  const buffer = Buffer.alloc(512);
  const bytesRead = readSync(descriptor, buffer, 0, buffer.length, 0);
  closeSync(descriptor);
  return buffer.subarray(0, bytesRead).toString('utf8')
    .split(/\r?\n/, 1)[0]
    .replace(/^\uFEFF/, '')
    .replaceAll('"', '');
}

for (const [kind, path] of Object.entries(paths)) {
  const actual = normalizedHeader(path);
  if (actual !== expectedHeaders[kind]) {
    throw new Error(`${basename(path)} has an unexpected header. Expected ${expectedHeaders[kind]}, received ${actual}`);
  }
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is required. Use a pooled Neon connection string.');

function repairMojibake(value) {
  let current = value;
  for (let pass = 0; pass < 8 && /[ÃÂâÄÅÆ]/.test(current); pass += 1) {
    const repaired = iconv.decode(iconv.encode(current, 'win1252'), 'utf8');
    if (repaired.includes('�') || repaired === current) break;
    current = repaired;
  }
  return current;
}

function progress(label, totalBytes) {
  let bytes = 0;
  let lastReported = 0;
  return new Transform({
    transform(chunk, _encoding, callback) {
      bytes += chunk.length;
      const percent = Math.floor(bytes / totalBytes * 100);
      if (percent >= lastReported + 10) {
        lastReported = percent;
        process.stdout.write(`${label}: ${Math.min(percent, 100)}%\n`);
      }
      callback(null, chunk);
    },
  });
}

async function copyCsv(client, label, path, statement, repairEncoding = false) {
  const size = statSync(path).size;
  const source = repairEncoding
    ? Readable.from(repairMojibake(readFileSync(path, 'utf8')))
    : createReadStream(path);
  const target = client.query(copyFrom(statement));
  await pipeline(source, progress(label, size), target);
}

function loadCanonicalStateNames(path) {
  const names = new Map();
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    if (!line) continue;
    const columns = line.split('\t');
    const id = columns[3];
    const name = columns[1];
    if (id && name) names.set(id, name);
  }
  return names;
}

async function copyStates(client, path, statement) {
  const canonicalNames = loadCanonicalStateNames(canonicalStatesPath);
  const lines = readFileSync(path, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/);
  const output = [lines[0]];
  let canonicalMatches = 0;
  for (const line of lines.slice(1)) {
    if (!line) continue;
    const row = parseCsvLine(line);
    const canonicalName = canonicalNames.get(row[0]);
    if (canonicalName) canonicalMatches += 1;
    row[3] = canonicalName ?? repairMojibake(row[3]);
    output.push(row.map(csvCell).join(','));
  }
  await pipeline(Readable.from(`${output.join('\n')}\n`), client.query(copyFrom(statement)));
  process.stdout.write(`States: 100% (${canonicalMatches.toLocaleString('en-US')} names reconciled with GeoNames)\n`);
}

function parseCsvLine(line) {
  const values = [];
  let value = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === ',' && !quoted) {
      values.push(value);
      value = '';
    } else {
      value += character;
    }
  }
  values.push(value);
  return values;
}

function csvCell(value) {
  const text = String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

async function upsertCityBatch(client, rows, processed, total) {
  await client.query('TRUNCATE import_cities');
  const csv = `${rows.map((row) => row.map(csvCell).join(',')).join('\n')}\n`;
  await pipeline(
    Readable.from(csv),
    client.query(copyFrom("COPY import_cities (city_id, city_name, country_code, admin1_code, latitude, longitude, population) FROM STDIN WITH (FORMAT csv, ENCODING 'UTF8')")),
  );
  const conflictClause = appendOnly ? '' : `
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name,
      country_code = EXCLUDED.country_code,
      state_id = EXCLUDED.state_id,
      latitude = EXCLUDED.latitude,
      longitude = EXCLUDED.longitude,
      population = EXCLUDED.population
    WHERE (cities.name, cities.country_code, cities.state_id, cities.latitude, cities.longitude, cities.population)
      IS DISTINCT FROM
      (EXCLUDED.name, EXCLUDED.country_code, EXCLUDED.state_id, EXCLUDED.latitude, EXCLUDED.longitude, EXCLUDED.population)
  `;
  await client.query(`
    INSERT INTO cities (id, name, country_code, state_id, latitude, longitude, population)
    SELECT
      source.city_id::integer,
      COALESCE(NULLIF(source.city_name, ''), 'Unnamed place ' || source.city_id),
      COALESCE(NULLIF(upper(source.country_code), ''), 'NA'),
      state.id,
      source.latitude::real,
      source.longitude::real,
      COALESCE(NULLIF(source.population, ''), '0')::integer
    FROM import_cities source
    LEFT JOIN states state
      ON state.country_code = COALESCE(NULLIF(upper(source.country_code), ''), 'NA')
      AND state.admin1_code = source.admin1_code
    ${conflictClause};
  `);
  process.stdout.write(`Cities upserted: ${processed.toLocaleString('en-US')} / ${total.toLocaleString('en-US')} (resume with --start-row ${processed + 1})\n`);
}

async function importCities(client, path) {
  const input = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
  let sourceRow = 0;
  let headerSeen = false;
  let batch = [];
  const total = 5_175_737;
  for await (const line of input) {
    if (!headerSeen) {
      headerSeen = true;
      continue;
    }
    sourceRow += 1;
    if (sourceRow < cityStartRow) continue;
    const row = parseCsvLine(line);
    if (row.length !== 7) throw new Error(`City source row ${sourceRow} has ${row.length} columns; expected 7.`);
    batch.push(row);
    if (batch.length >= cityBatchSize) {
      await upsertCityBatch(client, batch, sourceRow, total);
      batch = [];
    }
  }
  if (batch.length) await upsertCityBatch(client, batch, sourceRow, total);
}

const client = new Client({ connectionString, application_name: 'life-atlas-location-import' });
await client.connect();

try {
  const lock = await client.query("SELECT pg_try_advisory_lock(hashtext('life-atlas-location-import')) AS acquired");
  if (!lock.rows[0]?.acquired) throw new Error('Another location import is already running.');

  await client.query(`
    DROP TABLE IF EXISTS import_cities;
    DROP TABLE IF EXISTS import_states;
    DROP TABLE IF EXISTS import_countries;
    CREATE TEMP TABLE import_countries (country_id text, country_name text, country_code text) ON COMMIT PRESERVE ROWS;
    CREATE TEMP TABLE import_states (state_id text, country_code text, admin1_code text, state_name text) ON COMMIT PRESERVE ROWS;
    CREATE TEMP TABLE import_cities (city_id text, city_name text, country_code text, admin1_code text, latitude text, longitude text, population text) ON COMMIT PRESERVE ROWS;
  `);

  await copyCsv(client, 'Countries', paths.countries, "COPY import_countries FROM STDIN WITH (FORMAT csv, HEADER true, ENCODING 'UTF8')");
  await client.query(`
    INSERT INTO countries (id, name, code)
    SELECT
      country_id::bigint,
      country_name,
      CASE
        WHEN country_name = 'Namibia' AND upper(country_code) = 'NULL' THEN 'NA'
        ELSE upper(country_code)
      END
    FROM import_countries
    ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, code = EXCLUDED.code;
  `);

  await copyStates(client, paths.states, "COPY import_states FROM STDIN WITH (FORMAT csv, HEADER true, ENCODING 'UTF8')");
  await client.query(`
    INSERT INTO states (id, country_code, admin1_code, name)
    SELECT state_id::integer, upper(country_code), admin1_code, state_name FROM import_states
    ON CONFLICT (id) DO UPDATE SET country_code = EXCLUDED.country_code, admin1_code = EXCLUDED.admin1_code, name = EXCLUDED.name;
  `);

  if (!skipCities) await importCities(client, paths.cities);

  await client.query('ANALYZE countries; ANALYZE states; ANALYZE cities;');
  const counts = await client.query(`
    SELECT
      (SELECT count(*)::bigint FROM countries) AS countries,
      (SELECT count(*)::bigint FROM states) AS states,
      (SELECT count(*)::bigint FROM cities) AS cities,
      (SELECT count(*)::bigint FROM cities WHERE state_id IS NULL) AS cities_without_state;
  `);
  process.stdout.write(`${JSON.stringify(counts.rows[0], null, 2)}\n`);
} finally {
  await client.query("SELECT pg_advisory_unlock(hashtext('life-atlas-location-import'))").catch(() => undefined);
  await client.end();
}
