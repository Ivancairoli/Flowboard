import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { Story } from '../../models/story';
import { groupTasks } from '../../models/task-specialty';
import { TaskSpecialties } from '../task-specialties/task-specialties';
import { TaskCreator } from '../task-creator/task-creator';

@Component({
  selector: 'app-story-detail',
  imports: [MatButtonModule, TaskSpecialties, TaskCreator],
  templateUrl: './story-detail.html',
  styleUrl: './story-detail.scss',
})
export class StoryDetail implements OnChanges {
  creating = false;
  ngOnChanges(changes: SimpleChanges) {
    const change = changes['story'];
    if (change?.previousValue?.id !== change?.currentValue?.id) this.creating = false;
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
