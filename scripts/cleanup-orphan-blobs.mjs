import { del, list } from "@vercel/blob";
import postgres from "postgres";

if (!process.env.DATABASE_URL || !process.env.BLOB_READ_WRITE_TOKEN) {
  throw new Error("DATABASE_URL and BLOB_READ_WRITE_TOKEN are required.");
}

const deleteConfirmed = process.argv.includes("--delete");
const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false });

try {
  const referenced = new Set((await sql`SELECT storage_key FROM chapter_media`).map((row) => row.storage_key));
  const orphaned = [];
  let cursor;
  do {
    const page = await list({ cursor, limit: 1000 });
    orphaned.push(...page.blobs.filter((blob) => blob.pathname.startsWith("life-atlas/") && !referenced.has(blob.pathname)));
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);

  if (deleteConfirmed && orphaned.length) await del(orphaned.map((blob) => blob.url));
  console.log(JSON.stringify({ mode: deleteConfirmed ? "deleted" : "dry-run", count: orphaned.length, paths: orphaned.map((blob) => blob.pathname) }, null, 2));
} finally {
  await sql.end();
}
