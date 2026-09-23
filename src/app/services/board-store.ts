import { Injectable, OnDestroy, inject, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { firstValueFrom, timeout } from 'rxjs';
import { BoardResponse, Story, ScopeOption, SprintOption } from '../models/story';
import { TaskSubmission, TaskCreationResult } from '../models/task-creation';

@Injectable({ providedIn: 'root' })
export class BoardStore implements OnDestroy {
  private readonly http = inject(HttpClient);
  readonly stories = signal<Story[]>([]);
  readonly context = signal<BoardResponse['context']>({
    organization: '',
    project: '',
    team: '',
    iteration: '',
    sprint: '',
  });
  readonly syncedAt = signal<string | null>(null);
  readonly warnings = signal<string[]>([]);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly projects = signal<ScopeOption[]>([]);
  readonly teams = signal<ScopeOption[]>([]);
  readonly sprints = signal<SprintOption[]>([]);
  readonly project = signal('');
  readonly team = signal('');
  readonly selectedSprints = signal<string[]>([]);
  readonly catalogLoading = signal(false);
  readonly catalogError = signal('');
  readonly authenticated = signal(false);
  readonly sessionLoading = signal(true);
  readonly sessionError = signal('');
  private authRequest = 0;
  private readonly sessionHeaders = { 'X-FlowBoard-Request': '1' };
  private defaults = { project: '', team: '', iteration: '' };
  private generation = 0;
  private requestId = 0;
  private destroyed = false;
  private readonly timer: ReturnType<typeof setInterval>;

  constructor() {
    void this.restoreSession();
    this.timer = setInterval(() => {
      if (this.authenticated() && !this.catalogLoading() && !this.catalogError())
        void this.refresh();
    }, 60000);
  }
  private get<T>(url: string, params: Record<string, string> = {}) {
    return firstValueFrom(this.http.get<T>(url, { params }).pipe(timeout(60000)));
  }
  private clearSession() {
    this.generation++;
    this.resetBoard();
    this.authenticated.set(false);
    this.projects.set([]);
    this.teams.set([]);
    this.sprints.set([]);
    this.project.set('');
    this.team.set('');
    this.selectedSprints.set([]);
    this.catalogLoading.set(false);
    this.catalogError.set('');
    this.defaults = { project: '', team: '', iteration: '' };
    this.context.set({ organization: '', project: '', team: '', iteration: '', sprint: '' });
  }
  async restoreSession() {
    const request = ++this.authRequest;
    this.sessionLoading.set(true);
    try {
      const session = await this.get<{ authenticated: boolean; organization?: string }>(
        '/api/session',
      );
      if (this.destroyed || request !== this.authRequest) return;
      this.authenticated.set(session.authenticated);
      if (session.authenticated) {
        this.context.update((c) => ({ ...c, organization: session.organization || '' }));
        await this.initialize();
      }
    } catch (error) {
      if (!this.destroyed && request === this.authRequest)
        this.sessionError.set(this.message(error));
    } finally {
      if (!this.destroyed && request === this.authRequest) this.sessionLoading.set(false);
    }
  }
  async connect(credentials: { boardUrl: string; pat: string }) {
    if (this.sessionLoading()) return;
    const request = ++this.authRequest;
    this.sessionLoading.set(true);
    this.sessionError.set('');
    try {
      const session = await firstValueFrom(
        this.http
          .post<{ authenticated: boolean; organization: string }>('/api/session', credentials, {
            headers: this.sessionHeaders,
          })
          .pipe(timeout(120000)),
      );
      if (this.destroyed || request !== this.authRequest) return;
      this.clearSession();
      this.context.update((c) => ({ ...c, organization: session.organization }));
      this.authenticated.set(true);
      await this.initialize();
    } catch (error) {
      if (!this.destroyed && request === this.authRequest)
        this.sessionError.set(this.message(error));
    } finally {
      if (!this.destroyed && request === this.authRequest) this.sessionLoading.set(false);
    }
  }
  async disconnect() {
    if (this.sessionLoading()) return;
    this.sessionLoading.set(true);
    this.sessionError.set('');
    try {
      await firstValueFrom(
        this.http.delete('/api/session', { headers: this.sessionHeaders }).pipe(timeout(15000)),
      );
      this.authRequest++;
      this.clearSession();
    } catch (error) {
      this.sessionError.set(this.message(error));
    } finally {
      this.sessionLoading.set(false);
    }
  }
  private message(error: unknown) {
    if (error instanceof HttpErrorResponse && error.status === 401) {
      this.clearSession();
      this.sessionError.set('Tu sesión terminó o el PAT venció. Volvé a conectarte.');
    }
    return error instanceof HttpErrorResponse && typeof error.error?.error === 'string'
      ? error.error.error
      : 'No se pudo contactar al servidor. Revisá tu conexión e intentá nuevamente.';
  }
  private resetBoard() {
    this.requestId++;
    this.loading.set(false);
    this.stories.set([]);
    this.syncedAt.set(null);
    this.warnings.set([]);
    this.error.set('');
  }
  async initialize() {
    const generation = ++this.generation;
    this.catalogLoading.set(true);
    this.catalogError.set('');
    try {
      const result = await this.get<{
        value: ScopeOption[];
        defaults: { project: string; team: string; iteration: string };
      }>('/api/projects');
      if (this.destroyed || generation !== this.generation) return;
      this.projects.set(result.value);
      this.defaults = result.defaults;
      const project =
        result.value.find((p) => p.name === this.project()) ||
        result.value.find((p) => p.name === result.defaults.project) ||
        result.value[0];
      if (project) {
        await this.selectProject(project.name);
      } else {
        this.resetBoard();
        this.project.set('');
        this.team.set('');
        this.teams.set([]);
        this.sprints.set([]);
        this.selectedSprints.set([]);
      }
    } catch (error) {
      if (!this.destroyed && generation === this.generation)
        this.catalogError.set(this.message(error));
    } finally {
      if (!this.destroyed && generation === this.generation) this.catalogLoading.set(false);
    }
  }
  async selectProject(project: string) {
    const generation = ++this.generation;
    this.resetBoard();
    this.project.set(project);
    this.team.set('');
    this.teams.set([]);
    this.sprints.set([]);
    this.selectedSprints.set([]);
    this.context.update((c) => ({ ...c, project, team: '', sprint: '', iteration: '' }));
    this.catalogLoading.set(true);
    this.catalogError.set('');
    try {
      const result = await this.get<{ value: ScopeOption[] }>('/api/teams', { project });
      if (this.destroyed || generation !== this.generation) return;
      this.teams.set(result.value);
      const team =
        result.value.find(
          (t) => project === this.defaults.project && t.name === this.defaults.team,
        ) || result.value[0];
      if (team) await this.selectTeam(team.name);
    } catch (error) {
      if (!this.destroyed && generation === this.generation)
        this.catalogError.set(this.message(error));
    } finally {
      if (!this.destroyed && generation === this.generation) this.catalogLoading.set(false);
    }
  }
  async selectTeam(team: string) {
    const generation = ++this.generation;
    this.resetBoard();
    this.team.set(team);
    this.sprints.set([]);
    this.selectedSprints.set([]);
    this.context.update((c) => ({ ...c, team, sprint: '', iteration: '' }));
    this.catalogLoading.set(true);
    this.catalogError.set('');
    try {
      const result = await this.get<{ value: SprintOption[] }>('/api/sprints', {
        project: this.project(),
        team,
      });
      if (this.destroyed || generation !== this.generation) return;
      this.sprints.set(result.value);
      const preferred =
        result.value.find(
          (s) =>
            this.project() === this.defaults.project &&
            team === this.defaults.team &&
            s.path.replaceAll('\\', '/') === this.defaults.iteration.replaceAll('\\', '/'),
        ) || result.value.find((s) => s.timeFrame === 'current');
      this.catalogLoading.set(false);
      await this.selectSprints(preferred ? [preferred.id] : []);
    } catch (error) {
      if (!this.destroyed && generation === this.generation)
        this.catalogError.set(this.message(error));
    } finally {
      if (!this.destroyed && generation === this.generation) this.catalogLoading.set(false);
    }
  }
  async selectSprints(ids: string[]) {
    this.resetBoard();
    const valid = [...new Set(ids)].filter((id) => this.sprints().some((s) => s.id === id));
    this.selectedSprints.set(valid);
    this.context.update((c) => ({
      ...c,
      sprint: this.sprints()
        .filter((s) => valid.includes(s.id))
        .map((s) => s.name)
        .join(' · '),
    }));
    await this.refresh();
  }
  async refresh() {
    if (
      !this.authenticated() ||
      this.destroyed ||
      this.loading() ||
      this.catalogLoading() ||
      !this.selectedSprints().length
    )
      return;
    const request = ++this.requestId;
    let params = new HttpParams().set('project', this.project()).set('team', this.team());
    for (const id of this.selectedSprints()) params = params.append('sprint', id);
    this.loading.set(true);
    try {
      const board = await firstValueFrom(
        this.http.get<BoardResponse>('/api/board', { params }).pipe(timeout(120000)),
      );
      if (this.destroyed || request !== this.requestId) return;
      this.stories.set(board.stories);
      this.context.set(board.context);
      this.syncedAt.set(board.syncedAt);
      this.warnings.set(board.warnings);
      this.error.set('');
    } catch (error) {
      if (!this.destroyed && request === this.requestId) this.error.set(this.message(error));
    } finally {
      if (!this.destroyed && request === this.requestId) this.loading.set(false);
    }
  }
  retry() {
    return this.catalogError() ? this.initialize() : this.refresh();
  }
  async createTasks(input: TaskSubmission): Promise<{ results: TaskCreationResult[] }> {
    try {
      const result = await firstValueFrom(
        this.http
          .post<{ results: TaskCreationResult[] }>('/api/tasks', input, {
            headers: this.sessionHeaders,
          })
          .pipe(timeout(660000)),
      );
      // Discard reads started before the write, then load fresh task counts and stage.
      if (this.project() === input.project) {
        this.requestId++;
        this.loading.set(false);
        void this.refresh();
      }
      return result;
    } catch (error) {
      throw new Error(this.message(error));
    }
  }
  ngOnDestroy() {
    this.destroyed = true;
    this.authRequest++;
    this.generation++;
    this.requestId++;
    clearInterval(this.timer);
  }
  async registerHours(project: string, storyId: number, taskId: number) {
    const generation = this.generation;
    try {
      const result = await firstValueFrom(
        this.http
          .post<{ taskId: number; completedHours: number }>(
            '/api/task-hours',
            { project, storyId, taskId, confirmed: true },
            { headers: this.sessionHeaders },
          )
          .pipe(timeout(60000)),
      );
      if (generation === this.generation && this.project() === project) {
        this.requestId++;
        this.loading.set(false);
        this.stories.update((stories) =>
          stories.map((story) =>
            story.id === storyId
              ? {
                  ...story,
                  tasks: story.tasks.map((task) =>
                    task.id === taskId ? { ...task, completedHours: result.completedHours } : task,
                  ),
                }
              : story,
          ),
        );
        void this.refresh();
      }
      return result;
    } catch (error) {
      throw new Error(this.message(error));
    }
  }
}
