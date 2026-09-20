import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createAzureClient, mapStory, ConnectionError } from './azure.mjs';

const config = {
  pat: 'test-token-not-real',
  organization: 'PagesWeb',
  project: 'Pages',
  team: 'Pages Team',
  iteration: 'Pages/Sprint 1',
  projectUrl: 'https://dev.azure.com/PagesWeb/Pages',
};
const stateMap = JSON.parse(readFileSync(new URL('./state-map.json', import.meta.url), 'utf8'));
const states = new Map([
  [
    'User Story',
    [
      { name: 'Active', category: 'InProgress' },
      { name: 'Closed', category: 'Completed' },
    ],
  ],
  [
    'Task',
    [
      { name: 'Done', category: 'Completed' },
      { name: 'Active', category: 'InProgress' },
      { name: 'Removed', category: 'Removed' },
      { name: 'New', category: 'Proposed' },
      { name: 'Resolved', category: 'Resolved' },
    ],
  ],
]);
const item = (id, type, state, extra = {}) => ({
  id,
  fields: {
    'System.WorkItemType': type,
    'System.Title': `Item ${id}`,
    'System.State': state,
    ...extra,
  },
  relations: [],
});
const json = (value) =>
  new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } });

test('maps actual assignees, completed tasks, missing data and unknown states', () => {
  const story = item(1, 'User Story', 'Active', {
    'System.AssignedTo': { id: 'a', displayName: 'Ana Pérez' },
  });
  const tasks = [
    item(2, 'Task', 'Done', { 'System.AssignedTo': { id: 'b', displayName: 'Luis Díaz' } }),
    item(3, 'Task', 'Active'),
    item(4, 'Task', 'Removed'),
  ];
  const mapped = mapStory(story, tasks, states, config, stateMap);
  assert.equal(mapped.progress, 50);
  assert.equal(mapped.stage, 'En desarrollo');
  assert.deepEqual(
    mapped.participants.map((p) => p.id),
    ['a', 'b'],
  );
  assert.equal(mapped.tasks[1].assignee, null);
  assert.equal(
    mapStory(item(1, 'User Story', 'Custom'), [], states, config, stateMap).stage,
    'Sin comenzar',
  );
  assert.equal(mapStory(story, [], states, config, stateMap).progress, null);
  const blocked = mapStory(item(1, 'User Story', 'Blocked'), [], states, config, stateMap);
  assert.equal(blocked.blocked, true);
  assert.equal(blocked.stage, 'Sin comenzar');
});

test('derives development from tasks regardless of the parent state', () => {
  for (const parentState of ['Active', 'New', 'Closed', 'Custom']) {
    const root = item(1, 'User Story', parentState);
    const task = (id, state, specialty) => item(id, 'Task', state, { 'System.Tags': specialty });
    const map = (tasks) => mapStory(root, tasks, states, config, stateMap);
    assert.equal(map([]).stage, 'Sin comenzar');
    assert.equal(map([task(2, 'Removed', 'Frontend')]).stage, 'Sin comenzar');
    assert.equal(
      map([task(2, 'New', 'Frontend'), task(3, 'New', 'Backend')]).stage,
      'Sin comenzar',
    );
    for (const started of ['Active', 'Resolved', 'Done']) {
      const result = map([task(2, started, 'Frontend'), task(3, 'New', 'Backend')]);
      assert.equal(result.stage, 'En desarrollo');
      assert.equal(result.status, 'En desarrollo');
      assert.equal(result.tone, 'amber');
      assert.equal(result.azureState, parentState);
    }
  }
});

test('completed development is ready for testing even with pending testing tasks', () => {
  const root = item(1, 'User Story', 'Active');
  const task = (id, state, specialty) => item(id, 'Task', state, { 'System.Tags': specialty });
  const tasks = [
    task(2, 'Done', 'Frontend'),
    task(3, 'Done', 'Backend'),
    task(4, 'New', 'Testing'),
  ];
  const map = (children) => mapStory(root, children, states, config, stateMap);
  const ready = map(tasks);
  assert.equal(ready.stage, 'Para Testing');
  assert.equal(ready.status, 'Para Testing');
  assert.equal(ready.tone, 'blue');
  assert.equal(ready.progress, 67);
  assert.equal(map([...tasks, task(5, 'Removed', 'Backend')]).stage, 'Para Testing');
  assert.equal(map([task(2, 'Done', 'Frontend')]).stage, 'Para Testing');
  assert.equal(map([...tasks, task(5, 'New', undefined)]).stage, 'En desarrollo');
  assert.equal(map([...tasks, task(5, 'New', 'Frontend;Testing')]).stage, 'En desarrollo');
  assert.equal(map([task(2, 'Active', 'Frontend'), ...tasks.slice(1)]).stage, 'En desarrollo');
});

test('testing tasks drive validation and completion, including reopened tasks', () => {
  const task = (id, state, specialty) =>
    item(id, 'Task', state, {
      'System.Tags': specialty === 'Testing' && state !== 'New' ? 'Testing; En Testing' : specialty,
    });
  const development = [task(2, 'Done', 'Frontend'), task(3, 'Done', 'Backend')];
  for (const parentState of ['New', 'Active', 'Testing', 'Closed', 'Custom']) {
    const map = (tasks) =>
      mapStory(item(1, 'User Story', parentState), tasks, states, config, stateMap);
    assert.equal(map(development).stage, 'Para Testing');
    assert.equal(map([...development, task(4, 'New', 'Testing')]).stage, 'Para Testing');
    for (const state of ['Active', 'Resolved']) {
      assert.equal(map([...development, task(4, state, 'Testing')]).stage, 'En testing');
    }
    assert.equal(
      map([...development, task(4, 'Done', 'Testing'), task(5, 'New', 'Testing')]).stage,
      'En testing',
    );
    const finished = map([...development, task(4, 'Done', 'Testing')]);
    assert.equal(finished.stage, 'Finalizadas');
    assert.equal(finished.status, 'Finalizadas');
    assert.equal(finished.tone, 'green');
    assert.equal(finished.progress, 100);
    assert.equal(
      map([...development, task(4, 'Done', 'Testing'), task(5, 'Active', 'Backend')]).stage,
      'En testing',
    );
    assert.equal(map([task(4, 'New', 'Testing')]).stage, 'Sin comenzar');
    assert.equal(map([task(4, 'Active', 'Testing')]).stage, 'En testing');
    assert.equal(map([task(4, 'Done', 'Testing')]).stage, 'Finalizadas');
    assert.equal(map([...development, task(4, 'Removed', 'Testing')]).stage, 'Para Testing');
  }
});

test('deployment tag gates testing independently of task state and is read only from testing tasks', () => {
  const root = item(1, 'User Story', 'Testing', { 'System.Tags': 'En Testing' });
  const task = (id, state, tags) => item(id, 'Task', state, { 'System.Tags': tags });
  const development = [task(2, 'Done', 'Frontend'), task(3, 'Done', 'Backend')];
  const map = (tasks) => mapStory(root, tasks, states, config, stateMap);
  for (const state of ['New', 'Active', 'Resolved']) {
    assert.equal(map([...development, task(4, state, 'Testing')]).stage, 'Para Testing');
    const deployed = map([...development, task(4, state, 'Testing; En Testing')]);
    assert.equal(deployed.stage, 'En testing');
    assert.equal(deployed.tasks[2].deployedToTesting, true);
    assert.equal(deployed.progress, 67);
  }
  for (const tags of ['Testing; en testing', 'Testing; EN TESTING ; Urgente; En Testing']) {
    assert.equal(map([...development, task(4, 'New', tags)]).stage, 'En testing');
  }
  for (const tags of ['Testing', 'Testing; En Testing pendiente', 'Testing; Pre En Testing']) {
    assert.equal(map([...development, task(4, 'Active', tags)]).stage, 'Para Testing');
  }
  for (const tags of [
    'Frontend; En Testing',
    'Backend; En Testing',
    'En Testing',
    'Frontend; Testing; En Testing',
  ]) {
    const result = map([...development, task(4, 'New', 'Testing'), task(5, 'Done', tags)]);
    assert.equal(result.stage, 'Para Testing');
    assert.equal(result.tasks[3].deployedToTesting, false);
  }
  assert.equal(
    map([...development, task(4, 'Removed', 'Testing; En Testing')]).stage,
    'Para Testing',
  );
  assert.equal(map([...development, task(4, 'Done', 'Testing')]).stage, 'Finalizadas');
  assert.equal(
    map([task(2, 'New', 'Frontend'), task(3, 'New', 'Backend'), task(4, 'New', 'Testing')]).stage,
    'Sin comenzar',
  );
});

test('loads the exact team iteration and fetches child tasks in batches of at most 200', async () => {
  const root = item(1, 'User Story', 'Active');
  root.relations = Array.from({ length: 201 }, (_, i) => ({
    rel: 'System.LinkTypes.Hierarchy-Forward',
    url: `https://dev.azure.com/PagesWeb/_apis/wit/workItems/${i + 2}`,
  }));
  const sizes = [];
  const fakeFetch = async (url, options) => {
    assert.equal(new URL(url).hostname, 'dev.azure.com');
    assert.equal(
      options.headers.Authorization,
      `Basic ${Buffer.from(':' + config.pat).toString('base64')}`,
    );
    if (url.includes('/iterations?')) {
      assert.ok(url.includes('/Pages%20Team/'));
      return json({ value: [{ id: 'sprint-id', path: 'Pages\\Sprint 1', name: 'Sprint 1' }] });
    }
    if (url.includes('/iterations/sprint-id/workitems?'))
      return json({ workItemRelations: [{ source: null, target: { id: 1 } }] });
    if (url.includes('/workitemsbatch?')) {
      assert.equal(options.method, 'POST');
      const body = JSON.parse(options.body);
      sizes.push(body.ids.length);
      return json({ value: body.ids.map((id) => (id === 1 ? root : item(id, 'Task', 'Done'))) });
    }
    if (url.includes('/workitemtypes/User%20Story/states?'))
      return json({ value: states.get('User Story') });
    if (url.includes('/workitemtypes/Task/states?')) return json({ value: states.get('Task') });
    throw new Error('Unexpected URL');
  };
  const result = await createAzureClient(config, stateMap, fakeFetch)();
  assert.deepEqual(sizes, [1, 200, 1]);
  assert.equal(result.stories[0].tasks.length, 201);
  assert.equal(result.stories[0].progress, 100);
  assert.equal(result.stories[0].stage, 'Para Testing');
  assert.equal(JSON.stringify(result).includes(config.pat), false);
});

test('loads child and related bugs outside the sprint, deduplicates and preserves task progress', async () => {
  const root = item(1, 'User Story', 'Active');
  const link = (id, rel) => ({
    rel,
    url: `https://dev.azure.com/PagesWeb/_apis/wit/workItems/${id}`,
  });
  root.relations = [
    link(2, 'System.LinkTypes.Hierarchy-Forward'),
    link(3, 'System.LinkTypes.Hierarchy-Forward'),
    link(3, 'System.LinkTypes.Related'),
    ...[4, 5, 6, 7, 8].map((id) => link(id, 'System.LinkTypes.Related')),
    link(99, 'System.LinkTypes.Dependency-Forward'),
  ];
  const records = [
    root,
    item(2, 'Task', 'Done'),
    item(3, 'Bug', 'Active'),
    item(4, 'Bug', 'Closed'),
    item(5, 'Bug', 'Removed'),
    item(6, 'Bug', 'Resolved'),
    item(7, 'Bug', 'Custom'),
    item(8, 'Task', 'Active'),
  ];
  const load = createAzureClient(config, stateMap, async (url, options) => {
    if (url.includes('/iterations?'))
      return json({ value: [{ id: 's', path: config.iteration, name: 'Sprint 1' }] });
    if (url.includes('/workitems?')) return json({ workItemRelations: [{ target: { id: 1 } }] });
    if (url.includes('/workitemsbatch?')) {
      const ids = JSON.parse(options.body).ids;
      assert.equal(new Set(ids).size, ids.length);
      assert.ok(!ids.includes(99));
      return json({ value: ids.map((id) => records.find((record) => record.id === id)) });
    }
    if (url.includes('/Bug/states?'))
      return json({
        value: [
          { name: 'Active', category: 'InProgress' },
          { name: 'Closed', category: 'Completed' },
          { name: 'Removed', category: 'Removed' },
          { name: 'Resolved', category: 'Resolved' },
        ],
      });
    if (url.includes('/Task/states?')) return json({ value: states.get('Task') });
    if (url.includes('/User%20Story/states?')) return json({ value: states.get('User Story') });
    throw new Error('Unexpected URL');
  });
  const result = await load();
  const story = result.stories[0];
  assert.equal(result.stories.length, 1);
  assert.equal(story.bugCount, 4);
  assert.equal(story.openBugCount, 3);
  assert.deepEqual(
    story.bugs.map((bug) => bug.id),
    [3, 4, 6, 7],
  );
  assert.equal(story.bugs[1].completed, true);
  assert.equal(story.bugs[0].url, config.projectUrl + '/_workitems/edit/3');
  assert.equal(story.tasks.length, 1);
  assert.equal(story.progress, 100);
  assert.equal(story.stage, 'Para Testing');
  const empty = mapStory(root, [], states, config, stateMap);
  assert.deepEqual(empty.bugs, []);
  assert.equal(empty.bugCount, 0);
  assert.equal(empty.openBugCount, 0);
});

test('returns safe errors for missing tokens, expired tokens, permissions and network errors', async () => {
  await assert.rejects(
    createAzureClient({ ...config, pat: '' }, stateMap, () => assert.fail('must not call Azure'))(),
    { code: 'TOKEN_MISSING' },
  );
  for (const status of [401, 403, 404, 429, 500]) {
    await assert.rejects(
      createAzureClient(config, stateMap, async () => new Response(config.pat, { status }))(),
      (error) => error instanceof ConnectionError && !error.message.includes(config.pat),
    );
  }
  await assert.rejects(
    createAzureClient(config, stateMap, async () => {
      throw new Error(config.pat);
    })(),
    { code: 'AZURE_UNREACHABLE' },
  );
  await assert.rejects(createAzureClient(config, stateMap, async () => json({ value: [] }))(), {
    code: 'SPRINT_NOT_FOUND',
  });
});

test('an empty sprint is a successful connection with no fabricated stories', async () => {
  const result = await createAzureClient(config, stateMap, async (url) =>
    url.includes('/iterations?')
      ? json({ value: [{ id: 'empty', name: 'Sprint 1', path: 'Pages\\Sprint 1' }] })
      : json({ workItemRelations: [] }),
  )();
  assert.deepEqual(result.stories, []);
  assert.ok(result.syncedAt);
});

test('combines selected sprints from another project without duplicate stories', async () => {
  const load = createAzureClient(config, stateMap, async (url, options) => {
    assert.ok(url.includes('/Other/'));
    if (url.includes('/iterations?'))
      return json({
        value: [
          { id: 'a', name: 'Past', path: 'Other/Past' },
          { id: 'b', name: 'Future', path: 'Other/Future' },
        ],
      });
    if (url.includes('/workitems?')) return json({ workItemRelations: [{ target: { id: 1 } }] });
    if (url.includes('/workitemsbatch?')) {
      assert.deepEqual(JSON.parse(options.body).ids, [1]);
      return json({
        value: [item(1, 'User Story', 'Active', { 'System.IterationPath': 'Other/Past' })],
      });
    }
    if (url.includes('/states?')) return json({ value: states.get('User Story') });
    throw new Error('Unexpected URL');
  });
  const result = await load({ project: 'Other', team: 'Other Team', sprints: ['a', 'b'] });
  assert.equal(result.stories.length, 1);
  assert.equal(result.context.sprints.length, 2);
  assert.equal(result.stories[0].project, 'Other');
  assert.ok(result.stories[0].url.includes('/Other/'));
  await assert.rejects(load({ project: 'Other', team: 'Other Team', sprints: ['missing'] }), {
    code: 'SPRINT_NOT_FOUND',
  });
});
test('catalog paginates projects and returns past, current and future team sprints', async () => {
  let page = 0;
  const load = createAzureClient(config, stateMap, async (url) => {
    if (url.includes('/_apis/projects?')) {
      page++;
      if (page === 1)
        return new Response(JSON.stringify({ value: [{ id: '1', name: 'First' }] }), {
          headers: { 'x-ms-continuationtoken': 'next' },
        });
      assert.ok(url.includes('continuationToken=next'));
      return json({ value: [{ id: '2', name: 'Second' }] });
    }
    if (url.includes('/teams?')) return json({ value: [{ id: 't', name: 'Team' }] });
    return json({
      value: ['past', 'current', 'future'].map((timeFrame, i) => ({
        id: String(i),
        name: timeFrame,
        path: timeFrame,
        attributes: { timeFrame },
      })),
    });
  });
  assert.equal((await load.projects()).value.length, 2);
  assert.equal((await load.teams('First')).value[0].name, 'Team');
  assert.deepEqual(
    new Set((await load.sprints('First', 'Team')).value.map((s) => s.timeFrame)),
    new Set(['past', 'current', 'future']),
  );
});
