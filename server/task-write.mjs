import { createHash } from 'node:crypto';
import { ConnectionError } from './azure.mjs';

const locks = new Map();
const attempts = new Map();
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const normalize = (value) =>
  String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
const escapeHtml = (value) =>
  value
    .replace(
      /[&<>"']/g,
      (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char],
    )
    .replace(/\n/g, '<br>');
const bad = () =>
  new ConnectionError(
    'INVALID_TASKS',
    'Revisá las tareas: entre 1 y 30, título, especialidad y proyecto válidos. Confirmá la vista previa.',
    400,
  );

export function validateTaskRequest(input) {
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
    !Array.isArray(input.tasks) ||
    !input.tasks.length ||
    input.tasks.length > 30
  )
    throw bad();
  const ids = new Set();
  for (const task of input.tasks) {
    if (
      !task ||
      typeof task.id !== 'string' ||
      !uuid.test(task.id) ||
      ids.has(task.id) ||
      typeof task.title !== 'string' ||
      !task.title.trim() ||
      task.title.length > 255 ||
      /[\x00-\x1f]/.test(task.title) ||
      typeof task.description !== 'string' ||
      task.description.length > 10000 ||
      !['Frontend', 'Backend', 'Testing'].includes(task.specialty) ||
      typeof task.assignee !== 'string' ||
      task.assignee.length > 256 ||
      /[\x00-\x1f]/.test(task.assignee)
    )
      throw bad();
    ids.add(task.id);
  }
  return input;
}

export function createTaskWriter({ config, projectUrl, request, batch }) {
  return async (input) => {
    validateTaskRequest(input);
    const scope = `${normalize(config.organization)}/${normalize(input.project)}/${input.storyId}`;
    if (locks.has(scope))
      throw new ConnectionError(
        'TASKS_BUSY',
        'Ya se están creando tareas para esta historia. Esperá y consultá el resultado.',
        409,
      );
    locks.set(scope, true);
    try {
      const [parent] = await batch([input.storyId]);
      if (
        !parent ||
        normalize(parent.fields['System.TeamProject']) !== normalize(input.project) ||
        !['user story', 'product backlog item', 'issue', 'requirement', 'bug'].includes(
          normalize(parent.fields['System.WorkItemType']),
        )
      ) {
        throw new ConnectionError(
          'INVALID_PARENT',
          'La historia no pertenece al proyecto seleccionado o no permite este flujo.',
          400,
        );
      }
      const area = parent.fields['System.AreaPath'];
      const iteration = parent.fields['System.IterationPath'];
      if (!area || !iteration)
        throw new ConnectionError(
          'PARENT_SCOPE',
          'La historia necesita área y sprint antes de crear tareas.',
          400,
        );
      const childIds = [
        ...new Set(
          (parent.relations || [])
            .filter((r) => r.rel === 'System.LinkTypes.Hierarchy-Forward')
            .map((r) => Number(r.url.split('/').pop()))
            .filter((id) => Number.isSafeInteger(id) && id > 0),
        ),
      ];
      const children = (await batch(childIds)).filter(
        (child) => normalize(child.fields['System.WorkItemType']) === 'task',
      );
      const taskStates = await request(`${projectUrl}/_apis/wit/workitemtypes/Task/states`);
      const removed = (child) =>
        taskStates.value.find((s) => s.name === child.fields['System.State'])?.category ===
        'Removed';
      const results = [];
      let stopped = false;
      for (const task of input.tasks) {
        const marker = `FlowBoard-${task.id}`;
        const key = `${scope}/${task.id}`;
        const fingerprint = createHash('sha256').update(JSON.stringify(task)).digest('hex');
        const previous = attempts.get(key);
        const linked = children.find((child) =>
          String(child.fields['System.Tags'] || '')
            .split(';')
            .some((tag) => normalize(tag) === normalize(marker)),
        );
        const result = (status, extra = {}) => ({
          draftId: task.id,
          title: task.title,
          status,
          ...extra,
        });
        const identified = (status, id) =>
          result(status, { id, url: `${projectUrl}/_workitems/edit/${id}` });
        if (previous && previous.fingerprint !== fingerprint) {
          results.push(
            result('failed', {
              error:
                'Esta solicitud ya fue enviada con otro contenido. Generá una nueva propuesta.',
            }),
          );
          continue;
        }
        if (linked) {
          results.push(identified('existing', linked.id));
          continue;
        }
        if (previous?.id) {
          results.push(identified('existing', previous.id));
          continue;
        }
        if (previous?.uncertain) {
          results.push(
            result('unknown', {
              error:
                'Azure no confirmó el resultado. Verificá la historia en Azure antes de preparar otra tarea; esta solicitud no se reenviará automáticamente.',
            }),
          );
          stopped = true;
          continue;
        }
        if (stopped) {
          results.push(
            result('pending', { error: 'No se envió: primero resolvé el resultado anterior.' }),
          );
          continue;
        }
        const duplicate = children.find(
          (child) =>
            !removed(child) && normalize(child.fields['System.Title']) === normalize(task.title),
        );
        if (duplicate) {
          results.push(identified('duplicate', duplicate.id));
          continue;
        }
        if (!previous && attempts.size >= 5000)
          throw new ConnectionError(
            'WRITE_CAPACITY',
            'Se alcanzó el límite de operaciones de esta instancia. Contactá al administrador.',
            429,
          );
        const attempt = { fingerprint, uncertain: true };
        attempts.set(key, attempt);
        const patch = [
          { op: 'add', path: '/fields/System.Title', value: task.title.trim() },
          { op: 'add', path: '/fields/System.Description', value: escapeHtml(task.description) },
          { op: 'add', path: '/fields/System.Tags', value: `${task.specialty}; ${marker}` },
          { op: 'add', path: '/fields/System.AreaPath', value: area },
          { op: 'add', path: '/fields/System.IterationPath', value: iteration },
          ...(task.assignee.trim()
            ? [{ op: 'add', path: '/fields/System.AssignedTo', value: task.assignee.trim() }]
            : []),
          {
            op: 'add',
            path: '/relations/-',
            value: {
              rel: 'System.LinkTypes.Hierarchy-Reverse',
              url: `${projectUrl}/_apis/wit/workItems/${parent.id}`,
            },
          },
        ];
        try {
          const created = await request(`${projectUrl}/_apis/wit/workitems/$Task`, patch, true);
          if (!Number.isSafeInteger(created.id)) throw new Error('Invalid creation response');
          attempt.id = created.id;
          attempt.uncertain = false;
          children.push({
            id: created.id,
            fields: { 'System.Title': task.title, 'System.Tags': `${task.specialty}; ${marker}` },
          });
          results.push(identified('created', created.id));
        } catch (error) {
          const knownFailure =
            error instanceof ConnectionError &&
            /^AZURE_4\d\d$/.test(error.code) &&
            error.status !== 408;
          attempt.uncertain = !knownFailure;
          results.push(
            result(knownFailure ? 'failed' : 'unknown', {
              error: knownFailure
                ? error.message
                : 'No se pudo confirmar la creación en Azure. Consultá el resultado antes de volver a crear.',
            }),
          );
          stopped = true;
        }
      }
      return { results };
    } finally {
      locks.delete(scope);
    }
  };
}
