import postgres from "postgres";

if (!process.env.SOURCE_DATABASE_URL || !process.env.DATABASE_URL) {
  throw new Error("SOURCE_DATABASE_URL and DATABASE_URL are required.");
}
if (process.env.SOURCE_DATABASE_URL === process.env.DATABASE_URL) {
  throw new Error("Source and Preview databases must be distinct.");
}

const source = postgres(process.env.SOURCE_DATABASE_URL, { max: 1, prepare: false });
const preview = postgres(process.env.DATABASE_URL, { max: 1, prepare: false });

async function insertRows(sql, table, columns, rows) {
  for (let index = 0; index < rows.length; index += 750) {
    const chunk = rows.slice(index, index + 750);
    await sql`INSERT INTO ${sql(table)} ${sql(chunk, ...columns)} ON CONFLICT DO NOTHING`;
  }
}

try {
  const countries = await source`SELECT id, code, name FROM countries ORDER BY id`;
  const states = await source`SELECT id, country_code, admin1_code, name FROM states ORDER BY id`;
  const cities = await source`
    SELECT id, name, country_code, state_id, latitude, longitude, population
    FROM cities
    WHERE population >= 25000 OR id IN (SELECT city_id FROM country_map_anchors)
    ORDER BY id
  `;
  const sources = await source`
    SELECT id, provider, dataset_name, version, source_url, metadata, imported_at
    FROM migration_data_sources ORDER BY id
  `;
  const stock = await source`
    SELECT source_id, year, origin_country_code, destination_country_code, stock
    FROM migrant_stock ORDER BY source_id, year, origin_country_code, destination_country_code
  `;
  const anchors = await source`
    SELECT country_code, city_id, latitude, longitude, updated_at
    FROM country_map_anchors ORDER BY country_code
  `;

  await preview.begin(async (sql) => {
    await insertRows(sql, "countries", ["id", "code", "name"], countries);
    await insertRows(sql, "states", ["id", "country_code", "admin1_code", "name"], states);
    await insertRows(sql, "cities", ["id", "name", "country_code", "state_id", "latitude", "longitude", "population"], cities);
    await insertRows(sql, "migration_data_sources", ["id", "provider", "dataset_name", "version", "source_url", "metadata", "imported_at"], sources);
    await insertRows(sql, "migrant_stock", ["source_id", "year", "origin_country_code", "destination_country_code", "stock"], stock);
    await insertRows(sql, "country_map_anchors", ["country_code", "city_id", "latitude", "longitude", "updated_at"], anchors);
  });

  console.log(JSON.stringify({ countries: countries.length, states: states.length, cities: cities.length, migrantStockRows: stock.length, anchors: anchors.length }));
} finally {
  await Promise.all([source.end(), preview.end()]);
}
