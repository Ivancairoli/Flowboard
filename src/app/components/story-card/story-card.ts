import { Component, Input, Output, EventEmitter } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Story } from '../../models/story';
import { TaskSpecialties } from '../task-specialties/task-specialties';

@Component({
  selector: 'app-story-card',
  imports: [MatButtonModule, MatProgressBarModule, MatTooltipModule, TaskSpecialties],
  templateUrl: './story-card.html',
  styleUrl: './story-card.scss',
})
export class StoryCard {
  @Input({ required: true }) story!: Story;
  @Input() selected = false;
  @Output() readonly storySelected = new EventEmitter<Story>();
}
