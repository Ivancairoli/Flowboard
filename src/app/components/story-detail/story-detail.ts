import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnChanges,
  SimpleChanges,
  inject,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { Story } from '../../models/story';
import { groupTasks } from '../../models/task-specialty';
import { TaskSpecialties } from '../task-specialties/task-specialties';
import { TaskCreator } from '../task-creator/task-creator';
import { BoardStore } from '../../services/board-store';

@Component({
  selector: 'app-story-detail',
  imports: [MatButtonModule, TaskSpecialties, TaskCreator],
  templateUrl: './story-detail.html',
  styleUrl: './story-detail.scss',
})
export class StoryDetail implements OnChanges {
  creating = false;
  private readonly board = inject(BoardStore);
  readonly registering = signal<Set<number>>(new Set());
  readonly hourMessages = signal<Record<number, string>>({});
  async registerHours(taskId: number) {
    if (this.registering().has(taskId)) return;
    const { id, project } = this.story;
    this.registering.update((ids) => new Set([...ids, taskId]));
    this.hourMessages.update((messages) => ({ ...messages, [taskId]: '' }));
    try {
      const result = await this.board.registerHours(project, id, taskId);
      if (this.story.id === id && this.story.project === project)
        this.hourMessages.update((messages) => ({
          ...messages,
          [taskId]: `Registradas: ${result.completedHours} h.`,
        }));
    } catch (error) {
      if (this.story.id === id && this.story.project === project)
        this.hourMessages.update((messages) => ({
          ...messages,
          [taskId]:
            error instanceof Error
              ? error.message
              : 'No se pudo confirmar el registro. Actualizá antes de reintentar.',
        }));
    } finally {
      this.registering.update((ids) => {
        const next = new Set(ids);
        next.delete(taskId);
        return next;
      });
    }
  }
  ngOnChanges(changes: SimpleChanges) {
    const change = changes['story'];
    if (change?.previousValue?.id !== change?.currentValue?.id) {
      this.creating = false;
      this.hourMessages.set({});
    }
  }
  get taskGroups() {
    return [
      ...groupTasks(this.story.tasks),
      { name: 'Sin clasificar', tasks: this.story.tasks.filter((task) => !task.specialty) },
    ].filter((group) => group.tasks.length);
  }
  @Input({ required: true }) story!: Story;
  @Output() readonly closed = new EventEmitter<void>();
}
