import { Component, computed, input } from '@angular/core';
import { MatTooltipModule } from '@angular/material/tooltip';
import { StoryTask } from '../../models/story';
import { groupTasks } from '../../models/task-specialty';

@Component({
  selector: 'app-task-specialties',
  imports: [MatTooltipModule],
  templateUrl: './task-specialties.html',
  styleUrl: './task-specialties.scss',
})
export class TaskSpecialties {
  readonly tasks = input.required<StoryTask[]>();
  readonly groups = computed(() => groupTasks(this.tasks()));
  readonly unclassified = computed(() => this.tasks().filter((task) => !task.specialty).length);
}
