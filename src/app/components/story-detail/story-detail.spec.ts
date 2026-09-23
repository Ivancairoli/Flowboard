import { TestBed } from '@angular/core/testing';
import { StoryDetail } from './story-detail';
import { BoardStore } from '../../services/board-store';

describe('Register task hours', () => {
  it('registers the chosen task, blocks repeated clicks and reports failures', async () => {
    let resolve!: (value: { completedHours: number }) => void;
    const store = {
      registerHours: vi.fn().mockImplementation(
        () =>
          new Promise((done) => {
            resolve = done;
          }),
      ),
    };
    TestBed.configureTestingModule({
      imports: [StoryDetail],
      providers: [{ provide: BoardStore, useValue: store }],
    });
    const fixture = TestBed.createComponent(StoryDetail);
    fixture.componentRef.setInput('story', {
      id: 1,
      project: 'Pages',
      tasks: [
        { id: 2, title: 'Desarrollo', specialty: 'Backend', estimatedHours: 4, completedHours: 0 },
        { id: 3, title: 'Sin estimación', specialty: 'Backend', estimatedHours: null },
      ],
      bugs: [],
    });
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const button = el.querySelector(
      '[aria-label="Registrar horas de la tarea 2"]',
    ) as HTMLButtonElement;
    expect(
      (el.querySelector('[aria-label="Registrar horas de la tarea 3"]') as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    button.click();
    button.click();
    expect(store.registerHours).toHaveBeenCalledExactlyOnceWith('Pages', 1, 2);
    resolve({ completedHours: 4 });
    await fixture.whenStable();
    expect(el.textContent).toContain('Registradas: 4 h.');
    store.registerHours.mockRejectedValueOnce(new Error('Acceso denegado'));
    button.click();
    await fixture.whenStable();
    expect(el.textContent).toContain('Acceso denegado');
    expect(button.disabled).toBe(false);
  });
});
