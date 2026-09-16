import {
  addDays,
  differenceDays,
  type Animal,
  type Cycle,
  type ReproductiveEvent,
  type Settings,
} from './domain';

export type AgendaKind = 'review' | 'diagnosis' | 'birth';
export type AgendaPriority = 'Urgente' | 'Próximo';
export interface AgendaItem {
  id: string;
  animalId: string;
  kind: AgendaKind;
  priority: AgendaPriority;
  title: string;
  detail: string;
  dueDate: string;
}

export function reproductiveAgenda(
  animals: Animal[],
  events: ReproductiveEvent[],
  cycles: Cycle[],
  settings: Settings,
  today: string,
): AgendaItem[] {
  const animalIds = new Set(animals.map((animal) => animal.id));
  const items: AgendaItem[] = [];
  const animalName = (id: string) =>
    animals.find((animal) => animal.id === id)?.displayId ?? 'Animal eliminado';

  cycles
    .filter((cycle) => cycle.status === 'Requiere revisión')
    .forEach((cycle) => {
      items.push({
        id: `review:${cycle.id}`,
        animalId: cycle.animalId,
        kind: 'review',
        priority: 'Urgente',
        title: `${animalName(cycle.animalId)} requiere revisión`,
        detail:
          cycle.reviewReasons.join(' ') || 'Revisar el ciclo reproductivo.',
        dueDate: cycle.startedAt.slice(0, 10),
      });
    });

  cycles
    .filter((cycle) => cycle.status === 'Pendiente de diagnóstico')
    .forEach((cycle) => {
      const service = events
        .filter(
          (event) =>
            cycle.eventIds.includes(event.id) &&
            event.valid &&
            event.type === 'Servicio',
        )
        .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))[0];
      if (!service) return;
      const dueDate = addDays(
        service.occurredAt.slice(0, 10),
        settings.postServiceDiagnosisDays,
      );
      if (dueDate > today) return;
      items.push({
        id: `diagnosis:${cycle.id}`,
        animalId: cycle.animalId,
        kind: 'diagnosis',
        priority: 'Urgente',
        title: `${animalName(cycle.animalId)} requiere diagnóstico`,
        detail: `Servicio registrado el ${service.occurredAt.slice(0, 10)}.`,
        dueDate,
      });
    });

  cycles
    .filter(
      (cycle) => cycle.status === 'Gestación activa' && cycle.expectedBirthDate,
    )
    .forEach((cycle) => {
      const dueDate = cycle.expectedBirthDate!;
      const daysToBirth = differenceDays(today, dueDate);
      if (daysToBirth > settings.upcomingBirthDays) return;
      items.push({
        id: `birth:${cycle.id}`,
        animalId: cycle.animalId,
        kind: 'birth',
        priority: daysToBirth < 0 ? 'Urgente' : 'Próximo',
        title:
          daysToBirth < 0
            ? `${animalName(cycle.animalId)} tiene parto vencido`
            : `${animalName(cycle.animalId)} tiene parto próximo`,
        detail:
          daysToBirth < 0
            ? `Fecha probable: ${dueDate}.`
            : `Fecha probable: ${dueDate} (${daysToBirth} día(s)).`,
        dueDate,
      });
    });

  return items
    .filter((item) => animalIds.has(item.animalId))
    .sort((a, b) => {
      const priority =
        Number(b.priority === 'Urgente') - Number(a.priority === 'Urgente');
      return priority || a.dueDate.localeCompare(b.dueDate);
    });
}
