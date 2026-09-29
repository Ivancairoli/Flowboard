import { TestBed } from '@angular/core/testing';
import { AppHeader } from './app-header';

describe('Team aliases and favorites', () => {
  const teams = [
    { id: 'a', name: 'Alpha' },
    { id: 'b', name: 'Beta' },
  ];
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ imports: [AppHeader] });
  });
  afterEach(() => vi.restoreAllMocks());
  function setup(organization = 'Org', project = 'Pages') {
    const fixture = TestBed.createComponent(AppHeader);
    fixture.componentRef.setInput('organization', organization);
    fixture.componentRef.setInput('project', project);
    fixture.componentRef.setInput('projects', [{ id: 'p', name: project }]);
    fixture.componentRef.setInput('teams', teams);
    fixture.componentRef.setInput('team', 'Beta');
    fixture.detectChanges();
    return fixture;
  }
  it('edits aliases and favorites, persists them and preserves Azure identifiers', async () => {
    const fixture = setup();
    const c = fixture.componentInstance;
    const el = fixture.nativeElement as HTMLElement;
    (el.querySelector('[aria-label="Personalizar equipos"]') as HTMLButtonElement).click();
    await fixture.whenStable();
    const alias = el.querySelector('#alias-b') as HTMLInputElement;
    alias.value = 'Mi equipo';
    const row = alias.closest('.team-preference-row')!;
    (row.querySelectorAll('button')[1] as HTMLButtonElement).click();
    (row.querySelector('button') as HTMLButtonElement).click();
    await fixture.whenStable();
    expect(c.orderedTeams.map((p) => p.name)).toEqual(['Beta', 'Alpha']);
    expect(c.team).toBe('Beta');
    expect(c.project).toBe('Pages');
    expect(el.querySelector('[aria-label="Proyecto"]')?.textContent).not.toContain('Mi equipo');
    expect(el.querySelector('mat-select-trigger')?.textContent).toContain('★ Mi equipo');
    expect(setup('ORG').componentInstance.preference(teams[1])).toEqual({
      alias: 'Mi equipo',
      favorite: true,
    });
    expect(setup('Other').componentInstance.preference(teams[1])).toEqual({
      alias: '',
      favorite: false,
    });
    c.savePreference(teams[1], { alias: '', favorite: false });
    expect(c.teamLabel(teams[1])).toBe('Beta');
    expect(c.orderedTeams).toEqual(teams);
  });
  it('resets preferences when changing organizations and handles corrupt or unavailable storage', () => {
    const fixture = setup();
    const c = fixture.componentInstance;
    c.savePreference(teams[0], { alias: 'Personal' });
    fixture.componentRef.setInput('project', 'Another');
    fixture.detectChanges();
    expect(c.teamLabel(teams[0])).toBe('Alpha');
    fixture.componentRef.setInput('project', 'Pages');
    fixture.detectChanges();
    expect(c.teamLabel(teams[0])).toBe('Personal');
    fixture.componentRef.setInput('organization', 'Other');
    fixture.detectChanges();
    expect(c.teamLabel(teams[0])).toBe('Alpha');
    localStorage.setItem('flowboard:team-preferences:v1:broken:pages', '{');
    expect(setup('broken').componentInstance.preferenceError).not.toBe('');
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Full');
    });
    c.savePreference(teams[0], { favorite: true });
    expect(c.preference(teams[0]).favorite).toBe(false);
    expect(c.preferenceError).toContain('No se pudo guardar');
  });
});
