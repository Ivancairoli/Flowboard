import { TaskSpecialty } from './story';

export type TaskAction = 'Crear' | 'Modificar' | 'Eliminar';
export type TaskOption = { id: string; area: string; name: string; specialty: TaskSpecialty };
export type TaskPreset = { name: string; entries: { optionId: string; action: TaskAction }[] };
export type TaskConfiguration = { options: TaskOption[]; presets: TaskPreset[] };
export type TaskDraft = {
  id: string;
  title: string;
  description: string;
  specialty: TaskSpecialty;
  assignee: string;
};
export type TaskCreationResult = {
  draftId: string;
  title: string;
  status: 'created' | 'existing' | 'duplicate' | 'failed' | 'unknown' | 'pending';
  id?: number;
  url?: string;
  error?: string;
};
export type TaskSubmission = {
  project: string;
  storyId: number;
  confirmed: true;
  tasks: TaskDraft[];
};

export function defaultTaskConfiguration(): TaskConfiguration {
  const options: TaskOption[] = [
    ...['Tabla', 'Columna', 'Procedimiento', 'Migración'].map((name, i) => ({
      id: `db-${i}`,
      area: 'Base de datos',
      name,
      specialty: 'Backend' as const,
    })),
    ...['Entidad/modelo', 'DTO', 'Repositorio', 'Servicio', 'Endpoint', 'Pruebas unitarias'].map(
      (name, i) => ({ id: `be-${i}`, area: 'Backend', name, specialty: 'Backend' as const }),
    ),
    ...['Modelo', 'Servicio', 'Componente', 'Pantalla', 'Pruebas unitarias'].map((name, i) => ({
      id: `fe-${i}`,
      area: 'Frontend',
      name,
      specialty: 'Frontend' as const,
    })),
    ...['Casos de prueba', 'Validación funcional', 'Regresión'].map((name, i) => ({
      id: `qa-${i}`,
      area: 'Testing',
      name,
      specialty: 'Testing' as const,
    })),
  ];
  const preset = (name: string, ids: string[], action: TaskAction = 'Modificar'): TaskPreset => ({
    name,
    entries: ids.map((optionId) => ({ optionId, action })),
  });
  return {
    options,
    presets: [
      preset('Agregar campo de punta a punta', ['db-1', 'be-1', 'be-4', 'fe-0', 'fe-1', 'fe-2']),
      preset('Frontend', ['fe-0', 'fe-1', 'fe-2', 'fe-4']),
      preset('Backend', ['be-0', 'be-1', 'be-2', 'be-3', 'be-4', 'be-5']),
      preset('Testing', ['qa-0', 'qa-1', 'qa-2'], 'Crear'),
    ],
  };
}

export function validTaskConfiguration(value: unknown): value is TaskConfiguration {
  const c = value as TaskConfiguration;
  if (
    !c ||
    !Array.isArray(c.options) ||
    !c.options.length ||
    c.options.length > 60 ||
    !Array.isArray(c.presets) ||
    c.presets.length > 30
  )
    return false;
  const ids = new Set<string>();
  for (const option of c.options) {
    if (
      !option ||
      typeof option.id !== 'string' ||
      !option.id ||
      ids.has(option.id) ||
      typeof option.area !== 'string' ||
      !option.area.trim() ||
      option.area.length > 60 ||
      typeof option.name !== 'string' ||
      !option.name.trim() ||
      option.name.length > 100 ||
      !['Frontend', 'Backend', 'Testing'].includes(option.specialty)
    )
      return false;
    ids.add(option.id);
  }
  return c.presets.every(
    (preset) =>
      preset &&
      typeof preset.name === 'string' &&
      !!preset.name.trim() &&
      preset.name.length <= 80 &&
      Array.isArray(preset.entries) &&
      preset.entries.length > 0 &&
      preset.entries.length <= 30 &&
      preset.entries.every(
        (entry) =>
          entry &&
          ids.has(entry.optionId) &&
          ['Crear', 'Modificar', 'Eliminar'].includes(entry.action),
      ),
  );
}
