import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAzureClient } from './azure.mjs';
import { validateHoursRequest } from './task-hours.mjs';

const input = { project: 'Pages', storyId: 1, taskId: 2, confirmed: true };
function setup(estimate = 4, completed = 0) {
  const story = {
    id: 1,
    fields: { 'System.TeamProject': 'Pages' },
    relations: [
      {
        rel: 'System.LinkTypes.Hierarchy-Forward',
        url: 'https://dev.azure.com/o/_apis/wit/workItems/2',
      },
    ],
  };
  const task = {
    id: 2,
    rev: 3,
    fields: {
      'System.TeamProject': 'Pages',
      'System.WorkItemType': 'Tarea',
      'Microsoft.VSTS.Scheduling.OriginalEstimate': estimate,
      'Microsoft.VSTS.Scheduling.CompletedWork': completed,
    },
  };
  const writes = [];
  const json = (data) =>
    new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });
  const client = createAzureClient(
    { organization: 'o', project: 'Other', pat: 'fake' },
    {},
    async (url, options) => {
      assert.ok(url.includes('/Pages/'));
      if (url.includes('/workitemsbatch?')) return json({ value: [story, task] });
      assert.ok(url.includes('/workitems/2?'));
      assert.equal(options.method, 'PATCH');
      assert.equal(options.headers['Content-Type'], 'application/json-patch+json');
      const patch = JSON.parse(options.body);
      writes.push(patch);
      task.fields['Microsoft.VSTS.Scheduling.CompletedWork'] = patch[1].value;
      return json(task);
    },
  );
  return { client, story, task, writes };
}
test('registers fresh estimates once using PATCH and a revision guard, including zero and decimals', async () => {
  for (const estimate of [0, 4, 1.5]) {
    const { client, task, writes } = setup(estimate, 8);
    assert.deepEqual(await client.registerHours(input), { taskId: 2, completedHours: estimate });
    assert.deepEqual(writes[0], [
      { op: 'test', path: '/rev', value: 3 },
      { op: 'add', path: '/fields/Microsoft.VSTS.Scheduling.CompletedWork', value: estimate },
    ]);
    await client.registerHours(input);
    assert.equal(writes.length, 1);
    task.fields['Microsoft.VSTS.Scheduling.OriginalEstimate'] = 6;
    assert.equal((await client.registerHours(input)).completedHours, 6);
  }
});
test('rejects invalid requests, missing estimates and tasks outside the selected story or project', async () => {
  for (const invalid of [
    null,
    {},
    { ...input, confirmed: false },
    { ...input, project: '../Other' },
    { ...input, taskId: -1 },
  ])
    assert.throws(() => validateHoursRequest(invalid));
  for (const estimate of [null, -1, '4']) {
    const { client, writes } = setup(estimate);
    await assert.rejects(client.registerHours(input), { code: 'ESTIMATE_MISSING' });
    assert.equal(writes.length, 0);
  }
  for (const mutate of [
    ({ story }) => {
      story.relations = [];
    },
    ({ task }) => {
      task.fields['System.TeamProject'] = 'Other';
    },
    ({ task }) => {
      task.fields['System.WorkItemType'] = 'Bug';
    },
  ]) {
    const fixture = setup();
    mutate(fixture);
    await assert.rejects(fixture.client.registerHours(input), { code: 'INVALID_TASK' });
    assert.equal(fixture.writes.length, 0);
  }
});
