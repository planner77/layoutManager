/** @param {Record<string,string|undefined>} env */
export function storageConfiguration(env) {
  const backend = env.CAD_STORAGE_BACKEND || 'local';
  if (!['local','s3'].includes(backend)) throw new Error('CAD_STORAGE_BACKEND must be local or s3');
  if (backend === 'local' && !env.CAD_S3_ENDPOINT) return { backend, s3: undefined };
  const endpoint = env.CAD_S3_ENDPOINT, bucket = env.CAD_S3_BUCKET;
  const accessKeyId = env.CAD_S3_ACCESS_KEY_ID, secretAccessKey = env.CAD_S3_SECRET_ACCESS_KEY;
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) throw new Error('CAD_S3_ENDPOINT, CAD_S3_BUCKET and S3 credentials are required');
  let url;
  try { url = new URL(endpoint); } catch { throw new Error('Invalid CAD_S3_ENDPOINT'); }
  if (!['http:','https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || !['','/'].includes(url.pathname)) throw new Error('CAD_S3_ENDPOINT must be an HTTP(S) origin without credentials');
  if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket)) throw new Error('Invalid CAD_S3_BUCKET');
  const style = env.CAD_S3_FORCE_PATH_STYLE || 'true';
  if (!['true','false'].includes(style)) throw new Error('CAD_S3_FORCE_PATH_STYLE must be true or false');
  const timeoutMs = Number(env.CAD_S3_TIMEOUT_MS || '60000');
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 300000) throw new Error('CAD_S3_TIMEOUT_MS must be 1000–300000');
  return { backend, s3: { endpoint: url.origin, bucket, region: env.CAD_S3_REGION || 'us-east-1', forcePathStyle: style === 'true', timeoutMs, credentials: { accessKeyId, secretAccessKey, ...(env.CAD_S3_SESSION_TOKEN ? {sessionToken:env.CAD_S3_SESSION_TOKEN} : {}) } } };
}
