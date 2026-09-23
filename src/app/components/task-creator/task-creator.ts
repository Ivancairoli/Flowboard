import {
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnInit,
  Output,
  ViewChild,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { A11yModule } from '@angular/cdk/a11y';
import { Story } from '../../models/story';
import {
  defaultTaskConfiguration,
  validTaskConfiguration,
  TaskAction,
  TaskConfiguration,
  TaskDraft,
  TaskPreset,
  TaskSubmission,
  TaskCreationResult,
} from '../../models/task-creation';
import { BoardStore } from '../../services/board-store';
import { TaskDrafts } from '../../services/task-drafts';

@Component({
  selector: 'app-task-creator',
  imports: [FormsModule, A11yModule],
  templateUrl: './task-creator.html',
  styleUrl: './task-creator.scss',
})
export class TaskCreator implements OnInit {
  @Input({ required: true }) story!: Story;
  @Output() readonly closed = new EventEmitter<void>();
  @ViewChild('creatorBody') private body?: ElementRef<HTMLElement>;
  readonly board = inject(BoardStore);
  private readonly saved = inject(TaskDrafts);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly notice = signal('');
  readonly results = signal<TaskCreationResult[]>([]);
  readonly actions: TaskAction[] = ['Crear', 'Modificar', 'Eliminar'];
  readonly specialties = ['Frontend', 'Backend', 'Testing'] as const;
  config = defaultTaskConfiguration();
  editing: TaskConfiguration | null = null;
  selected: Record<string, boolean> = {};
  action: Record<string, TaskAction> = {};
  functionality = '';
  context = '';
  assignee = '';
  presetName = '';
  drafts: TaskDraft[] = [];
  step: 'select' | 'preview' = 'select';
  submitted: TaskSubmission | null = null;
  private key = '';
  private operationKey = '';

  ngOnInit() {
    this.key = `flowboard:task-templates:v1:${this.board.context().organization.toLowerCase()}:${this.story.project.toLowerCase()}`;
    this.operationKey = `${this.key}:${this.story.id}`;
    this.functionality = this.story.title;
    try {
      const value = localStorage.getItem(this.key);
      if (value) {
        const parsed = JSON.parse(value);
        if (validTaskConfiguration(parsed)) this.config = parsed;
        else
          this.notice.set(
            'La configuración guardada no es válida. Se cargaron las opciones iniciales.',
          );
      }
    } catch {
      this.notice.set('No se pudo leer la configuración local. Podés usar las opciones iniciales.');
    }
    const previous = this.saved.submissions.get(this.operationKey);
    if (previous) {
      this.submitted = previous.payload;
      this.drafts = structuredClone(previous.payload.tasks);
      this.results.set(previous.results);
      this.step = 'preview';
    }
  }
  get areas() {
    return [...new Set(this.config.options.map((option) => option.area))];
  }
  optionsFor(area: string) {
    return this.config.options.filter((option) => option.area === area);
  }
  get selectedCount() {
    return this.config.options.filter((option) => this.selected[option.id]).length;
  }
  get validDrafts() {
    return (
      this.drafts.length > 0 &&
      this.drafts.length <= 30 &&
      this.drafts.every(
        (draft) =>
          !!draft.title.trim() &&
          draft.title.length <= 255 &&
          draft.description.length <= 10000 &&
          this.validHours(draft.estimatedHours),
      )
    );
  }
  validHours(value: number | null | undefined) {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0;
  }
  applyPreset(preset: TaskPreset) {
    this.selected = {};
    this.action = {};
    for (const entry of preset.entries) {
      this.selected[entry.optionId] = true;
      this.action[entry.optionId] = entry.action;
    }
  }
  buildPreview() {
    if (!this.functionality.trim() || !this.selectedCount || this.selectedCount > 30) return;
    this.drafts = this.config.options
      .filter((option) => this.selected[option.id])
      .map((option) => ({
        id: crypto.randomUUID(),
        title: `${this.action[option.id] || 'Modificar'} ${option.name} (${option.area}) · ${this.functionality.trim()}`,
        description: `Historia #${this.story.id}: ${this.story.title}\nÁrea técnica: ${option.area}\n\n${this.context.trim()}`,
        specialty: option.specialty,
        assignee: this.assignee.trim(),
        estimatedHours: 0,
      }));
    this.step = 'preview';
    this.error.set('');
    this.scrollToTop();
  }
  duplicate(draft: TaskDraft) {
    const normalize = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();
    const title = normalize(draft.title);
    if (!title) return '';
    const existing = this.story.tasks.find(
      (task) =>
        normalize(task.title) === title ||
        normalize(task.title).includes(title) ||
        title.includes(normalize(task.title)),
    );
    if (existing)
      return `Revisá la tarea existente #${existing.id}: ${existing.title}. Los títulos idénticos se omiten al crear.`;
    return this.drafts.some((other) => other.id !== draft.id && normalize(other.title) === title)
      ? 'Hay otra propuesta con el mismo título; se creará una sola.'
      : '';
  }
  removeDraft(id: string) {
    this.drafts = this.drafts.filter((draft) => draft.id !== id);
  }
  savePreset() {
    if (!this.presetName.trim() || !this.selectedCount || this.selectedCount > 30) return;
    const preset: TaskPreset = {
      name: this.presetName.trim(),
      entries: this.config.options
        .filter((option) => this.selected[option.id])
        .map((option) => ({ optionId: option.id, action: this.action[option.id] || 'Modificar' })),
    };
    const config = structuredClone(this.config);
    config.presets = [...config.presets.filter((item) => item.name !== preset.name), preset];
    if (this.persist(config)) this.presetName = '';
  }
  persist(config: TaskConfiguration) {
    if (!validTaskConfiguration(config)) {
      this.error.set(
        'Revisá nombres, áreas y combinaciones. Máximo: 60 opciones y 30 combinaciones.',
      );
      return false;
    }
    try {
      localStorage.setItem(this.key, JSON.stringify(config));
      this.config = structuredClone(config);
      this.notice.set('Configuración guardada para este proyecto en este navegador.');
      this.error.set('');
      return true;
    } catch {
      this.error.set('No se pudo guardar en este navegador. Revisá el almacenamiento disponible.');
      return false;
    }
  }
  editConfiguration() {
    this.editing = structuredClone(this.config);
    this.scrollToTop();
  }
  private scrollToTop() {
    if (this.body) this.body.nativeElement.scrollTop = 0;
  }
  backToSelection() {
    this.step = 'select';
    this.scrollToTop();
  }
  addOption() {
    this.editing?.options.push({
      id: crypto.randomUUID(),
      area: 'Backend',
      name: '',
      specialty: 'Backend',
    });
  }
  removeOption(id: string) {
    if (!this.editing) return;
    this.editing.options = this.editing.options.filter((option) => option.id !== id);
    this.editing.presets = this.editing.presets
      .map((preset) => ({
        ...preset,
        entries: preset.entries.filter((entry) => entry.optionId !== id),
      }))
      .filter((preset) => preset.entries.length);
  }
  removePreset(index: number) {
    this.editing?.presets.splice(index, 1);
  }
  saveConfiguration() {
    if (this.editing && this.persist(this.editing)) {
      this.editing = null;
      this.selected = {};
    }
  }
  async submit() {
    if (this.busy() || !this.validDrafts) return;
    this.submitted ||= {
      project: this.story.project,
      storyId: this.story.id,
      confirmed: true,
      tasks: structuredClone(this.drafts),
    };
    this.saved.submissions.set(this.operationKey, {
      payload: this.submitted,
      results: this.results(),
    });
    this.busy.set(true);
    this.error.set('');
    try {
      const result = await this.board.createTasks(this.submitted);
      this.results.set(result.results);
      this.saved.submissions.set(this.operationKey, {
        payload: this.submitted,
        results: result.results,
      });
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'No se pudo confirmar el resultado.');
    } finally {
      this.busy.set(false);
    }
  }
  get canStartAgain() {
    return (
      this.results().length > 0 &&
      this.results().every((result) =>
        ['created', 'existing', 'duplicate', 'failed', 'pending'].includes(result.status),
      )
    );
  }
  startAgain() {
    if (!this.canStartAgain) return;
    const pending = new Set(
      this.results()
        .filter((result) => ['failed', 'pending'].includes(result.status))
        .map((result) => result.draftId),
    );
    const remaining = this.drafts
      .filter((draft) => pending.has(draft.id))
      .map((draft) => ({ ...draft, id: crypto.randomUUID() }));
    this.saved.submissions.delete(this.operationKey);
    this.submitted = null;
    this.results.set([]);
    this.drafts = remaining;
    this.step = remaining.length ? 'preview' : 'select';
    this.error.set('');
    this.scrollToTop();
  }
  resultLabel(result: TaskCreationResult) {
    return {
      created: 'Creada',
      existing: 'Ya creada',
      duplicate: 'Omitida: título existente',
      failed: 'No creada',
      unknown: 'Resultado sin confirmar',
      pending: 'Sin enviar',
    }[result.status];
  }
}
