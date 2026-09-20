import { groupTasks } from './task-specialty';
import { StoryTask } from './story';

describe('Task specialty summaries', () => {
  it('counts each specialty separately and retains all assignees and missing assignments', () => {
    const person = { id: 'ana', name: 'Ana', fullName: 'Ana Pérez', initials: 'AP' };
    const tasks: StoryTask[] = [
      {
        id: 1,
        title: 'UI',
        state: 'Done',
        completed: true,
        deployedToTesting: false,
        assignee: person,
        specialty: 'Frontend',
        classificationIssue: null,
        url: '',
      },
      {
        id: 2,
        title: 'UI 2',
        state: 'Active',
        completed: false,
        deployedToTesting: false,
        assignee: person,
        specialty: 'Frontend',
        classificationIssue: null,
        url: '',
      },
      {
        id: 3,
        title: 'API',
        state: 'Active',
        completed: false,
        deployedToTesting: false,
        assignee: null,
        specialty: 'Backend',
        classificationIssue: null,
        url: '',
      },
      {
        id: 4,
        title: 'Other',
        state: 'Done',
        completed: true,
        deployedToTesting: false,
        assignee: person,
        specialty: null,
        classificationIssue: 'missing',
        url: '',
      },
    ];
    const groups = groupTasks(tasks);
    expect(groups.map((g) => g.name)).toEqual(['Frontend', 'Backend', 'Testing']);
    expect(groups.map((g) => g.progress)).toEqual([50, 0, null]);
    expect(groups[0].assignees).toHaveLength(1);
    expect(groups[1].unassigned).toBe(1);
    expect(groups[2].description).toBe('Sin tareas de Testing');
  });
});
