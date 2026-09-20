import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { BoardStore } from './board-store';

describe('BoardStore', () => {
  let store: BoardStore;
  let http: HttpTestingController;
  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    store = TestBed.inject(BoardStore);
  });
  afterEach(() => {
    store.ngOnDestroy();
    http.verify();
    vi.useRealTimers();
  });
  async function initialize() {
    http.expectOne('/api/session').flush({ authenticated: true, organization: 'PagesWeb' });
    await Promise.resolve();
    http.expectOne('/api/projects').flush({
      value: [{ id: 'p', name: 'Pages' }],
      defaults: { project: 'Pages', team: 'Pages Team', iteration: 'Pages/Sprint 1' },
    });
    await Promise.resolve();
    http
      .expectOne((r) => r.url === '/api/teams')
      .flush({ value: [{ id: 't', name: 'Pages Team' }] });
    await Promise.resolve();
    http
      .expectOne((r) => r.url === '/api/sprints')
      .flush({
        value: [
          { id: 's1', name: 'Sprint 1', path: 'Pages/Sprint 1', timeFrame: 'past' },
          { id: 's2', name: 'Sprint 2', path: 'Pages/Sprint 2', timeFrame: 'future' },
        ],
      });
    await Promise.resolve();
  }
  it('loads, polls and preserves successful data after a connection error', async () => {
    await initialize();
    const board = {
      stories: [],
      context: {
        organization: 'PagesWeb',
        project: 'Pages',
        team: 'Pages Team',
        iteration: 'Pages\\Sprint 1',
        sprint: 'Sprint 1',
      },
      syncedAt: '2026-09-18T12:00:00Z',
      warnings: [],
    };
    http.expectOne((r) => r.url === '/api/board').flush(board);
    await Promise.resolve();
    expect(store.syncedAt()).toBe(board.syncedAt);
    await vi.advanceTimersByTimeAsync(60000);
    http
      .expectOne((r) => r.url === '/api/board')
      .flush({ error: 'PAT vencido' }, { status: 502, statusText: 'Bad Gateway' });
    await Promise.resolve();
    expect(store.error()).toBe('PAT vencido');
    expect(store.syncedAt()).toBe(board.syncedAt);
    expect(store.loading()).toBe(false);
  });
  it('creates only through the protected endpoint and ignores reads started before creation', async () => {
    await initialize();
    const board = {
      stories: [],
      context: {
        organization: 'PagesWeb',
        project: 'Pages',
        team: 'Pages Team',
        iteration: 'Pages/Sprint 1',
        sprint: 'Sprint 1',
      },
      syncedAt: 'initial',
      warnings: [],
    };
    http.expectOne((r) => r.url === '/api/board').flush(board);
    await Promise.resolve();
    const oldRead = store.refresh();
    const stale = http.expectOne((r) => r.url === '/api/board');
    const payload = {
      project: 'Pages',
      storyId: 1,
      confirmed: true as const,
      tasks: [
        {
          id: '12345678-1234-1234-1234-123456789012',
          title: 'Nueva tarea',
          description: '',
          specialty: 'Backend' as const,
          assignee: '',
        },
      ],
    };
    const writing = store.createTasks(payload);
    const write = http.expectOne('/api/tasks');
    expect(write.request.method).toBe('POST');
    expect(write.request.headers.get('X-FlowBoard-Request')).toBe('1');
    expect(write.request.body).toEqual(payload);
    write.flush({
      results: [{ draftId: payload.tasks[0].id, status: 'created', title: 'Nueva tarea', id: 15 }],
    });
    await writing;
    const fresh = http.expectOne((r) => r.url === '/api/board');
    fresh.flush({ ...board, syncedAt: 'fresh' });
    await Promise.resolve();
    stale.flush({ ...board, syncedAt: 'stale' });
    await oldRead;
    expect(store.syncedAt()).toBe('fresh');
  });

  it('does not issue overlapping refreshes and recovers on manual retry', async () => {
    await initialize();
    void store.refresh();
    http
      .expectOne((r) => r.url === '/api/board')
      .flush({ error: 'Configurá el PAT' }, { status: 503, statusText: 'Unavailable' });
    await Promise.resolve();
    expect(store.error()).toBe('Configurá el PAT');
    const retry = store.refresh();
    http
      .expectOne((r) => r.url === '/api/board')
      .flush({
        stories: [],
        context: store.context(),
        syncedAt: '2026-09-18T12:00:00Z',
        warnings: [],
      });
    await retry;
    expect(store.error()).toBe('');
    store.ngOnDestroy();
    await vi.advanceTimersByTimeAsync(60000);
    http.expectNone('/api/board');
  });
  it('ignores obsolete board responses when sprint selection changes and supports clearing', async () => {
    await initialize();
    const old = http.expectOne((r) => r.url === '/api/board');
    const selection = store.selectSprints(['s1', 's2']);
    const latest = http.expectOne((r) => r.url === '/api/board');
    expect(latest.request.params.getAll('sprint')).toEqual(['s1', 's2']);
    latest.flush({ stories: [], context: store.context(), syncedAt: 'new', warnings: [] });
    await selection;
    old.flush({ stories: [], context: store.context(), syncedAt: 'old', warnings: [] });
    await Promise.resolve();
    expect(store.syncedAt()).toBe('new');
    await store.selectSprints([]);
    expect(store.syncedAt()).toBeNull();
    http.expectNone((r) => r.url === '/api/board');
  });
  it('starts disconnected without requesting Azure catalogs and handles invalid credentials', async () => {
    http.expectOne('/api/session').flush({ authenticated: false });
    await Promise.resolve();
    expect(store.authenticated()).toBe(false);
    http.expectNone('/api/projects');
    const connecting = store.connect({ boardUrl: 'https://dev.azure.com/Org/P', pat: 'fake' });
    const request = http.expectOne('/api/session');
    expect(request.request.method).toBe('POST');
    expect(request.request.headers.get('X-FlowBoard-Request')).toBe('1');
    request.flush({ error: 'PAT inválido' }, { status: 401, statusText: 'Unauthorized' });
    await connecting;
    expect(store.authenticated()).toBe(false);
    expect(store.sessionError()).toBe('PAT inválido');
    expect(store.sessionLoading()).toBe(false);
  });
  it('clears private data when the session expires', async () => {
    await initialize();
    http
      .expectOne((r) => r.url === '/api/board')
      .flush({ error: 'Sesión vencida' }, { status: 401, statusText: 'Unauthorized' });
    await Promise.resolve();
    expect(store.authenticated()).toBe(false);
    expect(store.stories()).toEqual([]);
    expect(store.projects()).toEqual([]);
    expect(store.selectedSprints()).toEqual([]);
    await vi.advanceTimersByTimeAsync(60000);
    http.expectNone((r) => r.url === '/api/board');
  });
  it('logs out and ignores a board response that arrives after logout', async () => {
    await initialize();
    const board = http.expectOne((r) => r.url === '/api/board');
    // Let initial catalog loading finish before simulating the logout action.
    board.flush({ stories: [], context: store.context(), syncedAt: 'first', warnings: [] });
    for (let i = 0; i < 12; i++) await Promise.resolve();
    const refresh = store.refresh();
    const late = http.expectOne((r) => r.url === '/api/board');
    const logout = store.disconnect();
    const request = http.expectOne('/api/session');
    expect(request.request.method).toBe('DELETE');
    request.flush({ authenticated: false });
    await logout;
    late.flush({ stories: [], context: store.context(), syncedAt: 'late', warnings: [] });
    await refresh;
    expect(store.authenticated()).toBe(false);
    expect(store.syncedAt()).toBeNull();
    expect(store.context().organization).toBe('');
  });
});
