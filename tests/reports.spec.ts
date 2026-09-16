import { describe, expect, it } from 'vitest';
import { type Animal, type Birth, type ReproductiveEvent } from '../lib/domain';
import { reproductiveReport } from '../lib/reports';

const bovine: Animal = {
  id: 'bovine-1',
  displayId: 'B001',
  species: 'Bovino',
  breed: 'Brahman',
  sex: 'Hembra',
  birthDate: '2020-01-01',
  status: 'Activo',
  createdAt: '2020-01-01T00:00:00.000Z',
  updatedAt: '2020-01-01T00:00:00.000Z',
};
const buffalo: Animal = {
  ...bovine,
  id: 'buffalo-1',
  displayId: 'BU001',
  species: 'Búfalo',
};
const events: ReproductiveEvent[] = [
  {
    id: 'service-1',
    animalId: bovine.id,
    occurredAt: '2026-01-31T08:00',
    type: 'Servicio',
    result: '',
    valid: true,
    validationIssues: [],
    createdAt: '2026-01-31T08:00',
  },
  {
    id: 'diagnosis-positive',
    animalId: bovine.id,
    occurredAt: '2026-02-20T08:00',
    type: 'Diagnóstico',
    result: 'Gestante',
    valid: true,
    validationIssues: [],
    createdAt: '2026-02-20T08:00',
  },
  {
    id: 'service-2',
    animalId: bovine.id,
    occurredAt: '2026-06-01T08:00',
    type: 'Servicio',
    result: '',
    valid: true,
    validationIssues: [],
    createdAt: '2026-06-01T08:00',
  },
  {
    id: 'diagnosis-empty',
    animalId: bovine.id,
    occurredAt: '2026-06-20T08:00',
    type: 'Diagnóstico',
    result: 'Vacía',
    valid: true,
    validationIssues: [],
    createdAt: '2026-06-20T08:00',
  },
  {
    id: 'abortion-1',
    animalId: bovine.id,
    occurredAt: '2026-03-01T08:00',
    type: 'Aborto',
    result: '',
    valid: true,
    validationIssues: [],
    createdAt: '2026-03-01T08:00',
  },
  {
    id: 'buffalo-service',
    animalId: buffalo.id,
    occurredAt: '2026-02-01T08:00',
    type: 'Servicio',
    result: '',
    valid: true,
    validationIssues: [],
    createdAt: '2026-02-01T08:00',
  },
];
const births: Birth[] = [
  {
    id: 'birth-previous',
    motherId: bovine.id,
    occurredAt: '2025-01-01T08:00',
    type: 'Normal',
    valid: true,
    needsReview: false,
    validationIssues: [],
    createdAt: '2025-01-01T08:00',
  },
  {
    id: 'birth-current',
    motherId: bovine.id,
    occurredAt: '2026-01-01T08:00',
    type: 'Normal',
    valid: true,
    needsReview: false,
    validationIssues: [],
    createdAt: '2026-01-01T08:00',
  },
];

describe('indicadores reproductivos', () => {
  it('calcula las métricas desde eventos y partos validados del período', () => {
    expect(
      reproductiveReport(
        [bovine, buffalo],
        events,
        births,
        { species: 'Bovino', from: '2026-01-01', to: '2026-12-31' },
        '2026-09-16',
      ),
    ).toEqual({
      animalsIncluded: 1,
      positiveDiagnoses: 1,
      conclusiveDiagnoses: 2,
      pregnancyRate: 50,
      validServices: 2,
      servicesPerConception: 2,
      validatedBirths: 1,
      validatedAbortions: 1,
      averageOpenDays: 30,
      averageBirthIntervalDays: 365,
    });
  });
  it('excluye especies y datos fuera del período filtrado', () => {
    const report = reproductiveReport(
      [bovine, buffalo],
      events,
      births,
      { species: 'Búfalo', from: '2026-02-01', to: '2026-02-28' },
      '2026-09-16',
    );
    expect(report.animalsIncluded).toBe(1);
    expect(report.validServices).toBe(1);
    expect(report.conclusiveDiagnoses).toBe(0);
    expect(report.pregnancyRate).toBeUndefined();
    expect(report.validatedBirths).toBe(0);
    expect(report.averageOpenDays).toBeUndefined();
  });
});
