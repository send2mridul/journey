import postgres from "postgres";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");

const databaseName = "life_atlas_preview";
const sql = postgres(process.env.DATABASE_URL, {
  max: 1,
  prepare: false,
  idle_timeout: 10,
  connect_timeout: 10,
});

try {
  const existing = await sql`SELECT 1 FROM pg_database WHERE datname = ${databaseName}`;
  if (!existing.length) await sql.unsafe(`CREATE DATABASE ${databaseName}`);
  console.log(JSON.stringify({ previewDatabaseReady: true, created: existing.length === 0 }));
} finally {
  await sql.end();
}
