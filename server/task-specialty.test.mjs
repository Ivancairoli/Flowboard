import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyTask } from './task-specialty.mjs';
import { mapStory } from './azure.mjs';

test('recognizes only the three exact specialty tags, ignoring case, spaces and duplicates', () => {
  for (const specialty of ['Frontend', 'Backend', 'Testing']) {
    assert.deepEqual(
      classifyTask(` urgent ; ${specialty.toUpperCase()} ; ${specialty.toLowerCase()} `),
      { specialty, classificationIssue: null },
    );
  }
  for (const tags of [undefined, '', 'FE; BE; QA', 'Frontend-extra', 'Backend API']) {
    assert.deepEqual(classifyTask(tags), { specialty: null, classificationIssue: 'missing' });
  }
  assert.deepEqual(classifyTask('Frontend;Backend;Testing'), {
    specialty: null,
    classificationIssue: 'multiple',
  });
});

test('reads each child task tags without inheriting the parent or changing progress', () => {
  const story = {
    id: 1,
    fields: {
      'System.WorkItemType': 'User Story',
      'System.State': 'Active',
      'System.Tags': 'Frontend',
    },
  };
  const tasks = ['Frontend', 'Backend', 'Testing', 'Backend;Testing', null].map((tags, index) => ({
    id: index + 2,
    fields: {
      'System.Title': 'Task',
      'System.WorkItemType': 'Task',
      'System.State': index === 0 ? 'Done' : 'Active',
      'System.Tags': tags,
    },
  }));
  const states = new Map([
    [
      'Task',
      [
        { name: 'Done', category: 'Completed' },
        { name: 'Active', category: 'InProgress' },
      ],
    ],
  ]);
  const mapped = mapStory(
    story,
    tasks,
    states,
    { projectUrl: 'https://dev.azure.com/test/project', project: 'project', iteration: 'Sprint 1' },
    { Active: 'En desarrollo' },
  );
  assert.deepEqual(
    mapped.tasks.map((task) => task.specialty),
    ['Frontend', 'Backend', 'Testing', null, null],
  );
  assert.equal(mapped.tasks[3].classificationIssue, 'multiple');
  assert.equal(mapped.tasks[4].classificationIssue, 'missing');
  assert.equal(mapped.progress, 20);
});
