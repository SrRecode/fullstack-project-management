import { readFile } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

export function contentType(filePath) {
  return MIME[extname(filePath).toLowerCase()] ?? 'application/octet-stream';
}

/** Resolve a request path inside `root`, or null if it would escape it. */
export function safeJoin(root, requestPath) {
  const base = resolve(root);
  let decoded;
  try {
    decoded = decodeURIComponent(requestPath.split('?')[0]);
  } catch {
    return null;
  }
  const relative = decoded.startsWith('/') ? decoded : `/${decoded}`;
  const target = resolve(base, `.${relative}`);
  if (target !== base && !target.startsWith(base + sep)) return null;
  return target === base ? join(base, 'index.html') : target;
}

/** Serve a static file from `publicDir`; returns true if it handled the request. */
export async function serveStatic(publicDir, urlPath, res) {
  const filePath = safeJoin(publicDir, urlPath);
  if (!filePath) {
    sendText(res, 403, 'Forbidden');
    return true;
  }
  try {
    const data = await readFile(filePath);
    res.writeHead(200, { 'Content-Type': contentType(filePath) });
    res.end(data);
    return true;
  } catch {
    return false;
  }
}

export function sendText(res, status, text) {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(text);
}
