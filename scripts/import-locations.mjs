import { closeSync, createReadStream, openSync, readFileSync, readSync, statSync } from 'node:fs';
import { basename, resolve } from 'node:path';
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
  for (let pass = 0; pass < 2 && /[ÃÂâ]/.test(current); pass += 1) {
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

const client = new Client({ connectionString, application_name: 'life-atlas-location-import' });
await client.connect();

try {
  const lock = await client.query("SELECT pg_try_advisory_lock(hashtext('life-atlas-location-import')) AS acquired");
  if (!lock.rows[0]?.acquired) throw new Error('Another location import is already running.');

  await client.query(`
    CREATE TEMP TABLE import_countries (country_id text, country_name text, country_code text) ON COMMIT PRESERVE ROWS;
    CREATE TEMP TABLE import_states (state_id text, country_code text, admin1_code text, state_name text) ON COMMIT PRESERVE ROWS;
    CREATE TEMP TABLE import_cities (city_id text, city_name text, country_code text, admin1_code text, latitude text, longitude text, population text) ON COMMIT PRESERVE ROWS;
  `);

  await copyCsv(client, 'Countries', paths.countries, "COPY import_countries FROM STDIN WITH (FORMAT csv, HEADER true, ENCODING 'UTF8')");
  await client.query(`
    INSERT INTO countries (id, name, code)
    SELECT country_id::bigint, country_name, upper(country_code) FROM import_countries
    ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, code = EXCLUDED.code;
  `);

  await copyCsv(client, 'States', paths.states, "COPY import_states FROM STDIN WITH (FORMAT csv, HEADER true, ENCODING 'UTF8')", true);
  await client.query(`
    INSERT INTO states (id, country_code, admin1_code, name)
    SELECT state_id::bigint, upper(country_code), admin1_code, state_name FROM import_states
    ON CONFLICT (id) DO UPDATE SET country_code = EXCLUDED.country_code, admin1_code = EXCLUDED.admin1_code, name = EXCLUDED.name;
  `);

  await copyCsv(client, 'Cities', paths.cities, "COPY import_cities FROM STDIN WITH (FORMAT csv, HEADER true, ENCODING 'UTF8')");
  await client.query(`
    INSERT INTO cities (id, name, country_code, state_id, latitude, longitude, population)
    SELECT
      source.city_id::bigint,
      source.city_name,
      upper(source.country_code),
      state.id,
      source.latitude::double precision,
      source.longitude::double precision,
      COALESCE(NULLIF(source.population, ''), '0')::bigint
    FROM import_cities source
    LEFT JOIN states state
      ON state.country_code = upper(source.country_code)
      AND state.admin1_code = source.admin1_code
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name,
      country_code = EXCLUDED.country_code,
      state_id = EXCLUDED.state_id,
      latitude = EXCLUDED.latitude,
      longitude = EXCLUDED.longitude,
      population = EXCLUDED.population;
  `);

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
