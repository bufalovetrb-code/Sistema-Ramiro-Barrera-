import {
  differenceDays,
  type Animal,
  type Birth,
  type ReproductiveEvent,
} from './domain';

export interface ReportFilters {
  species: 'Todas' | Animal['species'];
  from?: string;
  to?: string;
}

export interface ReproductiveReport {
  animalsIncluded: number;
  positiveDiagnoses: number;
  conclusiveDiagnoses: number;
  pregnancyRate?: number;
  validServices: number;
  servicesPerConception?: number;
  validatedBirths: number;
  validatedAbortions: number;
  averageOpenDays?: number;
  averageBirthIntervalDays?: number;
}

const dayOf = (value: string) => value.slice(0, 10);
const average = (values: number[]) =>
  values.length === 0
    ? undefined
    : Math.round((values.reduce((total, value) => total + value, 0) / values.length) * 10) /
      10;

export function reproductiveReport(
  animals: Animal[],
  events: ReproductiveEvent[],
  births: Birth[],
  filters: ReportFilters,
  today: string,
): ReproductiveReport {
  const withinPeriod = (value: string) => {
    const day = dayOf(value);
    return (!filters.from || day >= filters.from) && (!filters.to || day <= filters.to);
  };
  const selectedAnimals = animals.filter(
    (animal) =>
      !animal.deletedAt &&
      (filters.species === 'Todas' || animal.species === filters.species),
  );
  const animalIds = new Set(selectedAnimals.map((animal) => animal.id));
  const scopedEvents = events.filter(
    (event) => animalIds.has(event.animalId) && withinPeriod(event.occurredAt),
  );
  const scopedBirths = births.filter(
    (birth) => animalIds.has(birth.motherId) && withinPeriod(birth.occurredAt),
  );
  const conclusiveDiagnoses = scopedEvents.filter(
    (event) =>
      event.valid &&
      event.type === 'Diagnóstico' &&
      (event.result === 'Gestante' || event.result === 'Vacía'),
  );
  const positiveDiagnoses = conclusiveDiagnoses.filter(
    (event) => event.result === 'Gestante',
  );
  const validServices = scopedEvents.filter(
    (event) => event.valid && event.type === 'Servicio',
  );

  const openDays: number[] = [];
  const birthIntervals: number[] = [];
  selectedAnimals.forEach((animal) => {
    const animalBirths = births
      .filter((birth) => birth.motherId === animal.id && birth.valid)
      .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
    animalBirths.forEach((birth, index) => {
      if (!withinPeriod(birth.occurredAt)) return;
      const nextService = events
        .filter(
          (event) =>
            event.animalId === animal.id &&
            event.valid &&
            event.type === 'Servicio' &&
            event.occurredAt > birth.occurredAt,
        )
        .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))[0];
      const referenceDate = nextService?.occurredAt.slice(0, 10) ?? today;
      openDays.push(differenceDays(dayOf(birth.occurredAt), referenceDate));
      const previousBirth = animalBirths[index - 1];
      if (previousBirth)
        birthIntervals.push(
          differenceDays(
            dayOf(previousBirth.occurredAt),
            dayOf(birth.occurredAt),
          ),
        );
    });
  });

  return {
    animalsIncluded: selectedAnimals.length,
    positiveDiagnoses: positiveDiagnoses.length,
    conclusiveDiagnoses: conclusiveDiagnoses.length,
    pregnancyRate:
      conclusiveDiagnoses.length > 0
        ? Math.round((positiveDiagnoses.length / conclusiveDiagnoses.length) * 1000) /
          10
        : undefined,
    validServices: validServices.length,
    servicesPerConception:
      positiveDiagnoses.length > 0
        ? Math.round((validServices.length / positiveDiagnoses.length) * 100) / 100
        : undefined,
    validatedBirths: scopedBirths.filter((birth) => birth.valid).length,
    validatedAbortions: scopedEvents.filter(
      (event) => event.valid && event.type === 'Aborto',
    ).length,
    averageOpenDays: average(openDays),
    averageBirthIntervalDays: average(birthIntervals),
  };
}
