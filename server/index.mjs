import http from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import { createAzureClient, ConnectionError } from './azure.mjs';
import { createSessions, readJson } from './session.mjs';
import { validateTaskRequest } from './task-write.mjs';
import { validateHoursRequest } from './task-hours.mjs';
import { createStaticHandler } from './static.mjs';

const envPath = fileURLToPath(new URL('../.env', import.meta.url));
if (existsSync(envPath)) {
  const settings = parseEnv(readFileSync(envPath, 'utf8'));
  for (const name of ['NODE_ENV', 'PUBLIC_ORIGIN', 'HOST', 'PORT'])
    if (process.env[name] === undefined && settings[name] !== undefined)
      process.env[name] = settings[name];
}
const stateMap = JSON.parse(readFileSync(new URL('./state-map.json', import.meta.url), 'utf8'));
const allowedStages = new Set([
  'Sin comenzar',
  'En desarrollo',
  'Para Testing',
  'En testing',
  'Finalizadas',
]);
if (Object.values(stateMap).some((stage) => !allowedStages.has(stage)))
  throw new Error('server/state-map.json contiene una etapa inválida.');
export function createServer(options = {}) {
  const production = options.production ?? process.env.NODE_ENV === 'production';
  const publicOrigin =
    options.publicOrigin ??
    process.env.PUBLIC_ORIGIN ??
    (process.env.RENDER === 'true' ? process.env.RENDER_EXTERNAL_URL : undefined);
  if (production && !publicOrigin) throw new Error('PUBLIC_ORIGIN es obligatorio en producción.');
  if (
    publicOrigin &&
    (new URL(publicOrigin).origin !== publicOrigin || new URL(publicOrigin).protocol !== 'https:')
  )
    throw new Error('PUBLIC_ORIGIN debe ser un origen HTTPS sin ruta.');
  const origins = new Set(
    publicOrigin
      ? [publicOrigin]
      : [
          'http://localhost:4200',
          'http://127.0.0.1:4200',
          'http://localhost:3001',
          'http://127.0.0.1:3001',
        ],
  );
  const hosts = new Set([...origins].map((origin) => new URL(origin).host));
  const staticDir =
    options.staticDir ??
    (production ? fileURLToPath(new URL('../dist/Flowboard/browser', import.meta.url)) : false);
  const serveStatic = staticDir ? createStaticHandler(staticDir) : null;
  const sessions = createSessions({
    clientFactory: options.clientFactory || ((config) => createAzureClient(config, stateMap)),
    secure: !!publicOrigin,
    now: options.now,
    idleMs: options.idleMs,
    lifetimeMs: options.lifetimeMs,
  });
  const server = http.createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const send = (status, body) => {
      res.writeHead(status);
      res.end(JSON.stringify(body));
    };
    if (!hosts.has(req.headers.host)) return send(403, { error: 'Origen no permitido.' });
    const url = new URL(req.url, 'http://localhost');
    if (serveStatic && url.pathname !== '/api' && !url.pathname.startsWith('/api/'))
      return serveStatic(req, res, url.pathname);
    if (
      (req.headers.origin && !origins.has(req.headers.origin)) ||
      req.headers['sec-fetch-site'] === 'cross-site'
    )
      return send(403, { error: 'Origen no permitido.' });
    if (req.method === 'GET' && req.url === '/api/health') return send(200, { status: 'ok' });
    if (
      req.method !== 'GET' &&
      (!origins.has(req.headers.origin) || req.headers['x-flowboard-request'] !== '1')
    )
      return send(403, { error: 'Solicitud no permitida.' });
    if (url.pathname === '/api/session' && !url.search) {
      try {
        if (req.method === 'POST') return send(200, await sessions.login(req, res));
        if (req.method === 'DELETE') {
          sessions.logout(req, res);
          return send(200, { authenticated: false });
        }
        if (req.method === 'GET') {
          const session = sessions.get(req);
          return send(
            200,
            session
              ? { authenticated: true, organization: session.config.organization }
              : { authenticated: false },
          );
        }
        return send(405, { error: 'Método no permitido.' });
      } catch (error) {
        return send(error instanceof ConnectionError ? error.status : 500, {
          code: error instanceof ConnectionError ? error.code : 'SESSION_ERROR',
          error:
            error instanceof ConnectionError
              ? error.message
              : 'No se pudo iniciar la sesión. Intentá nuevamente.',
        });
      }
    }
    if (
      ['/api/tasks', '/api/task-hours'].includes(url.pathname) &&
      req.method === 'POST' &&
      !url.search
    ) {
      const session = sessions.get(req);
      if (!session) return send(401, { error: 'Tu sesión terminó. Volvé a conectarte.' });
      session.writeWindow ||= Date.now();
      if (Date.now() - session.writeWindow >= 60000) {
        session.writeWindow = Date.now();
        session.writes = 0;
      }
      session.writes = (session.writes || 0) + 1;
      if (session.writes > 10)
        return send(429, { error: 'Demasiadas solicitudes de escritura. Esperá un minuto.' });
      try {
        const hours = url.pathname === '/api/task-hours';
        const input = (hours ? validateHoursRequest : validateTaskRequest)(
          await readJson(req, hours ? 2000 : 350000),
        );
        const result = await (hours
          ? session.load.registerHours(input)
          : session.load.createTasks(input));
        return send(200, result);
      } catch (error) {
        return send(error instanceof ConnectionError ? error.status : 500, {
          error:
            error instanceof ConnectionError
              ? error.message
              : 'No se pudo completar la solicitud. Consultá el resultado antes de repetirla.',
        });
      } finally {
        session.cache.clear();
      }
    }
    if (req.method !== 'GET') return send(405, { error: 'Método no permitido.' });
    if (!['/api/board', '/api/projects', '/api/teams', '/api/sprints'].includes(url.pathname))
      return send(404, { error: 'Ruta no encontrada.' });
    const session = sessions.get(req);
    if (!session)
      return send(401, {
        code: 'SESSION_EXPIRED',
        error: 'Tu sesión terminó. Volvé a ingresar el enlace y tu PAT.',
      });
    if (Date.now() - session.window >= 60000) {
      session.window = Date.now();
      session.requests = 0;
    }
    if (++session.requests > 120)
      return send(429, { error: 'Demasiadas consultas. Esperá un minuto.' });
    const { load, cache } = session;
    const project = url.searchParams.get('project');
    const team = url.searchParams.get('team');
    const sprints = [...new Set(url.searchParams.getAll('sprint'))].sort();
    const invalid = [...url.searchParams].some(
      ([key, value]) =>
        !['project', 'team', 'sprint'].includes(key) ||
        !value.trim() ||
        value.length > 300 ||
        value === '.' ||
        value === '..' ||
        /[\\/\x00-\x1f]/.test(value),
    );
    if (
      invalid ||
      (url.pathname === '/api/teams' && !project) ||
      (url.pathname === '/api/sprints' && (!project || !team)) ||
      (url.pathname === '/api/board' &&
        url.search &&
        (!project || !team || !sprints.length || sprints.length > 50))
    )
      return send(400, {
        error: 'Selección inválida. Elegí proyecto, equipo y entre 1 y 50 sprints.',
      });
    const key = JSON.stringify([url.pathname, project, team, sprints]);
    try {
      let entry = cache.get(key);
      if (!entry) {
        if (cache.size >= 100) {
          const idle = [...cache].find(([, value]) => !value.pending);
          if (idle) cache.delete(idle[0]);
          else return send(429, { error: 'Hay demasiadas consultas en curso. Esperá un momento.' });
        }
        entry = {};
        cache.set(key, entry);
      }
      if (!entry.data || Date.now() - entry.at >= 30000) {
        entry.pending ||= Promise.resolve()
          .then(() => {
            if (url.pathname === '/api/projects') return load.projects();
            if (url.pathname === '/api/teams') return load.teams(project);
            if (url.pathname === '/api/sprints') return load.sprints(project, team);
            return load(project ? { project, team, sprints } : undefined);
          })
          .then((data) => {
            entry.data = data;
            entry.at = Date.now();
            return data;
          })
          .finally(() => {
            entry.pending = null;
          });
        await entry.pending;
      }
      send(200, entry.data);
      if (cache.size > 100) {
        for (const [oldKey, oldEntry] of cache) {
          if (oldKey !== key && !oldEntry.pending) {
            cache.delete(oldKey);
            break;
          }
        }
      }
    } catch (error) {
      if (error instanceof ConnectionError && error.code === 'AZURE_401') sessions.logout(req, res);
      send(
        error instanceof ConnectionError && error.code === 'AZURE_401'
          ? 401
          : error instanceof ConnectionError
            ? error.status
            : 500,
        {
          code: error instanceof ConnectionError ? error.code : 'INTERNAL_ERROR',
          error:
            error instanceof ConnectionError
              ? error.message
              : 'No se pudo cargar el tablero. Intentá nuevamente.',
        },
      );
    }
  });
  server.requestTimeout = 30000;
  server.headersTimeout = 15000;
  server.on('close', sessions.close);
  return server;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const server = createServer();
  server.on('error', () => {
    console.error('No se pudo iniciar FlowBoard. Verificá HOST y PORT.');
    process.exitCode = 1;
  });
  server.listen(Number(process.env.PORT || 3001), process.env.HOST || '127.0.0.1', () =>
    console.log('FlowBoard iniciado (sesiones individuales).'),
  );
}
