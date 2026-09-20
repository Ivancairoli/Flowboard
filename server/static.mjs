import { readdirSync, readFileSync } from 'node:fs';
import { join, extname } from 'node:path';

const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

// Only files in the compiled frontend can be served. Symlinks and hidden files
// are excluded, and request paths are never used to access the filesystem.
export function createStaticHandler(directory) {
  const files = new Map();
  function collect(folder, prefix = '') {
    for (const entry of readdirSync(folder, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;
      const path = join(folder, entry.name);
      const url = `${prefix}/${entry.name}`;
      if (entry.isDirectory()) collect(path, url);
      else if (entry.isFile() && contentTypes[extname(entry.name)])
        files.set(url, { body: readFileSync(path), type: contentTypes[extname(entry.name)] });
    }
  }
  collect(directory);
  if (!files.has('/index.html'))
    throw new Error('Falta el frontend compilado. Ejecutá npm run build.');

  return (req, res, pathname) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { Allow: 'GET, HEAD' });
      return res.end();
    }
    let path;
    try {
      path = decodeURIComponent(pathname);
    } catch {
      res.writeHead(400);
      return res.end();
    }
    if (/[\\\x00-\x1f]/.test(path) || path.split('/').some((part) => part.startsWith('.'))) {
      res.writeHead(404);
      return res.end();
    }
    const file = files.get(path) || (!extname(path) ? files.get('/index.html') : undefined);
    if (!file) {
      res.writeHead(404);
      return res.end();
    }
    res.writeHead(200, {
      'Content-Type': file.type,
      'Content-Length': file.body.length,
      'Cache-Control': 'no-cache',
    });
    res.end(req.method === 'HEAD' ? undefined : file.body);
  };
}
