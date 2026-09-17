import { describe, expect, it } from 'vitest';
import {
  isTaskOverdue,
  type Animal,
  type ReproductiveTask,
  validateTask,
} from '../lib/domain';

const animal: Animal = {
  id: 'animal-1',
  displayId: 'A001',
  species: 'Bovino',
  breed: 'Brahman',
  sex: 'Hembra',
  birthDate: '2020-01-01',
  status: 'Activo',
  createdAt: '2020-01-01T00:00:00.000Z',
  updatedAt: '2020-01-01T00:00:00.000Z',
};

const task: ReproductiveTask = {
  id: 'task-1',
  animalId: animal.id,
  dueDate: '2026-09-10',
  type: 'Diagnóstico',
  responsible: 'Operario local',
  status: 'Pendiente',
  createdAt: '2026-09-01T08:00:00.000Z',
};

describe('planificación reproductiva', () => {
  it('exige animal, fecha, tarea y responsable', () => {
    expect(
      validateTask(
        { animalId: '', dueDate: '', type: '' as ReproductiveTask['type'], responsible: '' },
        undefined,
      ),
    ).toEqual(
      expect.arrayContaining([
        'La tarea requiere un animal activo.',
        'La fecha programada es obligatoria.',
        'El tipo de tarea es obligatorio.',
        'La tarea requiere un responsable.',
      ]),
    );
    expect(validateTask(task, animal)).toEqual([]);
  });

  it('destaca únicamente las tareas pendientes vencidas', () => {
    expect(isTaskOverdue(task, '2026-09-16')).toBe(true);
    expect(isTaskOverdue({ ...task, status: 'Completada' }, '2026-09-16')).toBe(false);
    expect(isTaskOverdue({ ...task, dueDate: '2026-09-16' }, '2026-09-16')).toBe(false);
  });
});
