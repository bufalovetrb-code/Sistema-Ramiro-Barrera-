export type Species = 'Bovino' | 'Búfalo';
export type Sex = 'Hembra' | 'Macho';
export type AnimalStatus = 'Activo' | 'Vendido' | 'Muerto' | 'Trasladado' | 'Descartado';
export type CycleStatus =
  | 'Pendiente de diagnóstico'
  | 'Gestación activa'
  | 'Vacía'
  | 'Aborto'
  | 'Cerrado por parto'
  | 'Requiere revisión';
export type EventType = 'Servicio' | 'Celo' | 'Diagnóstico' | 'Aborto' | 'Revisión posparto' | 'Otro';
export type EventResult = 'Gestante' | 'Vacía' | 'Dudosa' | 'No evaluable' | '';

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
  closedAt?: string;
}

export const defaultSettings: Settings = {
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
const byTime = <T extends { occurredAt?: string; createdAt?: string }>(a: T, b: T) =>
  (a.occurredAt ?? a.createdAt ?? '').localeCompare(b.occurredAt ?? b.createdAt ?? '');

export function validateEvent(event: ReproductiveEvent, animal?: Animal): string[] {
  const issues: string[] = [];
  if (!event.occurredAt || !event.type) issues.push('Falta fecha/hora o tipo de evento.');
  if (!animal) issues.push('El animal no existe.');
  if (animal && day(event.occurredAt) < day(animal.birthDate)) issues.push('El evento es anterior al nacimiento del animal.');
  if (event.type === 'Diagnóstico' && !event.result) issues.push('Un diagnóstico requiere resultado.');
  if (event.result === 'Gestante' && !event.serviceDate) issues.push('Una gestación requiere fecha de servicio.');
  return issues;
}

export function validateBirth(
  birth: Pick<Birth, 'motherId' | 'occurredAt'> & { type?: Birth['type'] },
  mother: Animal | undefined,
  activeCycle: Cycle | undefined,
  settings: Settings,
): string[] {
  const issues: string[] = [];
  if (!birth.motherId || !mother) issues.push('La madre no existe.');
  if (!birth.occurredAt) issues.push('La fecha y hora del parto son obligatorias.');
  if (!birth.type) issues.push('El tipo de parto es obligatorio.');
  if (!activeCycle || activeCycle.status !== 'Gestación activa') issues.push('Parto sin gestación activa.');
  if (birth.occurredAt && activeCycle?.expectedBirthDate && differenceDays(birth.occurredAt.slice(0, 10), activeCycle.expectedBirthDate) > settings.earlyBirthToleranceDays) {
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

/** Derives state from immutable events and births, never list order. */
export function deriveCycles(
  animal: Animal,
  events: ReproductiveEvent[],
  births: Birth[],
  settings: Settings,
): Cycle[] {
  const timeline = [
    ...events.map((event) => ({ kind: 'event' as const, data: event, at: event.occurredAt })),
    ...births.map((birth) => ({ kind: 'birth' as const, data: birth, at: birth.occurredAt })),
  ].sort((a, b) => a.at.localeCompare(b.at));

  const cycles: Cycle[] = [];
  let current: Cycle | undefined;
  const createCycle = (startedAt: string) => {
    // The derived cycle keeps a deterministic identifier; rerendering or sorting cannot change it.
    current = { id: `cycle:${animal.id}:${startedAt}`, animalId: animal.id, startedAt, status: 'Pendiente de diagnóstico', eventIds: [], reviewReasons: [] };
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
        if (!canClose && !current!.reviewReasons.includes('Parto sin gestación activa.')) current!.reviewReasons.push('Parto sin gestación activa.');
      } else {
        current!.status = 'Cerrado por parto';
        current!.closedAt = birth.occurredAt;
      }
      current = undefined;
      continue;
    }

    const event = item.data;
    if (!current || (current.closedAt && event.occurredAt > current.closedAt)) createCycle(event.occurredAt);
    current!.eventIds.push(event.id);
    if (!event.valid) {
      current!.status = 'Requiere revisión';
      current!.reviewReasons.push(...event.validationIssues);
      continue;
    }
    if (event.type === 'Aborto') {
      current!.status = 'Aborto';
      current!.closedAt = event.occurredAt;
      current = undefined;
    } else if (event.type === 'Diagnóstico' && event.result === 'Gestante') {
      current!.status = 'Gestación activa';
      const service = event.serviceDate ?? event.occurredAt.slice(0, 10);
      current!.expectedBirthDate = addDays(service, animal.species === 'Búfalo' ? settings.buffaloGestationDays : settings.bovineGestationDays);
    } else if (event.type === 'Diagnóstico' && event.result === 'Vacía') {
      current!.status = 'Vacía';
    }
  }
  return cycles;
}

export function cyclesFor(animals: Animal[], events: ReproductiveEvent[], births: Birth[], settings: Settings) {
  return animals.filter((animal) => !animal.deletedAt).flatMap((animal) =>
    deriveCycles(animal, events.filter((event) => event.animalId === animal.id), births.filter((birth) => birth.motherId === animal.id), settings),
  );
}

const created = '2026-09-08T10:00:00.000Z';
export const seedAnimals: Animal[] = [
  { id: 'animal-a0001', displayId: 'A0001', rfid: '982000123456789', earTag: 'Pendiente', species: 'Búfalo', breed: 'Murrah', sex: 'Hembra', birthDate: '2026-08-27', status: 'Activo', lot: 'Reproductoras', paddock: 'Potrero 1', createdAt: created, updatedAt: created },
  { id: 'animal-a0002', displayId: 'A0002', rfid: '982000123456790', earTag: '126', species: 'Bovino', breed: 'Girolando', sex: 'Hembra', birthDate: '2021-08-20', status: 'Activo', lot: 'Reproductoras', paddock: 'Potrero 2', createdAt: created, updatedAt: created },
  { id: 'animal-a0003', displayId: 'A0003', rfid: '982000123456791', earTag: '127', species: 'Búfalo', breed: 'Murrah', sex: 'Hembra', birthDate: '2021-08-20', status: 'Activo', lot: 'Búfalas', paddock: 'Potrero 1', createdAt: created, updatedAt: created },
  { id: 'animal-a0004', displayId: 'A0004', rfid: '982000123456792', earTag: '128', species: 'Búfalo', breed: 'Murrah', sex: 'Hembra', birthDate: '2021-08-21', status: 'Activo', lot: 'Búfalas', paddock: 'Potrero 1', createdAt: created, updatedAt: created },
];

export const seedEvents: ReproductiveEvent[] = [
  { id: 'event-a0001', animalId: 'animal-a0001', occurredAt: '2026-05-30T08:00', type: 'Diagnóstico', result: 'Gestante', serviceDate: '2026-05-01', diagnosisDate: '2026-05-30', valid: false, validationIssues: ['El evento es anterior al nacimiento del animal.'], createdAt: created },
  { id: 'event-a0002', animalId: 'animal-a0002', occurredAt: '2026-06-30T08:00', type: 'Diagnóstico', result: 'Vacía', diagnosisDate: '2026-06-30', valid: true, validationIssues: [], createdAt: created },
  { id: 'event-a0003', animalId: 'animal-a0003', occurredAt: '2026-06-30T08:00', type: 'Diagnóstico', result: 'Gestante', serviceDate: '2026-06-01', diagnosisDate: '2026-06-30', valid: true, validationIssues: [], createdAt: created },
  { id: 'event-a0004', animalId: 'animal-a0004', occurredAt: '2026-08-28T08:00', type: 'Diagnóstico', result: '', valid: false, validationIssues: ['Falta fecha/hora o tipo de evento.', 'Un diagnóstico requiere resultado.'], createdAt: created },
];

export const sortByOccurredAt = <T extends { occurredAt: string }>(items: T[]) => [...items].sort(byTime);
