import { randomBytes, createHash } from 'node:crypto';
import { ConnectionError } from './azure.mjs';

const invalidLink = () =>
  new ConnectionError(
    'INVALID_BOARD_URL',
    'Ingresá un enlace de proyecto, tablero o sprint de https://dev.azure.com.',
    400,
  );
export function parseBoardUrl(value) {
  if (typeof value !== 'string' || value.length > 2048) throw invalidLink();
  let url, parts;
  try {
    url = new URL(value.trim());
    parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
  } catch {
    throw invalidLink();
  }
  if (
    url.origin !== 'https://dev.azure.com' ||
    url.username ||
    url.password ||
    url.hash ||
    parts.length < 2 ||
    parts.some((p) => !p.trim() || /[\\/\x00-\x1f]/.test(p) || p === '.' || p === '..')
  )
    throw invalidLink();
  const [organization, project, section, view, team, ...iteration] = parts;
  let selection = { organization, project, team: '', iteration: '' };
  if (section) {
    if (section === '_sprints' && ['taskboard', 'backlog', 'capacity'].includes(view)) {
      selection.team = team || '';
      selection.iteration = iteration.join('/');
    } else if (section === '_boards' && ['board', 'backlogs'].includes(view)) {
      if (parts[4] === 't' && parts[5]) selection.team = parts[5];
      else throw invalidLink();
    } else if (section !== '_backlogs' || !['backlog', 'board'].includes(view)) throw invalidLink();
    else selection.team = team || '';
  }
  return selection;
}

export async function readJson(req, limit = 8192) {
  if (req.headers['content-type']?.split(';')[0] !== 'application/json')
    throw new ConnectionError('CONTENT_TYPE', 'Se requiere JSON.', 415);
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit)
      throw new ConnectionError('BODY_TOO_LARGE', 'Solicitud demasiado grande.', 413);
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new ConnectionError('INVALID_JSON', 'Solicitud inválida.', 400);
  }
}

export function createSessions({
  clientFactory,
  secure,
  now = Date.now,
  idleMs = 30 * 60_000,
  lifetimeMs = 8 * 60 * 60_000,
}) {
  const sessions = new Map(),
    attempts = new Map();
  let pending = 0;
  const cookieName = secure ? '__Host-flowboard' : 'flowboard';
  const key = (token) => createHash('sha256').update(token).digest('hex');
  function token(req) {
    return (
      (req.headers.cookie || '')
        .split(';')
        .map((s) => s.trim())
        .find((s) => s.startsWith(cookieName + '='))
        ?.slice(cookieName.length + 1) || ''
    );
  }
  function cookie(res, value, clear = false) {
    res.setHeader(
      'Set-Cookie',
      `${cookieName}=${value}; Path=/; HttpOnly; SameSite=Strict${secure ? '; Secure' : ''}${clear ? '; Max-Age=0' : ''}`,
    );
  }
  function sweep() {
    for (const [id, session] of sessions)
      if (now() >= session.expires || now() - session.used >= idleMs) sessions.delete(id);
    for (const [ip, attempt] of attempts) if (now() >= attempt.until) attempts.delete(ip);
  }
  const timer = setInterval(sweep, 60_000);
  timer.unref();
  function get(req) {
    const id = key(token(req)),
      session = sessions.get(id);
    if (!session) return null;
    if (now() >= session.expires || now() - session.used >= idleMs) {
      sessions.delete(id);
      return null;
    }
    session.used = now();
    return session;
  }
  function logout(req, res) {
    sessions.delete(key(token(req)));
    cookie(res, '', true);
  }
  async function login(req, res) {
    sweep();
    const ip = req.socket.remoteAddress;
    let attempt = attempts.get(ip);
    if (!attempt) {
      if (attempts.size >= 10000)
        throw new ConnectionError('BUSY', 'Intentá nuevamente en un minuto.', 429);
      attempt = { count: 0, until: now() + 60_000 };
      attempts.set(ip, attempt);
    }
    if (++attempt.count > 10 || pending >= 16 || sessions.size >= 1000)
      throw new ConnectionError('RATE_LIMIT', 'Demasiados intentos. Esperá un minuto.', 429);
    pending++;
    try {
      const body = await readJson(req);
      const config = parseBoardUrl(body?.boardUrl);
      if (typeof body?.pat !== 'string' || !/^[\x21-\x7e]{1,256}$/.test(body.pat))
        throw new ConnectionError('INVALID_PAT', 'Ingresá un PAT válido, sin espacios.', 400);
      const load = clientFactory({ ...config, pat: body.pat });
      const projects = await load.projects();
      const matches = (item, value) =>
        item.name.toLowerCase() === value.toLowerCase() ||
        item.id.toLowerCase() === value.toLowerCase();
      const project = projects.value.find((p) => matches(p, config.project));
      if (!project)
        throw new ConnectionError(
          'PROJECT_ACCESS',
          'El PAT no tiene acceso al proyecto del enlace.',
          403,
        );
      config.project = project.name;
      const teams = await load.teams(config.project);
      const team = config.team ? teams.value.find((t) => matches(t, config.team)) : teams.value[0];
      if (!team)
        throw new ConnectionError(
          'TEAM_ACCESS',
          'El equipo del enlace no está disponible para este PAT.',
          403,
        );
      config.team = team.name;
      // Validate Work Items permission as well as project/team access before opening a session.
      await load.sprints(config.project, config.team);
      const id = randomBytes(32).toString('hex');
      const scopedLoad = clientFactory({ ...config, pat: body.pat });
      sessions.delete(key(token(req)));
      sessions.set(key(id), {
        load: scopedLoad,
        cache: new Map(),
        config,
        used: now(),
        expires: now() + lifetimeMs,
        requests: 0,
        window: now(),
      });
      cookie(res, id);
      return { authenticated: true, organization: config.organization };
    } finally {
      pending--;
    }
  }
  return {
    get,
    login,
    logout,
    close: () => {
      clearInterval(timer);
      sessions.clear();
      attempts.clear();
    },
  };
}
