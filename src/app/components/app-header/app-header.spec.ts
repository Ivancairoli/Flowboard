import { TestBed } from '@angular/core/testing';
import { AppHeader } from './app-header';

describe('Project aliases and favorites', () => {
  const projects = [
    { id: 'a', name: 'Alpha' },
    { id: 'b', name: 'Beta' },
  ];
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ imports: [AppHeader] });
  });
  afterEach(() => vi.restoreAllMocks());
  function setup(organization = 'Org') {
    const fixture = TestBed.createComponent(AppHeader);
    fixture.componentRef.setInput('organization', organization);
    fixture.componentRef.setInput('projects', projects);
    fixture.componentRef.setInput('project', 'Beta');
    fixture.detectChanges();
    return fixture;
  }
  it('edits aliases and favorites, persists them and preserves Azure identifiers', async () => {
    const fixture = setup();
    const c = fixture.componentInstance;
    const el = fixture.nativeElement as HTMLElement;
    (el.querySelector('[aria-label="Personalizar proyectos"]') as HTMLButtonElement).click();
    await fixture.whenStable();
    const alias = el.querySelector('#alias-b') as HTMLInputElement;
    alias.value = 'Mi proyecto';
    const row = alias.closest('.project-preference-row')!;
    (row.querySelectorAll('button')[1] as HTMLButtonElement).click();
    (row.querySelector('button') as HTMLButtonElement).click();
    await fixture.whenStable();
    expect(c.orderedProjects.map((p) => p.name)).toEqual(['Beta', 'Alpha']);
    expect(c.project).toBe('Beta');
    expect(el.querySelector('mat-select-trigger')?.textContent).toContain('★ Mi proyecto');
    expect(setup('ORG').componentInstance.preference(projects[1])).toEqual({
      alias: 'Mi proyecto',
      favorite: true,
    });
    expect(setup('Other').componentInstance.preference(projects[1])).toEqual({
      alias: '',
      favorite: false,
    });
    c.savePreference(projects[1], { alias: '', favorite: false });
    expect(c.projectLabel(projects[1])).toBe('Beta');
    expect(c.orderedProjects).toEqual(projects);
  });
  it('resets preferences when changing organizations and handles corrupt or unavailable storage', () => {
    const fixture = setup();
    const c = fixture.componentInstance;
    c.savePreference(projects[0], { alias: 'Personal' });
    fixture.componentRef.setInput('organization', 'Other');
    fixture.detectChanges();
    expect(c.projectLabel(projects[0])).toBe('Alpha');
    localStorage.setItem('flowboard:project-preferences:v1:broken', '{');
    expect(setup('broken').componentInstance.preferenceError).not.toBe('');
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Full');
    });
    c.savePreference(projects[0], { favorite: true });
    expect(c.preference(projects[0]).favorite).toBe(false);
    expect(c.preferenceError).toContain('No se pudo guardar');
  });
});
