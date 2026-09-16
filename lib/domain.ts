export type Species = 'Bovino' | 'Búfalo';
export type Sex = 'Hembra' | 'Macho';
export type AnimalStatus =
  | 'Activo'
  | 'Vendido'
  | 'Muerto'
  | 'Trasladado'
  | 'Descartado';
export type CycleStatus =
  | 'Pendiente de diagnóstico'
  | 'Gestación activa'
  | 'Vacía'
  | 'Aborto'
  | 'Cerrado por parto'
  | 'Requiere revisión';
export type EventType =
  | 'Servicio'
  | 'Celo'
  | 'Diagnóstico'
  | 'Aborto'
  | 'Revisión posparto'
  | 'Resolución de revisión'
  | 'Otro';
export type EventResult = 'Gestante' | 'Vacía' | 'Dudosa' | 'No evaluable' | '';
export type ServiceMethod =
  | 'Inseminación artificial'
  | 'Monta natural'
  | 'Transferencia de embrión'
  | 'Otro';
export type DiagnosisMethod =
  | 'Palpación'
  | 'Ecografía'
  | 'Prueba de laboratorio'
  | 'Otro';
export type AbortionCause =
  | 'Desconocida'
  | 'Enfermedad'
  | 'Trauma'
  | 'Nutricional'
  | 'Otra';

export interface Animal {
  id: string;
  displayId: string;
  rfid?: string;
  earTag?: string;
  species: Species;
  breed: string;
  sex: Sex;
  birthDate: string;
  status: AnimalStatus;
  lot?: string;
  paddock?: string;
  observations?: string;
  /** Identifies a calf's mother without turning the mother's record into a duplicate. */
  motherId?: string;
  /** The validated birth from which this calf was created. */
  birthId?: string;
  weanedAt?: string;
  weaningWeightKg?: number;
  weaningNotes?: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

export interface ReproductiveEvent {
  id: string;
  animalId: string;
  occurredAt: string;
  type: EventType;
  result: EventResult;
  serviceDate?: string;
  diagnosisDate?: string;
  serviceMethod?: ServiceMethod;
  serviceReference?: string;
  responsible?: string;
  diagnosisMethod?: DiagnosisMethod;
  abortionCause?: AbortionCause;
  abortionStage?: string;
  notes?: string;
  valid: boolean;
  validationIssues: string[];
  createdAt: string;
}

export interface Birth {
  id: string;
  motherId: string;
  occurredAt: string;
  type: 'Normal' | 'Distócico' | 'Cesárea';
  sex?: Sex;
  condition?: 'Vivo' | 'Muerto' | 'Débil';
  assistance?: string;
  calfDisplayId?: string;
  calfWeightKg?: number;
  calfNotes?: string;
  motherNotes?: string;
  valid: boolean;
  needsReview: boolean;
  validationIssues: string[];
  calfId?: string;
  createdAt: string;
}

export interface AuditEntry {
  id: string;
  entity: 'Animal' | 'Evento' | 'Parto' | 'Configuración';
  entityId: string;
  action: 'Creación' | 'Edición' | 'Baja lógica' | 'Corrección';
  at: string;
  localUser: string;
  reason?: string;
}

export interface Settings {
  farmName: string;
  localUser: string;
  bovineGestationDays: number;
  buffaloGestationDays: number;
  upcomingBirthDays: number;
  postServiceDiagnosisDays: number;
  earlyBirthToleranceDays: number;
  minimumBreedingAgeMonths: number;
  animalRemovalCodeHash?: string;
}

export interface Cycle {
  id: string;
  animalId: string;
  startedAt: string;
  status: CycleStatus;
  eventIds: string[];
  expectedBirthDate?: string;
  reviewReasons: string[];
  resolvedAt?: string;
  resolutionNote?: string;
  closedAt?: string;
}

export const defaultSettings: Settings = {
  farmName: 'Finca local',
  localUser: 'Usuario local',
  bovineGestationDays: 283,
  buffaloGestationDays: 310,
  upcomingBirthDays: 30,
  postServiceDiagnosisDays: 45,
  earlyBirthToleranceDays: 45,
  minimumBreedingAgeMonths: 18,
};

export const uid = () => crypto.randomUUID();
const day = (value: string) => new Date(`${value}T12:00:00`);
const isoDay = (date: Date) => date.toISOString().slice(0, 10);
const byTime = <T extends { occurredAt?: string; createdAt?: string }>(
  a: T,
  b: T,
) =>
  (a.occurredAt ?? a.createdAt ?? '').localeCompare(
    b.occurredAt ?? b.createdAt ?? '',
  );

export interface EventValidationContext {
  previousEvents?: ReproductiveEvent[];
  hasOpenReview?: boolean;
  cycleStatus?: CycleStatus;
  today?: string;
}

export function validateEvent(
  event: ReproductiveEvent,
  animal?: Animal,
  context: EventValidationContext = {},
): string[] {
  const issues: string[] = [];
  if (!event.occurredAt || !event.type)
    issues.push('Falta fecha/hora o tipo de evento.');
  if (!animal) issues.push('El animal no existe.');
  if (
    animal &&
    ['Servicio', 'Diagnóstico', 'Aborto', 'Revisión posparto'].includes(
      event.type,
    ) &&
    animal.sex !== 'Hembra'
  )
    issues.push(
      'Este evento reproductivo solo puede registrarse para una hembra.',
    );
  if (animal && day(event.occurredAt) < day(animal.birthDate))
    issues.push('El evento es anterior al nacimiento del animal.');
  if (context.today && event.occurredAt.slice(0, 10) > context.today)
    issues.push('El evento no puede registrarse en una fecha futura.');
  if (event.type === 'Diagnóstico' && !event.result)
    issues.push('Un diagnóstico requiere resultado.');
  if (event.type === 'Servicio' && !event.serviceMethod)
    issues.push('Un servicio requiere el método utilizado.');
  if (event.type === 'Servicio' && context.cycleStatus === 'Gestación activa')
    issues.push(
      'No se puede registrar un servicio durante una gestación activa.',
    );
  if (event.type === 'Diagnóstico') {
    if (!event.diagnosisMethod)
      issues.push('Un diagnóstico requiere el método utilizado.');
    if (!event.serviceDate)
      issues.push('Un diagnóstico requiere la fecha del servicio previo.');
    if (event.serviceDate && event.serviceDate > event.occurredAt.slice(0, 10))
      issues.push('El diagnóstico no puede ser anterior al servicio.');
    if (
      event.serviceDate &&
      !context.previousEvents?.some(
        (item) =>
          item.valid &&
          item.type === 'Servicio' &&
          item.occurredAt.slice(0, 10) <= event.serviceDate!,
      )
    )
      issues.push('Diagnóstico sin servicio previo registrado.');
  }
  if (event.type === 'Aborto') {
    if (context.cycleStatus !== 'Gestación activa')
      issues.push('Aborto sin gestación activa.');
    if (!event.abortionCause)
      issues.push('Un aborto requiere registrar su causa.');
  }
  if (
    event.diagnosisDate &&
    event.serviceDate &&
    event.diagnosisDate < event.serviceDate
  )
    issues.push('La fecha de diagnóstico no puede ser anterior al servicio.');
  if (event.type === 'Resolución de revisión') {
    if (!context.hasOpenReview)
      issues.push('No hay un ciclo en revisión para resolver.');
    if (!event.notes?.trim())
      issues.push('La resolución de revisión requiere un motivo.');
  }
  if (context.hasOpenReview && event.type !== 'Resolución de revisión')
    issues.push(
      'Este ciclo requiere una resolución explícita antes de registrar otro evento.',
    );
  return issues;
}

export function validateBirth(
  birth: Pick<
    Birth,
    'motherId' | 'occurredAt' | 'condition' | 'sex' | 'calfWeightKg'
  > & {
    type?: Birth['type'];
  },
  mother: Animal | undefined,
  activeCycle: Cycle | undefined,
  settings: Settings,
  today?: string,
): string[] {
  const issues: string[] = [];
  if (!birth.motherId || !mother) issues.push('La madre no existe.');
  if (mother && mother.sex !== 'Hembra')
    issues.push('El parto solo puede registrarse para una hembra.');
  if (!birth.occurredAt)
    issues.push('La fecha y hora del parto son obligatorias.');
  if (
    mother &&
    birth.occurredAt &&
    day(birth.occurredAt) < day(mother.birthDate)
  )
    issues.push('El parto es anterior al nacimiento de la madre.');
  if (today && birth.occurredAt && birth.occurredAt.slice(0, 10) > today)
    issues.push('El parto no puede registrarse en una fecha futura.');
  if (!birth.type) issues.push('El tipo de parto es obligatorio.');
  if (!birth.condition) issues.push('La condición de la cría es obligatoria.');
  if (birth.condition === 'Vivo' && !birth.sex)
    issues.push('Una cría viva requiere registrar su sexo.');
  if (birth.calfWeightKg !== undefined && birth.calfWeightKg <= 0)
    issues.push('El peso al nacer debe ser mayor que cero.');
  if (!activeCycle || activeCycle.status !== 'Gestación activa')
    issues.push('Parto sin gestación activa.');
  if (
    birth.occurredAt &&
    activeCycle?.expectedBirthDate &&
    differenceDays(
      birth.occurredAt.slice(0, 10),
      activeCycle.expectedBirthDate,
    ) > settings.earlyBirthToleranceDays
  ) {
    issues.push('Parto demasiado anticipado frente a la fecha probable.');
  }
  return issues;
}

export function addDays(date: string, days: number) {
  const result = day(date);
  result.setDate(result.getDate() + days);
  return isoDay(result);
}

export function differenceDays(from: string, to: string) {
  return Math.round((day(to).getTime() - day(from).getTime()) / 86_400_000);
}

export interface ReproductiveIndicators {
  intervalBetweenBirthsDays?: number;
  priorOpenDays?: number;
  currentOpenDays?: number;
}

/**
 * Returns the operational indicators that can be obtained from the recorded
 * births and services. Open days are counted from a valid birth to the next
 * recorded service; for the latest birth they keep running until a service is
 * registered.
 */
export function reproductiveIndicators(
  births: Birth[],
  events: ReproductiveEvent[],
  today = isoDay(new Date()),
): ReproductiveIndicators {
  const validBirths = births
    .filter((birth) => birth.valid)
    .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  if (validBirths.length === 0) return {};

  const services = events
    .filter((event) => event.valid && event.type === 'Servicio')
    .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  const latestBirth = validBirths.at(-1)!;
  const nextServiceFor = (birth: Birth) =>
    services.find((service) => service.occurredAt > birth.occurredAt);
  const latestService = nextServiceFor(latestBirth);
  const previousBirth = validBirths.at(-2);

  return {
    intervalBetweenBirthsDays: previousBirth
      ? differenceDays(
          previousBirth.occurredAt.slice(0, 10),
          latestBirth.occurredAt.slice(0, 10),
        )
      : undefined,
    priorOpenDays: previousBirth
      ? (() => {
          const service = nextServiceFor(previousBirth);
          return service
            ? differenceDays(
                previousBirth.occurredAt.slice(0, 10),
                service.occurredAt.slice(0, 10),
              )
            : undefined;
        })()
      : undefined,
    currentOpenDays: latestService
      ? differenceDays(
          latestBirth.occurredAt.slice(0, 10),
          latestService.occurredAt.slice(0, 10),
        )
      : differenceDays(latestBirth.occurredAt.slice(0, 10), today),
  };
}

/** Derives state from immutable events and births, never list order. */
export function deriveCycles(
  animal: Animal,
  events: ReproductiveEvent[],
  births: Birth[],
  settings: Settings,
): Cycle[] {
  const timeline = [
    ...events.map((event) => ({
      kind: 'event' as const,
      data: event,
      at: event.occurredAt,
    })),
    ...births.map((birth) => ({
      kind: 'birth' as const,
      data: birth,
      at: birth.occurredAt,
    })),
  ].sort((a, b) => a.at.localeCompare(b.at));

  const cycles: Cycle[] = [];
  let current: Cycle | undefined;
  const createCycle = (startedAt: string) => {
    // The derived cycle keeps a deterministic identifier; rerendering or sorting cannot change it.
    current = {
      id: `cycle:${animal.id}:${startedAt}`,
      animalId: animal.id,
      startedAt,
      status: 'Pendiente de diagnóstico',
      eventIds: [],
      reviewReasons: [],
    };
    cycles.push(current);
  };

  for (const item of timeline) {
    if (item.kind === 'birth') {
      const birth = item.data;
      if (!current) createCycle(birth.occurredAt);
      const canClose = current!.status === 'Gestación activa';
      if (birth.needsReview || !birth.valid || !canClose) {
        current!.status = 'Requiere revisión';
        current!.reviewReasons.push(...birth.validationIssues);
        if (
          !canClose &&
          !current!.reviewReasons.includes('Parto sin gestación activa.')
        )
          current!.reviewReasons.push('Parto sin gestación activa.');
      } else {
        current!.status = 'Cerrado por parto';
        current!.closedAt = birth.occurredAt;
        current = undefined;
      }
      continue;
    }

    const event = item.data;
    if (!current || (current.closedAt && event.occurredAt > current.closedAt))
      createCycle(event.occurredAt);
    current!.eventIds.push(event.id);
    if (!event.valid) {
      current!.status = 'Requiere revisión';
      current!.reviewReasons.push(...event.validationIssues);
      continue;
    }
    if (
      current!.status === 'Requiere revisión' &&
      event.type !== 'Resolución de revisión'
    ) {
      continue;
    }
    if (event.type === 'Resolución de revisión') {
      current!.status = 'Pendiente de diagnóstico';
      current!.resolvedAt = event.occurredAt;
      current!.resolutionNote = event.notes || 'Revisión resuelta.';
      continue;
    }
    if (event.type === 'Aborto') {
      current!.status = 'Aborto';
      current!.closedAt = event.occurredAt;
      current = undefined;
    } else if (event.type === 'Diagnóstico' && event.result === 'Gestante') {
      current!.status = 'Gestación activa';
      const service = event.serviceDate ?? event.occurredAt.slice(0, 10);
      current!.expectedBirthDate = addDays(
        service,
        animal.species === 'Búfalo'
          ? settings.buffaloGestationDays
          : settings.bovineGestationDays,
      );
    } else if (event.type === 'Diagnóstico' && event.result === 'Vacía') {
      current!.status = 'Vacía';
    }
  }
  return cycles;
}

export function cyclesFor(
  animals: Animal[],
  events: ReproductiveEvent[],
  births: Birth[],
  settings: Settings,
) {
  return animals
    .filter((animal) => !animal.deletedAt)
    .flatMap((animal) =>
      deriveCycles(
        animal,
        events.filter((event) => event.animalId === animal.id),
        births.filter((birth) => birth.motherId === animal.id),
        settings,
      ),
    );
}

const created = '2026-09-08T10:00:00.000Z';
export const seedAnimals: Animal[] = [
  {
    id: 'animal-a0001',
    displayId: 'A0001',
    rfid: '982000123456789',
    earTag: 'Pendiente',
    species: 'Búfalo',
    breed: 'Murrah',
    sex: 'Hembra',
    birthDate: '2026-08-27',
    status: 'Activo',
    lot: 'Reproductoras',
    paddock: 'Potrero 1',
    createdAt: created,
    updatedAt: created,
  },
  {
    id: 'animal-a0002',
    displayId: 'A0002',
    rfid: '982000123456790',
    earTag: '126',
    species: 'Bovino',
    breed: 'Girolando',
    sex: 'Hembra',
    birthDate: '2021-08-20',
    status: 'Activo',
    lot: 'Reproductoras',
    paddock: 'Potrero 2',
    createdAt: created,
    updatedAt: created,
  },
  {
    id: 'animal-a0003',
    displayId: 'A0003',
    rfid: '982000123456791',
    earTag: '127',
    species: 'Búfalo',
    breed: 'Murrah',
    sex: 'Hembra',
    birthDate: '2021-08-20',
    status: 'Activo',
    lot: 'Búfalas',
    paddock: 'Potrero 1',
    createdAt: created,
    updatedAt: created,
  },
  {
    id: 'animal-a0004',
    displayId: 'A0004',
    rfid: '982000123456792',
    earTag: '128',
    species: 'Búfalo',
    breed: 'Murrah',
    sex: 'Hembra',
    birthDate: '2021-08-21',
    status: 'Activo',
    lot: 'Búfalas',
    paddock: 'Potrero 1',
    createdAt: created,
    updatedAt: created,
  },
];

export const seedEvents: ReproductiveEvent[] = [
  {
    id: 'event-a0001',
    animalId: 'animal-a0001',
    occurredAt: '2026-05-30T08:00',
    type: 'Diagnóstico',
    result: 'Gestante',
    serviceDate: '2026-05-01',
    diagnosisDate: '2026-05-30',
    valid: false,
    validationIssues: ['El evento es anterior al nacimiento del animal.'],
    createdAt: created,
  },
  {
    id: 'event-a0002',
    animalId: 'animal-a0002',
    occurredAt: '2026-06-30T08:00',
    type: 'Diagnóstico',
    result: 'Vacía',
    diagnosisDate: '2026-06-30',
    valid: true,
    validationIssues: [],
    createdAt: created,
  },
  {
    id: 'event-a0003',
    animalId: 'animal-a0003',
    occurredAt: '2026-06-30T08:00',
    type: 'Diagnóstico',
    result: 'Gestante',
    serviceDate: '2026-06-01',
    diagnosisDate: '2026-06-30',
    valid: true,
    validationIssues: [],
    createdAt: created,
  },
  {
    id: 'event-a0004',
    animalId: 'animal-a0004',
    occurredAt: '2026-08-28T08:00',
    type: 'Diagnóstico',
    result: '',
    valid: false,
    validationIssues: [
      'Falta fecha/hora o tipo de evento.',
      'Un diagnóstico requiere resultado.',
    ],
    createdAt: created,
  },
];

export const sortByOccurredAt = <T extends { occurredAt: string }>(
  items: T[],
) => [...items].sort(byTime);
