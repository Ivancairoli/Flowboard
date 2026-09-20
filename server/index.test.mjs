import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createServer } from './index.mjs';

async function withServer(load, run, options = {}) {
  const server = createServer({
    staticDir: false,
    clientFactory: (config) =>
      Object.assign((selection) => load(selection), {
        projects: async () => ({ value: [{ id: 'p', name: 'Pages' }], defaults: config }),
        teams: async () => ({ value: [{ id: 't', name: 'Pages Team' }] }),
        sprints: async () => ({ value: [] }),
        createTasks: load.createTasks,
      }),
    ...options,
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  let cookie = '';
  const call = (path = '/api/board', headers = {}, method = 'GET', payload) =>
    new Promise((resolve, reject) => {
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port: server.address().port,
          path,
          method,
          headers: {
            host: '127.0.0.1:3001',
            cookie,
            ...(method !== 'GET'
              ? {
                  origin: 'http://127.0.0.1:4200',
                  'x-flowboard-request': '1',
                  'content-type': 'application/json',
                }
              : {}),
            ...headers,
          },
        },
        (res) => {
          let body = '';
          res.on('data', (data) => (body += data));
          res.on('end', () =>
            resolve({ status: res.statusCode, body: JSON.parse(body), headers: res.headers }),
          );
        },
      );
      req.on('error', reject);
      req.end(payload === undefined ? undefined : JSON.stringify(payload));
    });
  try {
    if (options.autoLogin !== false) {
      const login = await call('/api/session', {}, 'POST', {
        boardUrl:
          'https://dev.azure.com/PagesWeb/Pages/_sprints/taskboard/Pages%20Team/Pages/Sprint%201',
        pat: 'fake-pat',
      });
      assert.equal(login.status, 200);
      cookie = login.headers['set-cookie'][0].split(';')[0];
    }
    await run(call);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('API rejects foreign sites, foreign hosts, writes and arbitrary upstream routes', async () => {
  await withServer(
    () => assert.fail('must not reach Azure'),
    async (call) => {
      assert.equal((await call('/api/board', { origin: 'https://foreign.example' })).status, 403);
      assert.equal((await call('/api/board', { host: 'foreign.example' })).status, 403);
      assert.equal((await call('/api/board', { 'sec-fetch-site': 'cross-site' })).status, 403);
      assert.equal((await call('/api/board', {}, 'POST')).status, 405);
      assert.equal((await call('/api/proxy?url=https://foreign.example')).status, 404);
    },
  );
});

test('task creation requires session, confirmation and same origin and invalidates board cache', async () => {
  let reads = 0,
    writes = 0;
  const load = Object.assign(
    async () => {
      reads++;
      return { stories: [] };
    },
    {
      createTasks: async (body) => {
        writes++;
        return { results: [{ draftId: body.tasks[0].id, status: 'created', id: 55 }] };
      },
    },
  );
  const payload = {
    project: 'Pages',
    storyId: 1,
    confirmed: true,
    tasks: [
      {
        id: '12345678-1234-1234-1234-123456789012',
        title: 'Task',
        description: '',
        specialty: 'Backend',
        assignee: '',
      },
    ],
  };
  await withServer(load, async (call) => {
    assert.equal((await call('/api/tasks', { cookie: '' }, 'POST', payload)).status, 401);
    assert.equal(
      (await call('/api/tasks', { origin: 'https://foreign.example' }, 'POST', payload)).status,
      403,
    );
    assert.equal(
      (await call('/api/tasks', { 'x-flowboard-request': '' }, 'POST', payload)).status,
      403,
    );
    assert.equal(
      (await call('/api/tasks', {}, 'POST', { ...payload, confirmed: false })).status,
      400,
    );
    assert.equal(writes, 0);
    await call();
    await call();
    assert.equal(reads, 1);
    const result = await call('/api/tasks', {}, 'POST', payload);
    assert.equal(result.status, 200);
    assert.equal(result.body.results[0].id, 55);
    assert.equal(writes, 1);
    await call();
    assert.equal(reads, 2);
  });
});

test('API coalesces concurrent calls and caches successful responses', async () => {
  let calls = 0;
  await withServer(
    async () => {
      calls++;
      return { stories: [], syncedAt: 'test' };
    },
    async (call) => {
      const results = await Promise.all([call(), call(), call()]);
      assert.equal(calls, 1);
      assert.ok(results.every((result) => result.status === 200));
    },
  );
});

test('unexpected server errors never leak credentials or upstream details', async () => {
  await withServer(
    async () => {
      throw new Error('private-test-token');
    },
    async (call) => {
      const result = await call();
      assert.equal(result.status, 500);
      assert.equal(JSON.stringify(result).includes('private-test-token'), false);
    },
  );
});

test('isolates board caches by scope and validates incomplete selections', async () => {
  let calls = 0;
  await withServer(
    async (selection) => {
      calls++;
      return selection;
    },
    async (call) => {
      const first = '/api/board?project=P&team=T&sprint=a&sprint=b';
      assert.equal((await call(first)).status, 200);
      await call('/api/board?project=P&team=T&sprint=b&sprint=a');
      assert.equal(calls, 1);
      assert.deepEqual((await call('/api/board?project=Other&team=T&sprint=a')).body, {
        project: 'Other',
        team: 'T',
        sprints: ['a'],
      });
      assert.equal(calls, 2);
      assert.equal((await call('/api/board?project=P&team=T')).status, 400);
      assert.equal((await call('/api/sprints?project=P')).status, 400);
      assert.equal(calls, 2);
    },
  );
});

test('requires authentication, isolates users and removes sessions on logout', async () => {
  await withServer(
    () => {},
    async (call) => {
      assert.equal((await call()).status, 401);
      const login = (pat) =>
        call('/api/session', {}, 'POST', { boardUrl: 'https://dev.azure.com/Org/Project', pat });
      const a = await login('alice-token'),
        b = await login('bob-token');
      const cookieA = a.headers['set-cookie'][0].split(';')[0],
        cookieB = b.headers['set-cookie'][0].split(';')[0];
      assert.notEqual(cookieA, cookieB);
      assert.match(a.headers['set-cookie'][0], /HttpOnly; SameSite=Strict/);
      assert.equal(JSON.stringify(a.body).includes('alice-token'), false);
      const first = await call('/api/board', { cookie: cookieA });
      const second = await call('/api/board', { cookie: cookieB });
      assert.equal(first.body.owner, 'alice');
      assert.equal(second.body.owner, 'bob');
      assert.equal((await call('/api/session', { cookie: cookieA }, 'DELETE')).status, 200);
      assert.equal((await call('/api/board', { cookie: cookieA })).status, 401);
      assert.equal((await call('/api/board', { cookie: cookieB })).body.owner, 'bob');
      assert.equal(
        (await call('/api/session', { origin: 'https://evil.example' }, 'POST', {})).status,
        403,
      );
      assert.equal(
        (await call('/api/session', { 'x-flowboard-request': '' }, 'POST', {})).status,
        403,
      );
    },
    {
      autoLogin: false,
      clientFactory: (config) =>
        Object.assign(async () => ({ owner: config.pat.split('-')[0] }), {
          projects: async () => ({ value: [{ id: 'p', name: 'Project' }] }),
          teams: async () => ({ value: [{ id: 't', name: 'Team' }] }),
          sprints: async () => ({ value: [] }),
        }),
    },
  );
});
test('sessions expire and production requires HTTPS origin', async () => {
  let time = 1000;
  await withServer(
    async () => ({ ok: true }),
    async (call) => {
      assert.equal((await call()).status, 200);
      time += 101;
      assert.equal((await call()).status, 401);
      assert.deepEqual((await call('/api/session')).body, { authenticated: false });
    },
    { now: () => time, idleMs: 100 },
  );
  assert.throws(() => createServer({ production: true, publicOrigin: '' }));
  assert.throws(() => createServer({ production: true, publicOrigin: 'http://flowboard.example' }));
});
test('invalid links and login failures do not create sessions or disclose PATs', async () => {
  await withServer(
    () => {},
    async (call) => {
      assert.equal(
        (
          await call('/api/session', {}, 'POST', {
            boardUrl: 'https://evil.example/Org/P',
            pat: 'secret',
          })
        ).status,
        400,
      );
      const failed = await call('/api/session', {}, 'POST', {
        boardUrl: 'https://dev.azure.com/Org/P',
        pat: 'secret',
      });
      assert.equal(failed.status, 500);
      assert.equal(JSON.stringify(failed).includes('secret'), false);
      assert.equal((await call()).status, 401);
    },
    {
      autoLogin: false,
      clientFactory: () => {
        throw new Error('secret');
      },
    },
  );
});

test('public deployments set a secure session cookie and reject other origins', async () => {
  await withServer(
    () => {},
    async (call) => {
      const headers = { host: 'flowboard.example', origin: 'https://flowboard.example' };
      const login = await call('/api/session', headers, 'POST', {
        boardUrl: 'https://dev.azure.com/PagesWeb/Pages',
        pat: 'fake',
      });
      assert.equal(login.status, 200);
      assert.match(
        login.headers['set-cookie'][0],
        /^__Host-flowboard=.*; Path=\/; HttpOnly; SameSite=Strict; Secure$/,
      );
      assert.equal((await call('/api/session')).status, 403);
    },
    { autoLogin: false, production: true, publicOrigin: 'https://flowboard.example' },
  );
});
test('limits repeated login attempts before making further Azure calls', async () => {
  let calls = 0;
  await withServer(
    () => {},
    async (call) => {
      for (let i = 0; i < 10; i++)
        await call('/api/session', {}, 'POST', {
          boardUrl: 'https://dev.azure.com/Org/P',
          pat: 'fake',
        });
      assert.equal(
        (
          await call('/api/session', {}, 'POST', {
            boardUrl: 'https://dev.azure.com/Org/P',
            pat: 'fake',
          })
        ).status,
        429,
      );
      assert.equal(calls, 10);
    },
    {
      autoLogin: false,
      clientFactory: () => {
        calls++;
        throw new Error('No access');
      },
    },
  );
});
