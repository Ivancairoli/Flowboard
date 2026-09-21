import { classifyTask } from './task-specialty.mjs';
import { createTaskWriter } from './task-write.mjs';

export class ConnectionError extends Error {
  constructor(code, message, status = 502) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

const normalize = (value) =>
  String(value ?? '')
    .trim()
    .toLowerCase();
const iterationKey = (value) => normalize(value).replaceAll('/', '\\');
const stages = ['Sin comenzar', 'En desarrollo', 'Para Testing', 'En testing', 'Finalizadas'];
const tones = ['gray', 'amber', 'blue', 'purple', 'green'];
const storyTypes = new Set([
  'user story',
  'caso de usuario',
  'product backlog item',
  'issue',
  'requirement',
  'bug',
  'error',
]);
const taskTypes = new Set(['task', 'tarea']);
const bugTypes = new Set(['bug', 'error']);

export function member(value) {
  if (!value) return null;
  const fullName =
    typeof value === 'string' ? value : value.displayName || value.uniqueName || 'Usuario';
  return {
    id: typeof value === 'string' ? value : value.id || value.uniqueName || fullName,
    fullName,
    name: fullName.split(' ')[0],
    initials: fullName
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toUpperCase(),
  };
}

export function mapStory(item, children, statesByType, config, stateMap, linkedBugs = []) {
  const fields = item.fields;
  const azureState = fields['System.State'] || 'Sin estado';
  const bugs = [...new Map(linkedBugs.map((bug) => [bug.id, bug])).values()]
    .map((bug) => {
      const f = bug.fields;
      const state = f['System.State'] || 'Sin estado';
      const category = statesByType
        .get(f['System.WorkItemType'])
        ?.find((s) => s.name === state)?.category;
      return {
        id: bug.id,
        title: f['System.Title'] || `Bug ${bug.id}`,
        state,
        completed: category === 'Completed',
        removed: category === 'Removed',
        url: `${config.projectUrl}/_workitems/edit/${bug.id}`,
      };
    })
    .filter((bug) => !bug.removed);
  const tasks = children
    .map((child) => {
      const f = child.fields;
      const state = f['System.State'] || 'Sin estado';
      const taskCategory = statesByType
        .get(f['System.WorkItemType'])
        ?.find((s) => s.name === state)?.category;
      const classification = classifyTask(f['System.Tags']);
      return {
        id: child.id,
        title: f['System.Title'],
        state,
        ...classification,
        deployedToTesting:
          classification.specialty === 'Testing' &&
          String(f['System.Tags'] ?? '')
            .split(';')
            .some((tag) => normalize(tag) === 'en testing'),
        assignee: member(f['System.AssignedTo']),
        completed: taskCategory === 'Completed',
        started: ['InProgress', 'Resolved', 'Completed'].includes(taskCategory),
        removed: taskCategory === 'Removed',
        url: `${config.projectUrl}/_workitems/edit/${child.id}`,
      };
    })
    .filter((task) => !task.removed);
  const developmentTasks = tasks.filter((task) => task.specialty !== 'Testing');
  const testingTasks = tasks.filter((task) => task.specialty === 'Testing');
  const developmentCompleted =
    developmentTasks.length > 0 && developmentTasks.every((task) => task.completed);
  // Finishing development alone never implies that QA has validated the story.
  const stage =
    testingTasks.length > 0 && tasks.every((task) => task.completed)
      ? 'Finalizadas'
      : testingTasks.some((task) => task.deployedToTesting)
        ? 'En testing'
        : developmentCompleted
          ? 'Para Testing'
          : tasks.some((task) => task.started)
            ? 'En desarrollo'
            : 'Sin comenzar';
  const assignee = member(fields['System.AssignedTo']);
  const participants = [
    ...new Map(
      [assignee, ...tasks.map((task) => task.assignee)].filter(Boolean).map((p) => [p.id, p]),
    ).values(),
  ];
  const blocked =
    /^(blocked|bloquead[oa])$/i.test(azureState) ||
    /^(yes|true|si|sí)$/i.test(String(fields['Microsoft.VSTS.CMMI.Blocked'] || ''));
  return {
    id: item.id,
    title: fields['System.Title'] || `Historia ${item.id}`,
    // This text is rendered through Angular interpolation, never as HTML.
    description: String(fields['System.Description'] || '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim(),
    azureState,
    stage,
    status: blocked ? 'Bloqueada' : stage || azureState,
    blocked,
    tone: blocked ? 'red' : tones[stages.indexOf(stage)] || 'gray',
    progress: tasks.length
      ? Math.round((tasks.filter((task) => task.completed).length * 100) / tasks.length)
      : null,
    assignee,
    participants,
    tasks,
    bugs,
    bugCount: bugs.length,
    openBugCount: bugs.filter((bug) => !bug.completed).length,
    project: config.project,
    iteration: fields['System.IterationPath'] || config.iteration,
    url: `${config.projectUrl}/_workitems/edit/${item.id}`,
    message: tasks.length
      ? `${tasks.filter((task) => task.completed).length} de ${tasks.length} tareas completadas`
      : 'Sin tareas vinculadas: avance no disponible',
  };
}

export function createAzureClient(config, stateMap, fetchImpl = fetch) {
  const projectUrl = `https://dev.azure.com/${encodeURIComponent(config.organization)}/${encodeURIComponent(config.project)}`;
  const teamUrl = `${projectUrl}/${encodeURIComponent(config.team)}`;
  async function request(url, body, write = false) {
    if (!config.pat?.trim())
      throw new ConnectionError('TOKEN_MISSING', 'Ingresá tu PAT en la pantalla de conexión.', 503);
    let response;
    try {
      response = await fetchImpl(`${url}${url.includes('?') ? '&' : '?'}api-version=7.1`, {
        method: body ? 'POST' : 'GET',
        redirect: 'error',
        signal: AbortSignal.timeout(20000),
        headers: {
          Authorization: `Basic ${Buffer.from(`:${config.pat}`).toString('base64')}`,
          Accept: 'application/json',
          ...(body
            ? { 'Content-Type': write ? 'application/json-patch+json' : 'application/json' }
            : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    } catch {
      throw new ConnectionError(
        'AZURE_UNREACHABLE',
        'No se pudo contactar Azure DevOps. Revisá la conexión e intentá nuevamente.',
      );
    }
    if (!response.ok) {
      const messages = {
        400: 'Azure rechazó la tarea. Revisá responsable, campos obligatorios y reglas del proceso.',
        401: 'Azure rechazó el PAT. Revisá que sea válido y no esté vencido.',
        403: write
          ? 'Para crear tareas necesitás Work Items (Read & write) y permiso para crear elementos en esta área.'
          : 'Acceso denegado. Revisá Work Items (Read), Project and Team (Read) y los permisos de tu cuenta.',
        404: 'Azure no encontró el recurso. Revisá organización, proyecto, equipo y permisos.',
        429: 'Azure limitó las consultas. Esperá un minuto antes de actualizar.',
      };
      throw new ConnectionError(
        `AZURE_${response.status}`,
        messages[response.status] || 'Azure no pudo completar la consulta. Intentá nuevamente.',
        write ? response.status : 502,
      );
    }
    try {
      const data = await response.json();
      data.continuationToken = response.headers.get('x-ms-continuationtoken');
      return data;
    } catch {
      throw new ConnectionError(
        'AZURE_RESPONSE',
        'Azure devolvió una respuesta inesperada. Revisá el PAT y el acceso al proyecto.',
      );
    }
  }
  async function batch(ids) {
    const items = [];
    for (let i = 0; i < ids.length; i += 200) {
      const result = await request(`${projectUrl}/_apis/wit/workitemsbatch`, {
        ids: ids.slice(i, i + 200),
        $expand: 'Relations',
        errorPolicy: 'Fail',
      });
      items.push(...result.value);
    }
    return items;
  }
  async function loadBoard(selection) {
    if (selection)
      return createAzureClient(
        {
          ...config,
          project: selection.project,
          team: selection.team,
          iterationIds: selection.sprints,
        },
        stateMap,
        fetchImpl,
      )();
    if (!config.pat?.trim())
      throw new ConnectionError('TOKEN_MISSING', 'Ingresá tu PAT en la pantalla de conexión.', 503);
    const iterations = await request(`${teamUrl}/_apis/work/teamsettings/iterations`);
    const selected = config.iterationIds
      ? iterations.value.filter((i) => config.iterationIds.includes(i.id))
      : iterations.value.filter((i) => iterationKey(i.path) === iterationKey(config.iteration));
    if (
      !selected.length ||
      (config.iterationIds && selected.length !== new Set(config.iterationIds).size)
    )
      throw new ConnectionError(
        'SPRINT_NOT_FOUND',
        'Uno de los sprints no está asignado al equipo. Actualizá la selección.',
        404,
      );
    const relations = [];
    for (const iteration of selected) {
      const result = await request(
        `${teamUrl}/_apis/work/teamsettings/iterations/${encodeURIComponent(iteration.id)}/workitems`,
      );
      relations.push(...(result.workItemRelations || []));
    }
    const ids = [
      ...new Set(
        relations
          .flatMap((r) => [r.source?.id, r.target?.id])
          .filter((id) => Number.isInteger(id) && id > 0),
      ),
    ];
    const items = await batch(ids);
    const roots = items.filter((item) =>
      storyTypes.has(normalize(item.fields['System.WorkItemType'])),
    );
    const linkedIds = (root, types) => [
      ...new Set(
        (root.relations || [])
          .filter((r) => types.includes(r.rel))
          .map((r) => Number(r.url.split('/').pop()))
          .filter((id) => Number.isInteger(id) && id > 0),
      ),
    ];
    const childIds = (root) => linkedIds(root, ['System.LinkTypes.Hierarchy-Forward']);
    const bugIds = (root) =>
      linkedIds(root, ['System.LinkTypes.Hierarchy-Forward', 'System.LinkTypes.Related']);
    const knownIds = new Set(items.map((item) => item.id));
    const missing = [...new Set(roots.flatMap(bugIds))].filter((id) => !knownIds.has(id));
    items.push(...(await batch(missing)));
    const statesByType = new Map();
    for (const type of new Set(items.map((item) => item.fields['System.WorkItemType']))) {
      const data = await request(
        `${projectUrl}/_apis/wit/workitemtypes/${encodeURIComponent(type)}/states`,
      );
      statesByType.set(type, data.value);
    }
    const byId = new Map(items.map((item) => [item.id, item]));
    const stories = roots
      .filter(
        (item) =>
          statesByType
            .get(item.fields['System.WorkItemType'])
            ?.find((s) => s.name === item.fields['System.State'])?.category !== 'Removed',
      )
      .map((root) =>
        mapStory(
          root,
          childIds(root)
            .map((id) => byId.get(id))
            .filter(
              (child) => child && taskTypes.has(normalize(child.fields['System.WorkItemType'])),
            ),
          statesByType,
          { ...config, projectUrl },
          stateMap,
          bugIds(root)
            .map((id) => byId.get(id))
            .filter(
              (linked) => linked && bugTypes.has(normalize(linked.fields['System.WorkItemType'])),
            ),
        ),
      );
    const warnings = [];
    if (stories.some((story) => !story.stage))
      warnings.push(
        'Hay estados sin correspondencia. Se muestran en Sin clasificar; configurá server/state-map.json.',
      );
    if (items.length && !roots.length)
      warnings.push(
        'El sprint tiene elementos pero ninguno es User Story, Caso de usuario, Product Backlog Item, Issue, Requirement, Bug o Error. Revisá los tipos de trabajo del proyecto.',
      );
    return {
      stories,
      warnings,
      syncedAt: new Date().toISOString(),
      context: {
        organization: config.organization,
        project: config.project,
        team: config.team,
        iteration: selected.map((i) => i.path).join(' · '),
        sprint: selected.map((i) => i.name).join(' · '),
        sprints: selected.map((i) => ({ id: i.id, name: i.name, path: i.path })),
      },
    };
  }
  const orgUrl = `https://dev.azure.com/${encodeURIComponent(config.organization)}`;
  loadBoard.projects = async () => {
    const value = [];
    let continuation;
    do {
      const data = await request(
        `${orgUrl}/_apis/projects?$top=100${continuation ? '&continuationToken=' + encodeURIComponent(continuation) : ''}`,
      );
      value.push(...data.value.map(({ id, name }) => ({ id, name })));
      if (continuation && continuation === data.continuationToken)
        throw new ConnectionError('PAGING_ERROR', 'Azure no pudo completar la lista de proyectos.');
      continuation = data.continuationToken;
    } while (continuation);
    return {
      value,
      defaults: { project: config.project, team: config.team, iteration: config.iteration },
    };
  };
  loadBoard.teams = async (project) => {
    const value = [];
    for (let skip = 0; ; skip += 100) {
      const data = await request(
        `${orgUrl}/_apis/projects/${encodeURIComponent(project)}/teams?$top=100&$skip=${skip}`,
      );
      value.push(...data.value.map(({ id, name }) => ({ id, name })));
      if (data.value.length < 100) break;
    }
    return { value };
  };
  loadBoard.sprints = async (project, team) => {
    const data = await request(
      `${orgUrl}/${encodeURIComponent(project)}/${encodeURIComponent(team)}/_apis/work/teamsettings/iterations`,
    );
    return {
      value: data.value
        .map((i) => ({
          id: i.id,
          name: i.name,
          path: i.path,
          timeFrame: i.attributes?.timeFrame || 'unscheduled',
          startDate: i.attributes?.startDate || null,
          finishDate: i.attributes?.finishDate || null,
        }))
        .sort(
          (a, b) =>
            (a.startDate || '9999').localeCompare(b.startDate || '9999') ||
            a.path.localeCompare(b.path),
        ),
    };
  };
  const writeTasks = createTaskWriter({ config, projectUrl, request, batch });
  loadBoard.createTasks = (input) =>
    input.project === config.project
      ? writeTasks(input)
      : createAzureClient({ ...config, project: input.project }, stateMap, fetchImpl).createTasks(
          input,
        );
  return loadBoard;
}
