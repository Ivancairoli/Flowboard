import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseBoardUrl } from './session.mjs';

test('extracts taskboard scope and accepts project and board links', () => {
  assert.deepEqual(
    parseBoardUrl(
      'https://dev.azure.com/PagesWeb/Pages/_sprints/taskboard/Pages%20Team/Pages/Sprint%201',
    ),
    {
      organization: 'PagesWeb',
      project: 'Pages',
      team: 'Pages Team',
      iteration: 'Pages/Sprint 1',
    },
  );
  assert.equal(
    parseBoardUrl('https://dev.azure.com/Org/Project/_boards/board/t/My%20Team/Stories').team,
    'My Team',
  );
  assert.equal(parseBoardUrl('https://dev.azure.com/Org/Project').project, 'Project');
});
test('rejects arbitrary upstreams and malformed scope', () => {
  for (const link of [
    'http://dev.azure.com/Org/P',
    'https://dev.azure.com.evil.test/Org/P',
    'https://user:pass@dev.azure.com/Org/P',
    'https://dev.azure.com/Org',
    'https://dev.azure.com/Org/%ZZ',
    'https://dev.azure.com/Org/P/_apis/foo',
    'https://dev.azure.com/Org/P%2Fother',
  ])
    assert.throws(() => parseBoardUrl(link), { code: 'INVALID_BOARD_URL' });
});
