import { describe, expect, it } from 'vitest';
import {
  defaultSettings,
  deriveCycles,
  reproductiveIndicators,
  seedAnimals,
  seedEvents,
  type Birth,
  type ReproductiveEvent,
  validateBirth,
  validateEvent,
} from '../lib/domain';

describe('ciclos reproductivos', () => {
  it('conserva los estados de aceptación A0001–A0004', () => {
    const status = (index: number) =>
      deriveCycles(
        seedAnimals[index],
        seedEvents.filter((event) => event.animalId === seedAnimals[index].id),
        [],
        defaultSettings,
      ).at(-1)?.status;
    expect(status(0)).toBe('Requiere revisión');
    expect(status(1)).toBe('Vacía');
    expect(status(2)).toBe('Gestación activa');
    expect(status(3)).toBe('Requiere revisión');
  });
  it('cierra una gestación válida y abre un ciclo posterior', () => {
    const animal = seedAnimals[2];
    const birth: Birth = {
      id: 'birth-1',
      motherId: animal.id,
      occurredAt: '2027-04-07T08:00',
      type: 'Normal',
      valid: true,
      needsReview: false,
      validationIssues: [],
      createdAt: '2027-04-07T08:00',
    };
    const newService: ReproductiveEvent = {
      id: 'service-2',
      animalId: animal.id,
      occurredAt: '2027-06-01T08:00',
      type: 'Servicio',
      result: '',
      valid: true,
      validationIssues: [],
      createdAt: '2027-06-01T08:00',
    };
    const cycles = deriveCycles(
      animal,
      [
        ...seedEvents.filter((event) => event.animalId === animal.id),
        newService,
      ],
      [birth],
      defaultSettings,
    );
    expect(cycles.map((cycle) => cycle.status)).toEqual([
      'Cerrado por parto',
      'Pendiente de diagnóstico',
    ]);
  });
  it('no cambia el estado al reordenar eventos', () => {
    const animal = seedAnimals[2];
    const events = seedEvents.filter((event) => event.animalId === animal.id);
    expect(
      deriveCycles(animal, events, [], defaultSettings).at(-1)?.status,
    ).toBe(
      deriveCycles(animal, [...events].reverse(), [], defaultSettings).at(-1)
        ?.status,
    );
  });
  it('mantiene el identificador de ciclo entre recálculos', () => {
    const animal = seedAnimals[2];
    const events = seedEvents.filter((event) => event.animalId === animal.id);
    expect(deriveCycles(animal, events, [], defaultSettings)[0].id).toBe(
      deriveCycles(animal, events, [], defaultSettings)[0].id,
    );
  });
  it('marca en revisión un parto para A0002, que está vacía', () => {
    const animal = seedAnimals[1];
    const issues = validateBirth(
      { motherId: animal.id, occurredAt: '2026-07-01T08:00', type: 'Normal' },
      animal,
      undefined,
      defaultSettings,
    );
    expect(issues).toContain('Parto sin gestación activa.');
  });
  it('exige el tipo de parto tanto en dominio como en el formulario', () => {
    const animal = seedAnimals[2];
    const active = deriveCycles(
      animal,
      seedEvents.filter((event) => event.animalId === animal.id),
      [],
      defaultSettings,
    )[0];
    expect(
      validateBirth(
        {
          motherId: animal.id,
          occurredAt: '2027-04-07T08:00',
          condition: 'Vivo',
          sex: 'Hembra',
        },
        animal,
        active,
        defaultSettings,
      ),
    ).toContain('El tipo de parto es obligatorio.');
  });
  it('cierra A0003 con parto válido, abre otro ciclo tras servicio y revisa parto anticipado', () => {
    const animal = seedAnimals[2];
    const events = seedEvents.filter((event) => event.animalId === animal.id);
    const active = deriveCycles(animal, events, [], defaultSettings)[0];
    const validBirth: Birth = {
      id: 'birth-a3',
      motherId: animal.id,
      occurredAt: '2027-04-07T08:00',
      type: 'Normal',
      valid: true,
      needsReview: false,
      validationIssues: validateBirth(
        {
          motherId: animal.id,
          occurredAt: '2027-04-07T08:00',
          type: 'Normal',
          condition: 'Vivo',
          sex: 'Hembra',
        },
        animal,
        active,
        defaultSettings,
      ),
      createdAt: '2027-04-07T08:00',
    };
    expect(validBirth.validationIssues).toEqual([]);
    expect(
      deriveCycles(animal, events, [validBirth], defaultSettings).at(-1)
        ?.status,
    ).toBe('Cerrado por parto');
    const service: ReproductiveEvent = {
      id: 'service-after-birth',
      animalId: animal.id,
      occurredAt: '2027-06-01T08:00',
      type: 'Servicio',
      result: '',
      valid: true,
      validationIssues: [],
      createdAt: '2027-06-01T08:00',
    };
    expect(
      deriveCycles(
        animal,
        [...events, service],
        [validBirth],
        defaultSettings,
      ).at(-1)?.status,
    ).toBe('Pendiente de diagnóstico');
    expect(
      validateBirth(
        { motherId: animal.id, occurredAt: '2026-07-01T08:00', type: 'Normal' },
        animal,
        active,
        defaultSettings,
      ),
    ).toContain('Parto demasiado anticipado frente a la fecha probable.');
  });
  it('no convierte un ciclo ya revisado en cerrado por parto', () => {
    const animal = seedAnimals[0];
    const birth: Birth = {
      id: 'birth-review',
      motherId: animal.id,
      occurredAt: '2027-04-07T08:00',
      type: 'Normal',
      valid: true,
      needsReview: false,
      validationIssues: [],
      createdAt: '2027-04-07T08:00',
    };
    expect(
      deriveCycles(
        animal,
        seedEvents.filter((event) => event.animalId === animal.id),
        [birth],
        defaultSettings,
      ).at(-1)?.status,
    ).toBe('Requiere revisión');
  });
  it('calcula intervalo entre partos y días abiertos desde los registros', () => {
    const births: Birth[] = [
      {
        id: 'birth-one',
        motherId: 'mother',
        occurredAt: '2025-10-11T09:00',
        type: 'Normal',
        valid: true,
        needsReview: false,
        validationIssues: [],
        createdAt: '2025-10-11T09:00',
      },
      {
        id: 'birth-two',
        motherId: 'mother',
        occurredAt: '2026-08-11T10:00',
        type: 'Normal',
        valid: true,
        needsReview: false,
        validationIssues: [],
        createdAt: '2026-08-11T10:00',
      },
    ];
    const events: ReproductiveEvent[] = [
      {
        id: 'service',
        animalId: 'mother',
        occurredAt: '2025-11-01T08:00',
        type: 'Servicio',
        result: '',
        valid: true,
        validationIssues: [],
        createdAt: '2025-11-01T08:00',
      },
    ];
    expect(reproductiveIndicators(births, events, '2026-09-11')).toEqual({
      intervalBetweenBirthsDays: 304,
      priorOpenDays: 21,
      currentOpenDays: 31,
    });
  });
  it('exige sexo para una cría viva y rechaza partos futuros', () => {
    const animal = seedAnimals[2];
    const active = deriveCycles(
      animal,
      seedEvents.filter((event) => event.animalId === animal.id),
      [],
      defaultSettings,
    )[0];
    expect(
      validateBirth(
        {
          motherId: animal.id,
          occurredAt: '2027-04-07T08:00',
          type: 'Normal',
          condition: 'Vivo',
        },
        animal,
        active,
        defaultSettings,
      ),
    ).toContain('Una cría viva requiere registrar su sexo.');
    expect(
      validateBirth(
        {
          motherId: animal.id,
          occurredAt: '2027-04-07T08:00',
          type: 'Normal',
          condition: 'Vivo',
          sex: 'Hembra',
        },
        animal,
        active,
        defaultSettings,
        '2026-09-11',
      ),
    ).toContain('El parto no puede registrarse en una fecha futura.');
  });
  it('requiere un servicio previo para registrar diagnóstico', () => {
    const animal = seedAnimals[2];
    const diagnosis: ReproductiveEvent = {
      id: 'diagnosis-without-service',
      animalId: animal.id,
      occurredAt: '2026-08-01T08:00',
      type: 'Diagnóstico',
      result: 'Gestante',
      serviceDate: '2026-07-01',
      valid: true,
      validationIssues: [],
      createdAt: '2026-08-01T08:00',
    };
    expect(validateEvent(diagnosis, animal)).toContain(
      'Diagnóstico sin servicio previo registrado.',
    );
  });
  it('mantiene una revisión hasta que se registra su resolución explícita', () => {
    const animal = seedAnimals[2];
    const pending: ReproductiveEvent = {
      id: 'pending-review',
      animalId: animal.id,
      occurredAt: '2027-05-01T08:00',
      type: 'Servicio',
      result: '',
      valid: false,
      validationIssues: ['Dato pendiente de confirmar.'],
      createdAt: '2027-05-01T08:00',
    };
    const resolution: ReproductiveEvent = {
      id: 'review-resolution',
      animalId: animal.id,
      occurredAt: '2027-05-02T08:00',
      type: 'Resolución de revisión',
      result: '',
      notes: 'Servicio confirmado con el operario.',
      valid: true,
      validationIssues: [],
      createdAt: '2027-05-02T08:00',
    };
    const cycle = deriveCycles(
      animal,
      [pending, resolution],
      [],
      defaultSettings,
    ).at(-1);
    expect(cycle?.status).toBe('Pendiente de diagnóstico');
    expect(cycle?.resolvedAt).toBe('2027-05-02T08:00');
  });
  it('bloquea nuevos eventos hasta resolver un ciclo en revisión', () => {
    const animal = seedAnimals[2];
    const service: ReproductiveEvent = {
      id: 'service-while-reviewed',
      animalId: animal.id,
      occurredAt: '2027-05-02T08:00',
      type: 'Servicio',
      result: '',
      valid: true,
      validationIssues: [],
      createdAt: '2027-05-02T08:00',
    };
    expect(validateEvent(service, animal, { hasOpenReview: true })).toContain(
      'Este ciclo requiere una resolución explícita antes de registrar otro evento.',
    );
  });
});
