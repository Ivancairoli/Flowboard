import { Component, Input, model } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatSelectModule } from '@angular/material/select';
import { TeamMember } from '../../models/story';

@Component({
  selector: 'app-story-filters',
  imports: [FormsModule, MatSelectModule],
  templateUrl: './story-filters.html',
  styleUrl: './story-filters.scss',
})
export class StoryFilters {
  get selectedOwnerName() {
    return this.owners.find((person) => person.id === this.owner())?.fullName || 'Responsable';
  }
  readonly query = model('');
  readonly status = model('Todos');
  readonly owner = model('Todos');
  @Input({ required: true }) owners!: TeamMember[];
}
