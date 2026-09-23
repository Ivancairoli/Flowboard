import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core';
import { DatePipe } from '@angular/common';
import { MatSelectModule } from '@angular/material/select';
import { ScopeOption, SprintOption } from '../../models/story';
@Component({
  selector: 'app-header',
  imports: [MatSelectModule, DatePipe],
  templateUrl: './app-header.html',
  styleUrl: './app-header.scss',
})
export class AppHeader implements OnChanges {
  @Input() organization = '';
  personalizing = false;
  preferenceError = '';
  preferences: Record<string, { alias: string; favorite: boolean }> = {};
  private get preferenceKey() {
    return `flowboard:project-preferences:v1:${this.organization.trim().toLowerCase()}`;
  }
  ngOnChanges(changes: SimpleChanges) {
    if (!changes['organization']) return;
    this.preferences = {};
    this.personalizing = false;
    this.preferenceError = '';
    if (!this.organization) return;
    try {
      const stored = JSON.parse(localStorage.getItem(this.preferenceKey) || '{}');
      if (!stored || typeof stored !== 'object' || Array.isArray(stored)) throw new Error();
      this.preferences = Object.fromEntries(
        Object.entries(stored).filter(([, value]) => {
          const entry = value as { alias?: unknown; favorite?: unknown };
          return (
            entry &&
            typeof entry.alias === 'string' &&
            entry.alias.length <= 80 &&
            typeof entry.favorite === 'boolean'
          );
        }),
      ) as typeof this.preferences;
    } catch {
      this.preferenceError = 'No se pudieron leer las preferencias de proyectos de este navegador.';
    }
  }
  preference(item: ScopeOption) {
    return Object.hasOwn(this.preferences, item.id)
      ? this.preferences[item.id]
      : { alias: '', favorite: false };
  }
  projectLabel(item: ScopeOption) {
    return this.preference(item).alias || item.name;
  }
  get orderedProjects() {
    return [...this.projects].sort(
      (a, b) =>
        Number(this.preference(b).favorite) - Number(this.preference(a).favorite) ||
        this.projectLabel(a).localeCompare(this.projectLabel(b), 'es') ||
        a.name.localeCompare(b.name),
    );
  }
  savePreference(item: ScopeOption, change: Partial<{ alias: string; favorite: boolean }>) {
    if (!this.organization) return;
    const entry = { ...this.preference(item), ...change };
    entry.alias = entry.alias.trim();
    if (entry.alias.length > 80) return;
    const next = { ...this.preferences, [item.id]: entry };
    try {
      localStorage.setItem(this.preferenceKey, JSON.stringify(next));
      this.preferences = next;
      this.preferenceError = '';
    } catch {
      this.preferenceError =
        'No se pudo guardar. Revisá el almacenamiento del navegador e intentá nuevamente.';
    }
  }
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
