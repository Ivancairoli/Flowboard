import { Component, Input } from '@angular/core';

import { Story } from '../../models/story';

@Component({
  selector: 'app-sprint-summary',
  imports: [],
  templateUrl: './sprint-summary.html',
  styleUrl: './sprint-summary.scss',
})
export class SprintSummary {
  @Input({ required: true }) stories!: Story[];
  count(stage: string) {
    return this.stories.filter((story) => story.stage === stage).length;
  }
}
