import { Component, Input, Output, EventEmitter } from '@angular/core';
import { DatePipe } from '@angular/common';
import { MatSelectModule } from '@angular/material/select';
import { ScopeOption, SprintOption } from '../../models/story';
@Component({
  selector: 'app-header',
  imports: [MatSelectModule, DatePipe],
  templateUrl: './app-header.html',
  styleUrl: './app-header.scss',
})
export class AppHeader {
  @Input() sessionBusy = false;
  @Output() readonly disconnected = new EventEmitter<void>();
  @Input() projects: ScopeOption[] = [];
  @Input() teams: ScopeOption[] = [];
  @Input() sprints: SprintOption[] = [];
  @Input() project = '';
  @Input() team = '';
  @Input() selectedSprints: string[] = [];
  @Input() busy = false;
  @Input() connected = false;
  @Output() readonly projectChange = new EventEmitter<string>();
  @Output() readonly teamChange = new EventEmitter<string>();
  @Output() readonly sprintsChange = new EventEmitter<string[]>();
  readonly periods = [
    { key: 'current', label: 'Actuales' },
    { key: 'future', label: 'Futuros' },
    { key: 'past', label: 'Pasados' },
    { key: 'unscheduled', label: 'Sin fechas' },
  ];
  get groups() {
    return this.periods
      .map((p) => ({
        ...p,
        sprints: this.sprints.filter((s) => (s.timeFrame || 'unscheduled') === p.key),
      }))
      .filter((g) => g.sprints.length);
  }
}
