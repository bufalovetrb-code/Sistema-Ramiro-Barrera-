import { describe, expect, it } from 'vitest';
import { reproductiveAgenda } from '../lib/agenda';
import {
  defaultSettings,
  type Animal,
  type Cycle,
  type ReproductiveEvent,
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

describe('agenda reproductiva', () => {
  it('incluye revisión, diagnóstico vencido y parto próximo', () => {
    const events: ReproductiveEvent[] = [
      {
        id: 'service-1',
        animalId: animal.id,
        occurredAt: '2026-07-01T08:00',
        type: 'Servicio',
        result: '',
        valid: true,
        validationIssues: [],
        createdAt: '2026-07-01T08:00',
      },
    ];
    const cycles: Cycle[] = [
      {
        id: 'review-1',
        animalId: animal.id,
        startedAt: '2026-08-01T08:00',
        status: 'Requiere revisión',
        eventIds: [],
        reviewReasons: ['Dato pendiente de confirmar.'],
      },
      {
        id: 'diagnosis-1',
        animalId: animal.id,
        startedAt: '2026-07-01T08:00',
        status: 'Pendiente de diagnóstico',
        eventIds: ['service-1'],
        reviewReasons: [],
      },
      {
        id: 'birth-1',
        animalId: animal.id,
        startedAt: '2026-01-01T08:00',
        status: 'Gestación activa',
        eventIds: [],
        expectedBirthDate: '2026-09-20',
        reviewReasons: [],
      },
    ];
    const agenda = reproductiveAgenda(
      [animal],
      events,
      cycles,
      defaultSettings,
      '2026-09-16',
    );
    expect(agenda.map((item) => item.kind)).toEqual([
      'review',
      'diagnosis',
      'birth',
    ]);
    expect(agenda.map((item) => item.priority)).toEqual([
      'Urgente',
      'Urgente',
      'Próximo',
    ]);
  });
  it('no incluye un parto fuera de la ventana configurada', () => {
    const agenda = reproductiveAgenda(
      [animal],
      [],
      [
        {
          id: 'future-birth',
          animalId: animal.id,
          startedAt: '2026-01-01T08:00',
          status: 'Gestación activa',
          eventIds: [],
          expectedBirthDate: '2026-11-30',
          reviewReasons: [],
        },
      ],
      defaultSettings,
      '2026-09-16',
    );
    expect(agenda).toEqual([]);
  });
});
