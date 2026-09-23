import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { App } from './app';
import { BoardStore } from './services/board-store';
import { Story } from './models/story';

const person = { id: 'ana', name: 'Ana', fullName: 'Ana Pérez', initials: 'AP' };
const makeStory = (id: number, stage: string | null, assigned = true): Story => ({
  id,
  title: 'Historia ' + id,
  description: 'Descripción',
  stage,
  azureState: stage || 'Personalizado',
  status: stage || 'Personalizado',
  blocked: false,
  tone: 'blue',
  progress: null,
  message: 'Sin tareas vinculadas',
  assignee: assigned ? person : null,
  participants: assigned ? [person] : [],
  tasks: [],
  bugs: [],
  bugCount: 0,
  openBugCount: 0,
  project: 'Pages',
  iteration: 'Pages\\Sprint 1',
  url: 'https://dev.azure.com/PagesWeb/Pages/_workitems/edit/' + id,
});

describe('FlowBoard conectado a Azure', () => {
  let store: any;
  beforeEach(async () => {
    store = {
      stories: signal([
        makeStory(1, 'Sin comenzar'),
        makeStory(2, 'En desarrollo', false),
        makeStory(3, 'Para Testing'),
        makeStory(4, 'En testing'),
        makeStory(5, 'Finalizadas'),
        makeStory(6, null),
      ]),
      context: signal({
        organization: 'PagesWeb',
        project: 'Pages',
        team: 'Pages Team',
        iteration: 'Pages\\Sprint 1',
        sprint: 'Sprint 1',
      }),
      syncedAt: signal<string | null>('2026-09-18T12:00:00Z'),
      warnings: signal<string[]>([]),
      loading: signal(false),
      error: signal(''),
      authenticated: signal(true),
      sessionLoading: signal(false),
      sessionError: signal(''),
      connect: vi.fn(),
      disconnect: vi.fn(),
      refresh: vi.fn(),
      projects: signal([{ id: 'p', name: 'Pages' }]),
      teams: signal([{ id: 't', name: 'Pages Team' }]),
      sprints: signal([
        { id: 's', name: 'Sprint 1', path: 'Pages/Sprint 1', timeFrame: 'current' },
      ]),
      project: signal('Pages'),
      team: signal('Pages Team'),
      selectedSprints: signal(['s']),
      catalogLoading: signal(false),
      catalogError: signal(''),
      selectProject: vi.fn(),
      selectTeam: vi.fn(),
      selectSprints: vi.fn(),
      retry: () => store.refresh(),
    };
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [{ provide: BoardStore, useValue: store }],
    }).compileComponents();
  });
  it('shows live counts, all stages and unclassified stories without duplicates', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelectorAll('.story-card')).toHaveLength(6);
    expect(
      Array.from(el.querySelectorAll('.stage-column')).map((c) => c.getAttribute('aria-label')),
    ).toEqual([
      'Sin comenzar',
      'En desarrollo',
      'Para Testing',
      'En testing',
      'Testeando',
      'Finalizadas',
      'Sin clasificar',
    ]);
    expect(el.querySelector('.metrics strong')?.textContent).toBe('6');
    expect(el.textContent).not.toContain('Iván');
    expect(el.textContent).not.toContain('Vista de ejemplo');
    expect(el.querySelectorAll('mat-progress-bar')).toHaveLength(0);
  });
  it('shows and filters stories in Testeando and counts them separately from En testing', async () => {
    store.stories.set([makeStory(1, 'Testeando'), makeStory(2, 'En testing')]);
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(
      el.querySelector('[aria-label="Testeando"]')?.querySelectorAll('.story-card'),
    ).toHaveLength(1);
    expect(
      el.querySelector('[aria-label="En testing"]')?.querySelectorAll('.story-card'),
    ).toHaveLength(1);
    const metric = Array.from(el.querySelectorAll('.metric')).find((m) =>
      m.textContent?.includes('Testeando'),
    );
    expect(metric?.querySelector('strong')?.textContent).toBe('1');
    fixture.componentInstance.status.set('Testeando');
    expect(fixture.componentInstance.filtered().map((s) => s.id)).toEqual([1]);
  });

  it('highlights PSprint stories without changing their stage or duplicating counts', async () => {
    store.stories.set([
      {
        ...makeStory(1, 'Para Testing'),
        carryover: { sprint: 'Sprint anterior', iteration: 'Pages/Anterior' },
      },
      makeStory(2, 'Para Testing'),
    ]);
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelectorAll('.story-card.carryover')).toHaveLength(1);
    expect(el.querySelector('.carryover-label')?.textContent).toContain('Prioridad · PSprint');
    expect(
      el.querySelector('[aria-label="Para Testing"]')?.querySelectorAll('.story-card'),
    ).toHaveLength(2);
    expect(el.querySelector('.metrics strong')?.textContent).toBe('2');
    store.stories.set([makeStory(1, 'Para Testing'), makeStory(2, 'Para Testing')]);
    await fixture.whenStable();
    expect(el.querySelectorAll('.story-card.carryover')).toHaveLength(0);
  });

  it('shows bug counts and linked bug details and refreshes them with the board', async () => {
    const bugs = [
      {
        id: 101,
        title: 'Error al guardar',
        state: 'Active',
        completed: false,
        url: 'https://dev.azure.com/PagesWeb/Pages/_workitems/edit/101',
      },
      {
        id: 102,
        title: 'Error corregido',
        state: 'Closed',
        completed: true,
        url: 'https://dev.azure.com/PagesWeb/Pages/_workitems/edit/102',
      },
    ];
    store.stories.set([{ ...makeStory(1, 'En testing'), bugs, bugCount: 2, openBugCount: 1 }]);
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.bug-count')?.textContent).toContain('1 abiertos · 2 total');
    (el.querySelector('.story-footer button') as HTMLButtonElement).click();
    await fixture.whenStable();
    const links = el.querySelectorAll<HTMLAnchorElement>('.linked-bugs a');
    expect(links).toHaveLength(2);
    expect(links[0].href).toBe(bugs[0].url);
    expect(el.querySelector('.linked-bugs')?.textContent).toContain('Active · Abierto');
    store.stories.set([makeStory(1, 'En testing')]);
    await fixture.whenStable();
    expect(el.querySelector('.bug-count')?.textContent).toContain('0 abiertos · 0 total');
    expect(el.querySelector('.linked-bugs')?.textContent).toContain('Sin bugs vinculados.');
  });

  it('filters by real participants and stage, including custom states', () => {
    const app = TestBed.createComponent(App).componentInstance;
    app.owner.set('ana');
    expect(app.filtered()).toHaveLength(5);
    app.status.set('Sin clasificar');
    expect(app.filtered().map((s) => s.id)).toEqual([6]);
    app.clearFilters();
    expect(app.filtered()).toHaveLength(6);
  });
  it('expands the selected state, retains empty columns and restores the full board', async () => {
    store.stories.set([
      makeStory(1, 'Testeando'),
      makeStory(2, 'Testeando'),
      { ...makeStory(3, 'En desarrollo'), blocked: true, status: 'Bloqueada' },
      { ...makeStory(4, 'Para Testing'), blocked: true, status: 'Bloqueada' },
    ]);
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    const el = fixture.nativeElement as HTMLElement;
    for (const [state, count] of [
      ['Testeando', 2],
      ['Bloqueada', 2],
      ['Sin clasificar', 0],
      ['Finalizadas', 0],
    ] as const) {
      app.status.set(state);
      await fixture.whenStable();
      expect(el.querySelectorAll('.stage-column')).toHaveLength(1);
      expect(el.querySelector('.stage-column')?.getAttribute('aria-label')).toBe(state);
      expect(el.querySelectorAll('.story-card')).toHaveLength(count);
      expect(el.querySelector('.story-list')?.classList.contains('filtered-state')).toBe(true);
    }
    app.clearFilters();
    await fixture.whenStable();
    expect(el.querySelectorAll('.stage-column')).toHaveLength(6);
    expect(el.querySelectorAll('.story-card')).toHaveLength(4);
    expect(el.querySelector('.story-list')?.classList.contains('filtered-state')).toBe(false);
  });

  it('searches and clears through component events', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const search = el.querySelector('input') as HTMLInputElement;
    search.value = 'inexistente';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    await fixture.whenStable();
    expect(el.querySelectorAll('.story-card')).toHaveLength(0);
    (el.querySelector('.empty button') as HTMLButtonElement).click();
    await fixture.whenStable();
    expect(el.querySelectorAll('.story-card')).toHaveLength(6);
  });
  it('keeps the open detail in sync and closes when the story disappears', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    (el.querySelector('.story-footer button') as HTMLButtonElement).click();
    await fixture.whenStable();
    expect(el.querySelector('.detail-id')?.textContent).toContain('#1');
    store.stories.update((stories: Story[]) =>
      stories.map((s) => (s.id === 1 ? { ...s, title: 'Título actualizado' } : s)),
    );
    await fixture.whenStable();
    expect(el.querySelector('.detail h2')?.textContent).toBe('Título actualizado');
    (el.querySelector('[aria-label="Cerrar detalle"]') as HTMLButtonElement).click();
    await fixture.whenStable();
    expect(el.querySelector('.detail')).toBeNull();
    fixture.componentInstance.selectedId.set(1);
    store.stories.set([]);
    await fixture.whenStable();
    expect(el.querySelector('.detail')).toBeNull();
  });
  it('marks stale data and offers retry without displaying a false live status', async () => {
    store.error.set('PAT vencido');
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.connection-error')?.textContent).toContain('Mostrando datos de');
    expect(el.querySelector('.live')?.textContent).toContain('SIN CONEXIÓN');
    (el.querySelector('.connection-status button') as HTMLButtonElement).click();
    expect(store.refresh).toHaveBeenCalledOnce();
    expect(el.querySelectorAll('.story-card')).toHaveLength(6);
  });
  it('shows the connection form and clears the password after submitting', async () => {
    store.authenticated.set(false);
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.story-card')).toBeNull();
    const url = el.querySelector('#board-url') as HTMLInputElement;
    const pat = el.querySelector('#access-token') as HTMLInputElement;
    expect(pat.type).toBe('password');
    url.value = 'https://dev.azure.com/Org/Project';
    url.dispatchEvent(new Event('input'));
    pat.value = 'fake-pat';
    pat.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    el.querySelector('form')!.dispatchEvent(
      new Event('submit', { bubbles: true, cancelable: true }),
    );
    await fixture.whenStable();
    expect(store.connect).toHaveBeenCalledWith({
      boardUrl: 'https://dev.azure.com/Org/Project',
      pat: 'fake-pat',
    });
    expect(pat.value).toBe('');
  });
});
