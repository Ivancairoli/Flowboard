import { StoryTask, TaskSpecialty } from './story';

export const TASK_SPECIALTIES: TaskSpecialty[] = ['Frontend', 'Backend', 'Testing'];

export function groupTasks(tasks: StoryTask[]) {
  return TASK_SPECIALTIES.map((name) => {
    const members = tasks.filter((task) => task.specialty === name);
    const completed = members.filter((task) => task.completed).length;
    const assignees = [
      ...new Map(
        members
          .flatMap((task) => (task.assignee ? [task.assignee] : []))
          .map((person) => [person.id, person]),
      ).values(),
    ];
    const unassigned = members.filter((task) => !task.assignee).length;
    return {
      name,
      tasks: members,
      completed,
      assignees,
      unassigned,
      progress: members.length ? Math.round((completed * 100) / members.length) : null,
      description: members.length
        ? `${completed} de ${members.length} tareas completadas. ${assignees.map((person) => person.fullName).join(', ')}${unassigned ? ' · ' + unassigned + ' sin asignar' : ''}`
        : `Sin tareas de ${name}`,
    };
  });
}
