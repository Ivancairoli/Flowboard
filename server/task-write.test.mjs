import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createAzureClient } from './azure.mjs';
import { validateTaskRequest } from './task-write.mjs';

const task = (title = 'Modificar modelo') => ({
  id: randomUUID(),
  title,
  description: 'Regla <script> & validación\nOtra línea',
  specialty: 'Frontend',
  assignee: '',
});
const input = (tasks = [task()]) => ({ project: 'Pages', storyId: 1, confirmed: true, tasks });
const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
function fixture({ existing = [], create, parentFields = {}, organization = randomUUID() } = {}) {
  const parent = {
    id: 1,
    fields: {
      'System.TeamProject': 'Pages',
      'System.WorkItemType': 'User Story',
      'System.AreaPath': 'Pages\\Area',
      'System.IterationPath': 'Pages\\Sprint 2',
      ...parentFields,
    },
    relations: existing.map((item) => ({
      rel: 'System.LinkTypes.Hierarchy-Forward',
      url: `https://dev.azure.com/test/_apis/wit/workitems/${item.id}`,
    })),
  };
  const writes = [];
  const load = createAzureClient(
    { organization, project: 'Pages', team: 'Team', pat: 'private-fake-pat' },
    {},
    async (url, options) => {
      assert.equal(new URL(url).hostname, 'dev.azure.com');
      if (url.includes('/workitemsbatch?')) {
        const body = JSON.parse(options.body);
        return json({
          value: body.ids.map((id) =>
            id === 1 ? parent : existing.find((item) => item.id === id),
          ),
        });
      }
      if (url.includes('/Task/states?'))
        return json({ value: [{ name: 'Removed', category: 'Removed' }] });
      if (url.includes('/workitems/$Task?')) {
        assert.equal(options.method, 'POST');
        assert.equal(options.headers['Content-Type'], 'application/json-patch+json');
        const patch = JSON.parse(options.body);
        writes.push(patch);
        return create ? create(patch, writes.length) : json({ id: 100 + writes.length });
      }
      throw new Error('Unexpected request');
    },
  );
  return { load, writes, parent, existing };
}

test('creation inherits scope, safely renders descriptions, sets specialty and parent without deployment tag', async () => {
  const { load, writes } = fixture();
  const draft = task();
  draft.assignee = 'ana@example.test';
  const payload = input([draft]);
  const result = await load.createTasks(payload);
  assert.equal(result.results[0].status, 'created');
  const fields = Object.fromEntries(writes[0].map((op) => [op.path, op.value]));
  assert.equal(fields['/fields/System.AreaPath'], 'Pages\\Area');
  assert.equal(fields['/fields/System.IterationPath'], 'Pages\\Sprint 2');
  assert.equal(fields['/fields/System.AssignedTo'], 'ana@example.test');
  assert.equal(fields['/fields/System.Tags'], `Frontend; FlowBoard-${draft.id}`);
  assert.equal(
    fields['/fields/System.Description'],
    'Regla &lt;script&gt; &amp; validación<br>Otra línea',
  );
  assert.equal(fields['/relations/-'].rel, 'System.LinkTypes.Hierarchy-Reverse');
  assert.ok(fields['/relations/-'].url.endsWith('/_apis/wit/workItems/1'));
  assert.equal(fields['/fields/System.State'], undefined);
  const again = await load.createTasks(payload);
  assert.equal(again.results[0].status, 'existing');
  assert.equal(writes.length, 1);
  assert.equal(JSON.stringify(result).includes('private-fake-pat'), false);
});

test('rejects unconfirmed, oversized, duplicate IDs and invalid drafts before writing', () => {
  const valid = input();
  assert.equal(validateTaskRequest(valid), valid);
  for (const invalid of [
    null,
    {},
    { ...valid, confirmed: false },
    { ...valid, project: '../Pages' },
    { ...valid, storyId: -1 },
    { ...valid, tasks: [] },
    { ...valid, tasks: Array.from({ length: 31 }, () => task()) },
    { ...valid, tasks: [valid.tasks[0], valid.tasks[0]] },
    ...[
      { title: '' },
      { title: 'x'.repeat(256) },
      { specialty: 'En Testing' },
      { assignee: '\r\n' },
      { description: 'x'.repeat(10001) },
      { id: 'invalid' },
    ].map((change) => ({ ...valid, tasks: [{ ...valid.tasks[0], ...change }] })),
  ]) {
    assert.throws(() => validateTaskRequest(invalid), { code: 'INVALID_TASKS' });
  }
});

test('rejects wrong project and unsupported parent without writes', async () => {
  for (const parentFields of [
    { 'System.TeamProject': 'Other' },
    { 'System.WorkItemType': 'Task' },
    { 'System.AreaPath': '' },
  ]) {
    const { load, writes } = fixture({ parentFields });
    await assert.rejects(load.createTasks(input()));
    assert.equal(writes.length, 0);
  }
});

test('skips normalized duplicate titles, creates only once within a batch and omits blank assignees', async () => {
  const { load, writes } = fixture({
    existing: [
      { id: 7, fields: { 'System.WorkItemType': 'Task', 'System.Title': '  MODIFICAR   MODELO ' } },
    ],
  });
  const result = await load.createTasks(
    input([task(), task('Crear servicio'), task('Crear servicio')]),
  );
  assert.deepEqual(
    result.results.map((r) => r.status),
    ['duplicate', 'created', 'duplicate'],
  );
  assert.equal(writes.length, 1);
  assert.ok(!writes[0].some((op) => op.path === '/fields/System.AssignedTo'));
});

test('recovers by operation tag using a fresh client without repeating the write', async () => {
  const draft = task();
  const { load, writes } = fixture({
    existing: [
      {
        id: 7,
        fields: {
          'System.WorkItemType': 'Task',
          'System.Title': 'Renamed',
          'System.Tags': `Frontend; FlowBoard-${draft.id}`,
        },
      },
    ],
  });
  const result = await load.createTasks(input([draft]));
  assert.equal(result.results[0].status, 'existing');
  assert.equal(result.results[0].id, 7);
  assert.equal(writes.length, 0);
});

test('partial failure preserves created tasks and retries only known failures and unsent tasks', async () => {
  const { load, writes } = fixture({
    create: (_patch, count) => (count === 2 ? json({}, 403) : json({ id: count + 100 })),
  });
  const payload = input([task('Uno'), task('Dos'), task('Tres')]);
  const first = await load.createTasks(payload);
  assert.deepEqual(
    first.results.map((r) => r.status),
    ['created', 'failed', 'pending'],
  );
  assert.match(first.results[1].error, /Read & write/);
  const retry = await load.createTasks(payload);
  assert.deepEqual(
    retry.results.map((r) => r.status),
    ['existing', 'created', 'created'],
  );
  assert.equal(writes.length, 4);
});

test('uncertain responses are never blindly retried and changed payload IDs are rejected', async () => {
  const { load, writes } = fixture({
    create: () => {
      throw new Error('private-fake-pat');
    },
  });
  const payload = input([task('Uno'), task('Dos')]);
  for (let i = 0; i < 2; i++) {
    const result = await load.createTasks(payload);
    assert.deepEqual(
      result.results.map((r) => r.status),
      ['unknown', 'pending'],
    );
    assert.ok(!JSON.stringify(result).includes('private-fake-pat'));
  }
  assert.equal(writes.length, 1);
  const changed = await load.createTasks({
    ...payload,
    tasks: [{ ...payload.tasks[0], title: 'Changed' }],
  });
  assert.equal(changed.results[0].status, 'failed');
  assert.equal(writes.length, 1);
});

test('concurrent submissions for the same story cannot create duplicate tasks', async () => {
  let release;
  const barrier = new Promise((resolve) => {
    release = resolve;
  });
  let started;
  const writing = new Promise((resolve) => {
    started = resolve;
  });
  const { load, writes } = fixture({
    create: async () => {
      started();
      await barrier;
      return json({ id: 900 });
    },
  });
  const payload = input();
  const first = load.createTasks(payload);
  await writing;
  await assert.rejects(load.createTasks(payload), { code: 'TASKS_BUSY' });
  release();
  await first;
  assert.equal(writes.length, 1);
});
