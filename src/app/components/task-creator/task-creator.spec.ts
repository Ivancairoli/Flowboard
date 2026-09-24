import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { TaskCreator } from './task-creator';
import { BoardStore } from '../../services/board-store';
import { defaultTaskConfiguration, validTaskConfiguration } from '../../models/task-creation';

describe('Task creator', () => {
  const story = {
    id: 1,
    title: 'Domicilio de cliente',
    project: 'Pages',
    iteration: 'Pages\\Sprint 1',
    participants: [],
    tasks: [{ id: 90, title: 'Modificar Modelo (Frontend) · Domicilio de cliente' }],
  };
  let store: any;
  beforeEach(() => {
    localStorage.clear();
    store = {
      context: signal({ organization: 'Org' }),
      createTasks: vi.fn().mockResolvedValue({ results: [] }),
    };
    TestBed.configureTestingModule({
      imports: [TaskCreator],
      providers: [{ provide: BoardStore, useValue: store }],
    });
  });
  function setup() {
    const fixture = TestBed.createComponent(TaskCreator);
    fixture.componentRef.setInput('story', story);
    fixture.detectChanges();
    return fixture;
  }
  it('builds an editable preview from a preset without writing until explicit confirmation', async () => {
    const fixture = setup();
    const c = fixture.componentInstance;
    c.applyPreset(c.config.presets.find((p) => p.name === 'Frontend')!);
    c.assignee = 'ana@example.test';
    c.context = 'Campo opcional';
    c.buildPreview();
    fixture.changeDetectorRef.markForCheck();
    fixture.detectChanges();
    expect(c.drafts).toHaveLength(4);
    expect(
      c.drafts.every((d) => d.specialty === 'Frontend' && d.assignee === 'ana@example.test'),
    ).toBe(true);
    expect(c.duplicate(c.drafts[0])).toContain('#90');
    expect(store.createTasks).not.toHaveBeenCalled();
    c.drafts[0].title = 'Modificar modelo Cliente';
    c.removeDraft(c.drafts[3].id);
    await c.submit();
    expect(store.createTasks).toHaveBeenCalledOnce();
    expect(store.createTasks.mock.calls[0][0]).toMatchObject({
      confirmed: true,
      project: 'Pages',
      storyId: 1,
    });
    expect(store.createTasks.mock.calls[0][0].tasks).toHaveLength(3);
    expect(c.submitted?.tasks[0].title).toBe('Modificar modelo Cliente');
  });
  it('edits and validates estimated hours before submission', async () => {
    const fixture = setup();
    const c = fixture.componentInstance;
    c.selected['be-0'] = true;
    c.buildPreview();
    fixture.changeDetectorRef.markForCheck();
    fixture.detectChanges();
    const hours = fixture.nativeElement.querySelector('input[type="number"]') as HTMLInputElement;
    expect(c.drafts[0].estimatedHours).toBe(0);
    hours.value = '4.5';
    hours.dispatchEvent(new Event('input', { bubbles: true }));
    await fixture.whenStable();
    expect(c.drafts[0].estimatedHours).toBe(4.5);
    expect(fixture.nativeElement.textContent).toContain('Restantes: 4.5 h · Completadas: 0 h');
    for (const invalid of [-1, null, NaN, Infinity]) {
      c.drafts[0].estimatedHours = invalid;
      expect(c.validDrafts).toBe(false);
      await c.submit();
    }
    expect(store.createTasks).not.toHaveBeenCalled();
    c.drafts[0].estimatedHours = 4.5;
    await c.submit();
    expect(store.createTasks.mock.calls[0][0].tasks[0].estimatedHours).toBe(4.5);
  });

  it('retains operation IDs across uncertain retry and reopening the dialog', async () => {
    const fixture = setup();
    const c = fixture.componentInstance;
    c.applyPreset(c.config.presets[0]);
    c.buildPreview();
    store.createTasks.mockRejectedValueOnce(new Error('Sin conexión'));
    await c.submit();
    expect(c.error()).toBe('Sin conexión');
    const first = structuredClone(c.submitted);
    fixture.destroy();
    const reopened = setup().componentInstance;
    expect(reopened.submitted).toEqual(first);
    await reopened.submit();
    expect(store.createTasks.mock.calls[1][0]).toEqual(first);
  });
  it('closes after confirmed success and clears the saved submission', async () => {
    const fixture = setup();
    const c = fixture.componentInstance;
    c.applyPreset(c.config.presets[0]);
    c.buildPreview();
    const closed = vi.fn();
    const completed = vi.fn();
    c.closed.subscribe(closed);
    c.completed.subscribe(completed);
    store.createTasks.mockResolvedValue({
      results: c.drafts.map((draft, index) => ({
        draftId: draft.id,
        title: draft.title,
        status: ['created', 'existing', 'duplicate'][index % 3],
      })),
    });
    await c.submit();
    expect(closed).toHaveBeenCalledOnce();
    expect(completed).toHaveBeenCalledOnce();
    fixture.destroy();
    const reopened = setup().componentInstance;
    expect(reopened.submitted).toBeNull();
    expect(reopened.step).toBe('select');
  });

  it('keeps partial, uncertain and incomplete results open', async () => {
    const c = setup().componentInstance;
    c.selected['be-0'] = true;
    c.buildPreview();
    const closed = vi.fn();
    const completed = vi.fn();
    c.closed.subscribe(closed);
    c.completed.subscribe(completed);
    for (const status of ['failed', 'pending', 'unknown']) {
      store.createTasks.mockResolvedValue({ results: [{ draftId: c.drafts[0].id, status }] });
      await c.submit();
    }
    store.createTasks.mockResolvedValue({ results: [] });
    await c.submit();
    expect(closed).not.toHaveBeenCalled();
    expect(completed).not.toHaveBeenCalled();
  });

  it('prevents double submission while a creation is in progress', async () => {
    let release!: (value: any) => void;
    store.createTasks.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const c = setup().componentInstance;
    c.applyPreset(c.config.presets[0]);
    c.buildPreview();
    const first = c.submit();
    await c.submit();
    expect(store.createTasks).toHaveBeenCalledOnce();
    release({ results: [] });
    await first;
    expect(c.busy()).toBe(false);
  });
  it('distinguishes same-named backend and frontend work and allows correcting unsent tasks', async () => {
    const c = setup().componentInstance;
    c.selected['be-3'] = true;
    c.selected['fe-1'] = true;
    c.selected['fe-2'] = true;
    c.buildPreview();
    expect(new Set(c.drafts.map((draft) => draft.title)).size).toBe(3);
    const originalIds = c.drafts.map((draft) => draft.id);
    store.createTasks.mockResolvedValue({
      results: c.drafts.map((draft, index) => ({
        draftId: draft.id,
        title: draft.title,
        status: ['created', 'failed', 'pending'][index],
      })),
    });
    await c.submit();
    expect(c.canStartAgain).toBe(true);
    c.startAgain();
    expect(c.submitted).toBeNull();
    expect(c.step).toBe('preview');
    expect(c.drafts).toHaveLength(2);
    expect(c.drafts.every((draft) => !originalIds.includes(draft.id))).toBe(true);
    expect(c.drafts.every((draft) => draft.specialty === 'Frontend')).toBe(true);
  });

  it('saves project-specific configuration and custom combinations', () => {
    const c = setup().componentInstance;
    c.editConfiguration();
    c.editing!.options[0].name = 'Tabla SQL';
    c.saveConfiguration();
    c.selected['db-0'] = true;
    c.action['db-0'] = 'Crear';
    c.presetName = 'Nueva tabla';
    c.savePreset();
    const same = setup().componentInstance;
    expect(same.config.options[0].name).toBe('Tabla SQL');
    expect(same.config.presets.at(-1)?.name).toBe('Nueva tabla');
    const other = TestBed.createComponent(TaskCreator);
    other.componentRef.setInput('story', { ...story, project: 'Other' });
    other.detectChanges();
    expect(other.componentInstance.config.options[0].name).toBe('Tabla');
    expect(validTaskConfiguration(defaultTaskConfiguration())).toBe(true);
    expect(validTaskConfiguration({ options: [], presets: [] })).toBe(false);
  });
});
