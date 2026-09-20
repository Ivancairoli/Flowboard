import { Component, Input, Output, EventEmitter, model } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { StoryFilters } from '../story-filters/story-filters';
import { StoryCard } from '../story-card/story-card';
import { Story, TeamMember } from '../../models/story';
import { STORY_STAGES, storyStage } from '../../models/story-stage';

@Component({
  selector: 'app-story-board',
  imports: [MatButtonModule, StoryFilters, StoryCard],
  templateUrl: './story-board.html',
  styleUrl: './story-board.scss',
})
export class StoryBoard {
  get columns() {
    const stages = [
      ...STORY_STAGES,
      ...(this.stories.some((story) => !story.stage)
        ? [{ name: 'Sin clasificar', color: '#7a8597', background: '#f0f3f7' }]
        : []),
    ];
    return stages.map((stage) => ({
      ...stage,
      stories: this.stories.filter((story) => storyStage(story) === stage.name),
    }));
  }
  @Input({ required: true }) stories!: Story[];
  @Input({ required: true }) total!: number;
  @Input({ required: true }) owners!: TeamMember[];
  @Input() loading = false;
  @Input() hasLoaded = false;
  @Input() selected: Story | null = null;
  readonly query = model('');
  readonly status = model('Todos');
  readonly owner = model('Todos');
  @Output() readonly storySelected = new EventEmitter<Story>();
  @Output() readonly filtersCleared = new EventEmitter<void>();
}
