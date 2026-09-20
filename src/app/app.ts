import { Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { storyStage } from './models/story-stage';
import { BoardStore } from './services/board-store';
import { ConnectionForm } from './components/connection-form/connection-form';
import { AppHeader } from './components/app-header/app-header';
import { Sidebar } from './components/sidebar/sidebar';
import { SprintSummary } from './components/sprint-summary/sprint-summary';
import { StoryBoard } from './components/story-board/story-board';
import { StoryDetail } from './components/story-detail/story-detail';
@Component({
  selector: 'app-root',
  imports: [ConnectionForm, DatePipe, AppHeader, Sidebar, SprintSummary, StoryBoard, StoryDetail],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  readonly board = inject(BoardStore);
  readonly stories = this.board.stories;
  readonly query = signal('');
  readonly status = signal('Todos');
  readonly owner = signal('Todos');
  readonly selectedId = signal<number | null>(null);
  readonly selected = computed(
    () => this.stories().find((story) => story.id === this.selectedId()) || null,
  );
  readonly owners = computed(() =>
    [
      ...new Map(
        this.stories()
          .flatMap((story) => story.participants)
          .map((person) => [person.id, person]),
      ).values(),
    ].sort((a, b) => a.fullName.localeCompare(b.fullName)),
  );
  readonly filtered = computed(() =>
    this.stories().filter(
      (story) =>
        (story.id + ' ' + story.title).toLowerCase().includes(this.query().trim().toLowerCase()) &&
        (this.status() === 'Todos' ||
          story.status === this.status() ||
          storyStage(story) === this.status()) &&
        (this.owner() === 'Todos' ||
          story.participants.some((person) => person.id === this.owner())),
    ),
  );
  clearFilters() {
    this.query.set('');
    this.status.set('Todos');
    this.owner.set('Todos');
  }
}
