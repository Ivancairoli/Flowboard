import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from './index.mjs';

test('production serves the SPA and assets without exposing private files or weakening the API', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'flowboard-static-'));
  const publicDir = join(directory, 'browser');
  mkdirSync(publicDir);
  writeFileSync(join(directory, '.env'), 'PRIVATE_SECRET');
  writeFileSync(join(publicDir, 'index.html'), '<html>FlowBoard</html>');
  writeFileSync(join(publicDir, 'main-ABC.js'), 'console.log("FlowBoard");');
  writeFileSync(join(publicDir, '.env'), 'PRIVATE_SECRET');
  writeFileSync(join(publicDir, 'main-ABC.js.map'), 'SOURCE_MAP');
  const server = createServer({
    production: true,
    publicOrigin: 'https://flowboard.example',
    staticDir: publicDir,
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const request = (path, method = 'GET', headers = {}) =>
    new Promise((resolve, reject) => {
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port: server.address().port,
          path,
          method,
          headers: { host: 'flowboard.example', ...headers },
        },
        (res) => {
          let body = '';
          res.on('data', (data) => {
            body += data;
          });
          res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
        },
      );
      req.on('error', reject);
      req.end();
    });
  try {
    for (const path of ['/', '/tablero/equipo']) {
      const response = await request(path, 'GET', { 'sec-fetch-site': 'cross-site' });
      assert.equal(response.status, 200);
      assert.match(response.headers['content-type'], /text\/html/);
      assert.equal(response.body, '<html>FlowBoard</html>');
    }
    const asset = await request('/main-ABC.js?v=1');
    assert.equal(asset.status, 200);
    assert.match(asset.headers['content-type'], /text\/javascript/);
    assert.equal(asset.body, 'console.log("FlowBoard");');
    const head = await request('/main-ABC.js', 'HEAD');
    assert.equal(head.status, 200);
    assert.equal(head.body, '');
    assert.equal(Number(head.headers['content-length']), Buffer.byteLength(asset.body));
    for (const path of [
      '/.env',
      '/%2eenv',
      '/..%2f.env',
      '/server/index.mjs',
      '/main-ABC.js.map',
      '/missing.js',
      '/api/missing',
    ]) {
      const response = await request(path);
      assert.equal(response.status, 404, path);
      assert.equal(response.body.includes('PRIVATE_SECRET'), false);
    }
    assert.equal((await request('/%ZZ')).status, 400);
    assert.equal((await request('/', 'POST')).status, 405);
    assert.equal((await request('/', 'GET', { host: 'foreign.example' })).status, 403);
    assert.equal((await request('/api/health')).status, 200);
    assert.equal((await request('/api/board')).status, 401);
    assert.equal(
      (await request('/api/session', 'GET', { 'sec-fetch-site': 'cross-site' })).status,
      403,
    );
    assert.equal((await request('/api/session', 'POST')).status, 403);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    rmSync(directory, { recursive: true, force: true });
  }
});
