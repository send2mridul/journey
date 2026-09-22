export const mediaStorageConfigured = Boolean(process.env['BLOB_READ_WRITE_TOKEN']);

export async function readPrivateMedia(storageKey: string) {
  if (!mediaStorageConfigured) return null;
  const { get } = await import('@vercel/blob');
  return get(storageKey, { access: 'private' });
}

export async function deletePrivateMedia(storageKey: string) {
  if (!mediaStorageConfigured) throw new Error('Photo storage is not configured.');
  const { del } = await import('@vercel/blob');
  await del(storageKey);
}
