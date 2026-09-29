import { ConnectionError } from './azure.mjs';

export function validateHoursRequest(input) {
  if (
    !input ||
    input.confirmed !== true ||
    typeof input.project !== 'string' ||
    !input.project.trim() ||
    input.project.length > 300 ||
    /[\\/\x00-\x1f]/.test(input.project) ||
    ['.', '..'].includes(input.project) ||
    !Number.isSafeInteger(input.storyId) ||
    input.storyId < 1 ||
    !Number.isSafeInteger(input.taskId) ||
    input.taskId < 1
  ) {
    throw new ConnectionError('INVALID_HOURS', 'Proyecto, historia y tarea inválidos.', 400);
  }
  return input;
}

export function createHoursWriter({ projectUrl, request, batch }) {
  return async (input) => {
    validateHoursRequest(input);
    const items = await batch([input.storyId, input.taskId]);
    const story = items.find((item) => item.id === input.storyId);
    const task = items.find((item) => item.id === input.taskId);
    const normalize = (value) =>
      String(value || '')
        .trim()
        .toLowerCase();
    if (
      !story ||
      !task ||
      [story, task].some(
        (item) => normalize(item.fields['System.TeamProject']) !== normalize(input.project),
      ) ||
      !['task', 'tarea'].includes(normalize(task.fields['System.WorkItemType'])) ||
      !(story.relations || []).some(
        (r) =>
          r.rel === 'System.LinkTypes.Hierarchy-Forward' &&
          Number(r.url.split('/').pop()) === task.id,
      )
    ) {
      throw new ConnectionError(
        'INVALID_TASK',
        'La tarea no pertenece a esta historia y proyecto.',
        400,
      );
    }
    const estimate = task.fields['Microsoft.VSTS.Scheduling.OriginalEstimate'];
    if (typeof estimate !== 'number' || !Number.isFinite(estimate) || estimate < 0) {
      throw new ConnectionError(
        'ESTIMATE_MISSING',
        'La tarea necesita una estimación original válida en Azure.',
        400,
      );
    }
    const metadata = await request(
      `${projectUrl}/_apis/wit/workitemtypes/${encodeURIComponent(task.fields['System.WorkItemType'])}/states`,
    );
    const finalStates = metadata.value.filter((state) => state.category === 'Completed');
    const currentState = task.fields['System.State'];
    const finalState =
      finalStates.find((state) => state.name === currentState) ||
      (finalStates.length === 1 ? finalStates[0] : null);
    if (!finalState) {
      throw new ConnectionError(
        'FINAL_STATE_UNAVAILABLE',
        'No se pudo determinar un único estado final para esta tarea. Revisá los estados del proceso en Azure.',
        400,
      );
    }
    if (
      task.fields['Microsoft.VSTS.Scheduling.CompletedWork'] !== estimate ||
      task.fields['Microsoft.VSTS.Scheduling.RemainingWork'] !== 0 ||
      currentState !== finalState.name
    ) {
      if (!Number.isSafeInteger(task.rev))
        throw new ConnectionError(
          'TASK_REVISION',
          'No se pudo verificar la versión de la tarea. Actualizá e intentá nuevamente.',
        );
      await request(
        `${projectUrl}/_apis/wit/workitems/${task.id}`,
        [
          { op: 'test', path: '/rev', value: task.rev },
          { op: 'add', path: '/fields/Microsoft.VSTS.Scheduling.CompletedWork', value: estimate },
          { op: 'add', path: '/fields/Microsoft.VSTS.Scheduling.RemainingWork', value: 0 },
          { op: 'add', path: '/fields/System.State', value: finalState.name },
        ],
        true,
        'PATCH',
      );
    }
    return { taskId: task.id, completedHours: estimate };
  };
}
