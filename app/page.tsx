'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CalendarDays,
  ClipboardCheck,
  ChevronRight,
  ClipboardPlus,
  BarChart3,
  Beef,
  FileSearch,
  Funnel,
  HeartPulse,
  ListTodo,
  Menu,
  Plus,
  Printer,
  Search,
  Settings2,
  X,
} from 'lucide-react';
import {
  cyclesFor,
  defaultSettings,
  reproductiveIndicators,
  type Animal,
  type AuditEntry,
  type Birth,
  type Cycle,
  type CycleStatus,
  type ReproductiveEvent,
  type ReproductiveTask,
  type Settings,
  uid,
  isTaskOverdue,
  validateBirth,
  validateEvent,
  validateTask,
} from '@/lib/domain';
import { LocalFarmRepository, type FarmData } from '@/lib/repository';
import { reproductiveAgenda, type AgendaItem } from '@/lib/agenda';
import { reproductiveReport, type ReportFilters } from '@/lib/reports';
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';
import {
  acceptRemoteInvitation,
  inviteRemoteMember,
  listRemoteFarms,
  listRemoteInvitations,
  listRemoteMembers,
  pullRemoteFarm,
  removeRemoteMember,
  syncFarmData,
  updateRemoteMemberRole,
  type FarmRole,
  type RemoteFarm,
  type RemoteInvitation,
  type RemoteMember,
} from '@/lib/remote-sync';

type View =
  | 'Resumen'
  | 'Animales'
  | 'Eventos'
  | 'Ciclos'
  | 'Agenda'
  | 'Planificación'
  | 'Indicadores'
  | 'Partos'
  | 'Auditoría'
  | 'Configuración';
type AnimalListFilter =
  | 'all'
  | 'parous-females'
  | 'heifers'
  | 'females'
  | 'breeding-females'
  | 'calves'
  | 'female-calves'
  | 'male-calves'
  | 'breeders'
  | 'young-males';
const animalListFilters: { value: AnimalListFilter; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'parous-females', label: 'Hembras paridas' },
  { value: 'heifers', label: 'Novillas / levante' },
  { value: 'breeding-females', label: 'Hembras reproductoras' },
  { value: 'females', label: 'Todas las hembras' },
  { value: 'calves', label: 'Todas las crías' },
  { value: 'female-calves', label: 'Crías hembras' },
  { value: 'male-calves', label: 'Crías machos' },
  { value: 'breeders', label: 'Reproductores' },
  { value: 'young-males', label: 'Machos jóvenes' },
];
const empty: FarmData = {
  animals: [],
  events: [],
  births: [],
  tasks: [],
  audits: [],
  settings: defaultSettings,
};
const fmt = new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium' });
const date = (value?: string) =>
  value ? fmt.format(new Date(`${value.slice(0, 10)}T12:00:00`)) : '—';
export const backupFileName = (farmName: string, exportedAt: string) => {
  const safeFarm = farmName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  return `rb-smartfarm-respaldo-${exportedAt.slice(0, 10)}-${safeFarm || 'finca'}.json`;
};
export const backupStatusFor = (settings: Settings, now = new Date()) => {
  const today = now.toISOString().slice(0, 10);
  const last = settings.lastBackupDownloadedAt;
  if (!last)
    return {
      due: true,
      label: 'Respaldo pendiente',
      detail: 'Aún no hay una descarga registrada en este dispositivo.',
    };
  if (last.slice(0, 10) !== today)
    return {
      due: true,
      label: 'Respaldo de hoy pendiente',
      detail: `La última descarga registrada fue el ${date(last)}.`,
    };
  return {
    due: false,
    label: 'Respaldo de hoy descargado',
    detail: `Última descarga registrada: ${date(last)}.`,
  };
};
export const backupCountsFor = (data: FarmData) => ({
  animals: data.animals.length,
  events: data.events.length,
  births: data.births.length,
  tasks: data.tasks.length,
});
type BackupWritableFile = {
  write: (data: Blob) => Promise<void>;
  close: () => Promise<void>;
};
type BackupFileHandle = {
  createWritable: () => Promise<BackupWritableFile>;
};
type BackupSavePicker = (options: {
  suggestedName: string;
  types: { description: string; accept: Record<string, string[]> }[];
}) => Promise<BackupFileHandle>;
const requestPrint = (target: 'report' | 'technical-sheet') => {
  if (typeof window.print !== 'function') return;
  const clearTarget = () => {
    delete document.body.dataset.printTarget;
  };
  document.body.dataset.printTarget = target;
  window.addEventListener('afterprint', clearTarget, { once: true });
  window.print();
};
const eventDetail = (event: ReproductiveEvent) => {
  if (event.type === 'Servicio')
    return [
      event.serviceMethod,
      event.serviceReference,
      event.responsible && `Responsable: ${event.responsible}`,
    ]
      .filter(Boolean)
      .join(' · ');
  if (event.type === 'Diagnóstico')
    return [
      event.diagnosisMethod,
      event.serviceDate && `Servicio: ${date(event.serviceDate)}`,
    ]
      .filter(Boolean)
      .join(' · ');
  if (event.type === 'Aborto')
    return [event.abortionCause, event.abortionStage, event.notes]
      .filter(Boolean)
      .join(' · ');
  return event.notes || 'Sin detalle registrado';
};
const birthDetail = (birth: Birth) =>
  [
    birth.valid ? 'Parto validado' : birth.validationIssues.join(' '),
    birth.condition,
    birth.calfWeightKg && `${birth.calfWeightKg} kg al nacer`,
    birth.motherNotes,
  ]
    .filter(Boolean)
    .join(' · ');
const statusClass = (status: CycleStatus) =>
  status === 'Gestación activa'
    ? 'good'
    : status === 'Vacía' || status === 'Cerrado por parto'
      ? 'neutral'
      : status === 'Requiere revisión' || status === 'Aborto'
        ? 'danger'
        : 'warning';
const formValue = (data: FormData, name: string) => {
  const value = data.get(name);
  return typeof value === 'string' ? value : '';
};
const numericSettingKeys = [
  'bovineGestationDays',
  'buffaloGestationDays',
  'upcomingBirthDays',
  'postServiceDiagnosisDays',
  'earlyBirthToleranceDays',
  'minimumBreedingAgeMonths',
] as const;
const secretHash = async (value: string) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)),
    ),
  )
    .map((part) => part.toString(16).padStart(2, '0'))
    .join('');
const ageInMonths = (birthDate: string) => {
  const birth = new Date(`${birthDate}T12:00:00`);
  const today = new Date();
  if (Number.isNaN(birth.getTime()) || birth > today) return 0;
  return Math.max(
    0,
    (today.getFullYear() - birth.getFullYear()) * 12 +
      today.getMonth() -
      birth.getMonth() -
      (today.getDate() < birth.getDate() ? 1 : 0),
  );
};
const minimumBreedingAge = (
  _animal: Animal,
  settings: Settings = defaultSettings,
) => settings.minimumBreedingAgeMonths;
const inventoryCategory = (
  animal: Animal,
  settings: Settings = defaultSettings,
) => {
  const months = ageInMonths(animal.birthDate);
  const minimum = minimumBreedingAge(animal, settings);
  if (months < 12)
    return { label: 'Cría', tone: 'neutral', group: 'cría' as const };
  if (months < minimum) {
    return animal.sex === 'Hembra'
      ? {
          label: 'Novilla / levante',
          tone: 'warning',
          group: 'novilla' as const,
        }
      : {
          label: 'Macho joven / levante',
          tone: 'warning',
          group: 'joven' as const,
        };
  }
  return animal.sex === 'Hembra'
    ? {
        label: 'Hembra reproductora',
        tone: 'good',
        group: 'hembra-reproductora' as const,
      }
    : { label: 'Reproductor', tone: 'good', group: 'reproductor' as const };
};
const reproductiveCategory = (animal: Animal, settings?: Settings) =>
  inventoryCategory(animal, settings);
const ageLabel = (animal: Animal) => {
  const months = ageInMonths(animal.birthDate);
  return `${Math.floor(months / 12)} año(s) y ${months % 12} mes(es)`;
};
const nextCalfDisplayId = (animals: Animal[], birthDate: string) => {
  const year = birthDate.slice(0, 4);
  const prefix = `CR-${year}-`;
  const used = new Set(animals.map((animal) => animal.displayId));
  let serial = 1;
  let candidate = `${prefix}${String(serial).padStart(3, '0')}`;
  while (used.has(candidate)) {
    serial += 1;
    candidate = `${prefix}${String(serial).padStart(3, '0')}`;
  }
  return candidate;
};
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;
export const restoreDataFrom = (source: unknown): FarmData | undefined => {
  if (!isRecord(source)) return undefined;
  const candidate = isRecord(source.data) ? source.data : source;
  if (
    !Array.isArray(candidate.animals) ||
    !Array.isArray(candidate.events) ||
    !Array.isArray(candidate.births) ||
    !Array.isArray(candidate.audits) ||
    !isRecord(candidate.settings)
  )
    return undefined;
  const animals = candidate.animals as Animal[];
  if (
    animals.some(
      (animal) =>
        !isRecord(animal) ||
        typeof animal.id !== 'string' ||
        typeof animal.displayId !== 'string',
    )
  )
    return undefined;
  const duplicateAnimal =
    new Set(animals.map((animal) => animal.id)).size !== animals.length ||
    new Set(animals.map((animal) => animal.displayId.trim().toLowerCase()))
      .size !== animals.length;
  if (duplicateAnimal) return undefined;
  const ids = new Set(animals.map((animal) => animal.id));
  const tasks = Array.isArray(candidate.tasks)
    ? (candidate.tasks as ReproductiveTask[])
    : [];
  if (
    (candidate.events as ReproductiveEvent[]).some(
      (event) => !ids.has(event.animalId),
    ) ||
    (candidate.births as Birth[]).some((birth) => !ids.has(birth.motherId)) ||
    tasks.some((task) => !ids.has(task.animalId))
  )
    return undefined;
  return {
    animals,
    events: candidate.events as ReproductiveEvent[],
    births: candidate.births as Birth[],
    tasks,
    audits: candidate.audits as AuditEntry[],
    settings: {
      ...defaultSettings,
      ...(candidate.settings as Partial<Settings>),
    },
  };
};

export default function Home() {
  const [data, setData] = useState<FarmData>(empty);
  const [loaded, setLoaded] = useState(false);
  const [view, setView] = useState<View>('Resumen');
  const [animalFilter, setAnimalFilter] = useState<AnimalListFilter>('all');
  const [mobileNav, setMobileNav] = useState(false);
  const [notice, setNotice] = useState('');
  const [remoteUserEmail, setRemoteUserEmail] = useState<string>();
  const [remotePasswordRecovery, setRemotePasswordRecovery] = useState(false);
  const [remoteFarms, setRemoteFarms] = useState<RemoteFarm[]>([]);
  const [remoteInvitations, setRemoteInvitations] = useState<RemoteInvitation[]>([]);
  const [remoteMembers, setRemoteMembers] = useState<RemoteMember[]>([]);
  const repo = useMemo(() => new LocalFarmRepository(), []);
  const cycles = useMemo(
    () => cyclesFor(data.animals, data.events, data.births, data.settings),
    [data],
  );
  useEffect(() => {
    repo
      .load()
      .then((saved) => {
        setData(saved);
        setLoaded(true);
      })
      .catch(() => setNotice('No se pudo abrir el almacenamiento local.'));
  }, [repo]);
  const refreshRemoteWorkspace = async (farmId = data.settings.remoteFarmId) => {
    if (!isSupabaseConfigured || !remoteUserEmail) return;
    const [farms, invitations] = await Promise.all([
      listRemoteFarms(),
      listRemoteInvitations(),
    ]);
    setRemoteFarms(farms);
    setRemoteInvitations(invitations);
    const selected = farms.find((farm) => farm.id === farmId);
    if (selected?.role === 'owner') setRemoteMembers(await listRemoteMembers(selected.id));
    else setRemoteMembers([]);
  };
  const refreshRemoteUser = async () => {
    if (!isSupabaseConfigured) return;
    const { data: auth } = await getSupabase().auth.getUser();
    setRemoteUserEmail(auth.user?.email);
  };
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    const authHash = new URLSearchParams(window.location.hash.slice(1));
    const recoveryType = authHash.get('type');
    if (authHash.get('error_code') === 'otp_expired') {
      setNotice(
        'El enlace de acceso ya fue utilizado o expiró. Solicita un enlace nuevo para definir tu contraseña.',
      );
      window.history.replaceState(null, '', window.location.pathname);
    }
    // Password reset links return to the root of the PWA.  The form lives in
    // Configuración, so take the person there automatically instead of
    // leaving them on the dashboard with no visible next step.
    if (recoveryType === 'recovery' || recoveryType === 'invite') {
      setRemotePasswordRecovery(true);
      setView('Configuración');
    }
    const {
      data: { subscription },
    } = getSupabase().auth.onAuthStateChange((event, session) => {
      setRemoteUserEmail(session?.user.email);
      if (event === 'PASSWORD_RECOVERY') {
        setRemotePasswordRecovery(true);
        setView('Configuración');
      }
    });
    void refreshRemoteUser();
    return () => subscription.unsubscribe();
  }, []);
  useEffect(() => {
    if (!remoteUserEmail) {
      setRemoteFarms([]);
      setRemoteInvitations([]);
      setRemoteMembers([]);
      return;
    }
    void refreshRemoteWorkspace().catch(() => {
      // The session remains usable even if the shared-workspace list is unavailable.
    });
  }, [remoteUserEmail, data.settings.remoteFarmId]);
  const persist = async (next: FarmData) => {
    setData(next);
    await repo.save(next);
  };
  const exportBackup = async () => {
    const exportedAt = new Date().toISOString();
    const backupData = {
      ...data,
      settings: { ...data.settings, lastBackupDownloadedAt: exportedAt },
    };
    const backup = {
      format: 'RB SmartFarm respaldo local',
      version: 1,
      exportedAt,
      farmName: backupData.settings.farmName,
      recordCounts: backupCountsFor(backupData),
      data: backupData,
    };
    const file = new Blob([JSON.stringify(backup, null, 2)], {
      type: 'application/json',
    });
    const filename = backupFileName(backupData.settings.farmName, exportedAt);
    const savePicker = (window as Window & { showSaveFilePicker?: BackupSavePicker })
      .showSaveFilePicker;
    if (savePicker) {
      try {
        const handle = await savePicker({
          suggestedName: filename,
          types: [
            {
              description: 'Respaldo RB SmartFarm',
              accept: { 'application/json': ['.json'] },
            },
          ],
        });
        const writable = await handle.createWritable();
        await writable.write(file);
        await writable.close();
        await persist(backupData);
        setNotice('Respaldo guardado. Conserva una segunda copia en una ubicación diferente.');
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          setNotice('Guardado de respaldo cancelado. Los datos locales no cambiaron.');
          return;
        }
      }
    }
    const link = document.createElement('a');
    const objectUrl = URL.createObjectURL(file);
    link.href = objectUrl;
    link.download = filename;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    link.remove();
    // The integrated browser may start the download asynchronously. Releasing
    // the Blob URL immediately cancels that handoff and leaves it as "Detenida".
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    await persist(backupData);
    setNotice(
      'Respaldo descargado. Ahora guarda una copia fuera de Descargas y una segunda copia en la ubicación remota aprobada.',
    );
  };
  const restoreBackup = async (file: File) => {
    try {
      const restored = restoreDataFrom(JSON.parse(await file.text()));
      if (!restored) {
        setNotice('El archivo no es un respaldo válido de RB SmartFarm.');
        return;
      }
      if (
        !confirm(
          `Se reemplazarán los datos actuales (${data.animals.length} animales, ${data.events.length} eventos, ${data.births.length} partos y ${data.tasks.length} tareas) por el respaldo (${restored.animals.length} animales, ${restored.events.length} eventos, ${restored.births.length} partos y ${restored.tasks.length} tareas). ¿Deseas continuar?`,
        )
      )
        return;
      await persist({
        ...restored,
        settings: {
          ...restored.settings,
          lastBackupRestoredAt: new Date().toISOString(),
        },
      });
      setNotice('Respaldo restaurado correctamente en este dispositivo.');
    } catch {
      setNotice('No fue posible leer este archivo de respaldo.');
    }
  };
  const audit = (
    entity: 'Animal' | 'Evento' | 'Parto' | 'Tarea' | 'Configuración',
    entityId: string,
    action: 'Creación' | 'Edición' | 'Baja lógica' | 'Corrección',
    reason?: string,
  ) => ({
    id: uid(),
    entity,
    entityId,
    action,
    at: new Date().toISOString(),
    localUser: data.settings.localUser.trim() || 'Usuario local',
    reason,
  });
  const canEditSelectedFarm = () => {
    const selected = remoteFarms.find(
      (farm) => farm.id === data.settings.remoteFarmId,
    );
    if (selected?.role !== 'viewer') return true;
    setNotice('Tu rol es Solo lectura. No puedes modificar esta finca compartida.');
    return false;
  };
  const addAnimal = async (form: HTMLFormElement) => {
    if (!canEditSelectedFarm()) return;
    const values = new FormData(form);
    const now = new Date().toISOString();
    const animal: Animal = {
      id: uid(),
      displayId: formValue(values, 'displayId').trim(),
      rfid: formValue(values, 'rfid').trim() || undefined,
      earTag: formValue(values, 'earTag').trim() || undefined,
      species: formValue(values, 'species') as Animal['species'],
      breed: formValue(values, 'breed').trim() || 'Otra',
      sex: formValue(values, 'sex') as Animal['sex'],
      birthDate: formValue(values, 'birthDate'),
      status: 'Activo',
      lot: formValue(values, 'lot').trim() || undefined,
      paddock: formValue(values, 'paddock').trim() || undefined,
      createdAt: now,
      updatedAt: now,
    };
    const duplicate = data.animals.some(
      (item) =>
        item.displayId === animal.displayId ||
        (!!animal.rfid && item.rfid === animal.rfid) ||
        (!!animal.earTag && item.earTag === animal.earTag),
    );
    if (!animal.displayId || !animal.birthDate || duplicate) {
      setNotice('Verifica ID, fecha de nacimiento y RFID/arete únicos.');
      return;
    }
    await persist({
      ...data,
      animals: [...data.animals, animal],
      audits: [...data.audits, audit('Animal', animal.id, 'Creación')],
    });
    form.reset();
    setNotice(`Animal ${animal.displayId} creado.`);
  };
  const addEvent = async (form: HTMLFormElement) => {
    if (!canEditSelectedFarm()) return;
    const values = new FormData(form);
    const animalId = formValue(values, 'animalId');
    const animal = data.animals.find((item) => item.id === animalId);
    const draft: ReproductiveEvent = {
      id: uid(),
      animalId,
      occurredAt: formValue(values, 'occurredAt'),
      type: formValue(values, 'type') as ReproductiveEvent['type'],
      result: formValue(values, 'result') as ReproductiveEvent['result'],
      serviceDate: formValue(values, 'serviceDate') || undefined,
      diagnosisDate:
        formValue(values, 'diagnosisDate') ||
        (formValue(values, 'type') === 'Diagnóstico'
          ? formValue(values, 'occurredAt').slice(0, 10)
          : undefined),
      serviceMethod: (formValue(values, 'serviceMethod') ||
        undefined) as ReproductiveEvent['serviceMethod'],
      serviceReference: formValue(values, 'serviceReference') || undefined,
      responsible: formValue(values, 'responsible') || undefined,
      diagnosisMethod: (formValue(values, 'diagnosisMethod') ||
        undefined) as ReproductiveEvent['diagnosisMethod'],
      abortionCause: (formValue(values, 'abortionCause') ||
        undefined) as ReproductiveEvent['abortionCause'],
      abortionStage: formValue(values, 'abortionStage') || undefined,
      notes: formValue(values, 'notes') || undefined,
      valid: true,
      validationIssues: [],
      createdAt: new Date().toISOString(),
    };
    draft.validationIssues = validateEvent(draft, animal, {
      previousEvents: data.events.filter(
        (event) => event.animalId === animalId,
      ),
      hasOpenReview: cycles.some(
        (cycle) =>
          cycle.animalId === animalId && cycle.status === 'Requiere revisión',
      ),
      cycleStatus: cycles.filter((cycle) => cycle.animalId === animalId).at(-1)
        ?.status,
      today: new Date().toISOString().slice(0, 10),
    });
    draft.valid = draft.validationIssues.length === 0;
    await persist({
      ...data,
      events: [...data.events, draft],
      audits: [...data.audits, audit('Evento', draft.id, 'Creación')],
    });
    form.reset();
    setNotice(
      draft.valid
        ? 'Evento registrado.'
        : 'Evento guardado en Ciclos por revisar.',
    );
  };
  const addTask = async (form: HTMLFormElement) => {
    if (!canEditSelectedFarm()) return;
    const values = new FormData(form);
    const animalId = formValue(values, 'animalId');
    const task: ReproductiveTask = {
      id: uid(),
      animalId,
      dueDate: formValue(values, 'dueDate'),
      type: formValue(values, 'type') as ReproductiveTask['type'],
      responsible: formValue(values, 'responsible').trim(),
      notes: formValue(values, 'notes').trim() || undefined,
      status: 'Pendiente',
      createdAt: new Date().toISOString(),
    };
    const issues = validateTask(
      task,
      data.animals.find((animal) => animal.id === animalId && !animal.deletedAt),
    );
    if (issues.length > 0) {
      setNotice(issues[0]);
      return;
    }
    await persist({
      ...data,
      tasks: [...data.tasks, task],
      audits: [
        ...data.audits,
        audit(
          'Tarea',
          task.id,
          'Creación',
          `${task.type} programada para ${task.dueDate}.`,
        ),
      ],
    });
    form.reset();
    setNotice(`Tarea de ${task.type.toLocaleLowerCase()} programada.`);
  };
  const updateTaskStatus = async (
    task: ReproductiveTask,
    status: Extract<ReproductiveTask['status'], 'Completada' | 'Cancelada'>,
  ) => {
    if (!canEditSelectedFarm()) return;
    const completedAt = status === 'Completada' ? new Date().toISOString() : undefined;
    await persist({
      ...data,
      tasks: data.tasks.map((item) =>
        item.id === task.id ? { ...item, status, completedAt } : item,
      ),
      audits: [
        ...data.audits,
        audit(
          'Tarea',
          task.id,
          'Edición',
          `${task.type} marcada como ${status.toLocaleLowerCase()}.`,
        ),
      ],
    });
    setNotice(`Tarea marcada como ${status.toLocaleLowerCase()}.`);
  };
  const addBirth = async (form: HTMLFormElement) => {
    if (!canEditSelectedFarm()) return;
    const values = new FormData(form);
    const motherId = formValue(values, 'motherId');
    const mother = data.animals.find((animal) => animal.id === motherId);
    const relevant = cycles
      .filter(
        (cycle) =>
          cycle.animalId === motherId && cycle.status === 'Gestación activa',
      )
      .at(-1);
    const occurredAt = formValue(values, 'occurredAt');
    const type = formValue(values, 'type') as Birth['type'];
    const sex = (formValue(values, 'sex') || undefined) as Birth['sex'];
    const condition = (formValue(values, 'condition') ||
      undefined) as Birth['condition'];
    const calfWeightText = formValue(values, 'calfWeightKg');
    const calfWeightKg = calfWeightText ? Number(calfWeightText) : undefined;
    const calfDisplayId = formValue(values, 'calfDisplayId').trim();
    const issues = validateBirth(
      { motherId, occurredAt, type, sex, condition, calfWeightKg },
      mother,
      relevant,
      data.settings,
      new Date().toISOString().slice(0, 10),
    );
    if (
      calfDisplayId &&
      data.animals.some(
        (animal) =>
          animal.displayId.trim().toLocaleLowerCase() ===
          calfDisplayId.toLocaleLowerCase(),
      )
    )
      issues.push('El ID visible de la cría ya está en uso.');
    const birthId = uid();
    const shouldCreateCalf =
      issues.length === 0 &&
      formValue(values, 'condition') === 'Vivo' &&
      mother;
    const calf = shouldCreateCalf
      ? {
          id: uid(),
          displayId:
            calfDisplayId ||
            nextCalfDisplayId(data.animals, occurredAt.slice(0, 10)),
          species: mother.species,
          breed: mother.breed,
          sex: sex as Animal['sex'],
          birthDate: occurredAt.slice(0, 10),
          status: 'Activo' as const,
          lot: mother.lot,
          paddock: mother.paddock,
          motherId: mother.id,
          birthId,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }
      : undefined;
    const birth: Birth = {
      id: birthId,
      motherId,
      occurredAt,
      type,
      sex,
      condition,
      assistance: formValue(values, 'assistance') || undefined,
      calfDisplayId: calf?.displayId,
      calfWeightKg,
      calfNotes: formValue(values, 'calfNotes') || undefined,
      motherNotes: formValue(values, 'motherNotes') || undefined,
      valid: issues.length === 0,
      needsReview: issues.length > 0,
      validationIssues: issues,
      calfId: calf?.id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await persist({
      ...data,
      animals: calf ? [...data.animals, calf] : data.animals,
      births: [...data.births, birth],
      audits: [
        ...data.audits,
        audit(
          'Parto',
          birth.id,
          'Creación',
          issues.join(' ') || 'Parto validado.',
        ),
        ...(calf
          ? [
              audit(
                'Animal',
                calf.id,
                'Creación',
                `Cría de ${mother?.displayId ?? 'madre registrada'}.`,
              ),
              audit(
                'Parto',
                birth.id,
                'Edición',
                `Cría ${calf.displayId} creada automáticamente.`,
              ),
            ]
          : []),
      ],
    });
    form.reset();
    setNotice(
      birth.valid
        ? calf
          ? `Parto registrado, ciclo cerrado y cría ${calf.displayId} creada.`
          : 'Parto registrado y ciclo cerrado.'
        : 'Parto guardado para revisión.',
    );
  };
  const createCalf = async (birth: Birth) => {
    if (!canEditSelectedFarm()) return;
    if (birth.calfId || !birth.valid) return;
    const mother = data.animals.find((item) => item.id === birth.motherId);
    if (!mother) return;
    const now = new Date().toISOString();
    const calf: Animal = {
      id: uid(),
      displayId:
        birth.calfDisplayId ||
        nextCalfDisplayId(data.animals, birth.occurredAt.slice(0, 10)),
      species: mother.species,
      breed: mother.breed,
      sex: birth.sex ?? 'Hembra',
      birthDate: birth.occurredAt.slice(0, 10),
      status: 'Activo',
      lot: mother.lot,
      paddock: mother.paddock,
      motherId: mother.id,
      birthId: birth.id,
      createdAt: now,
      updatedAt: now,
    };
    await persist({
      ...data,
      animals: [...data.animals, calf],
      births: data.births.map((item) =>
        item.id === birth.id
          ? { ...item, calfId: calf.id, updatedAt: now }
          : item,
      ),
      audits: [
        ...data.audits,
        audit('Animal', calf.id, 'Creación'),
        audit(
          'Parto',
          birth.id,
          'Edición',
          'Cría creada tras confirmación explícita.',
        ),
      ],
    });
    setNotice(`Cría ${calf.displayId} creada.`);
  };
  const registerWeaning = async (animal: Animal, form: HTMLFormElement) => {
    if (!canEditSelectedFarm()) return false;
    const values = new FormData(form);
    const weanedAt = formValue(values, 'weanedAt');
    const weightText = formValue(values, 'weaningWeightKg');
    const weaningWeightKg = weightText ? Number(weightText) : undefined;
    if (!weanedAt || (weaningWeightKg !== undefined && weaningWeightKg <= 0)) {
      setNotice('Registra una fecha de destete y un peso válido si aplica.');
      return false;
    }
    const notes = formValue(values, 'weaningNotes').trim() || undefined;
    const now = new Date().toISOString();
    await persist({
      ...data,
      animals: data.animals.map((item) =>
        item.id === animal.id
          ? {
              ...item,
              weanedAt,
              weaningWeightKg,
              weaningNotes: notes,
              updatedAt: now,
            }
          : item,
      ),
      audits: [
        ...data.audits,
        audit(
          'Animal',
          animal.id,
          'Edición',
          `Destete registrado${weaningWeightKg ? `: ${weaningWeightKg} kg.` : '.'}`,
        ),
      ],
    });
    setNotice(`Destete de ${animal.displayId} registrado.`);
    return true;
  };
  const retireAnimal = async (animal: Animal, passcode: string) => {
    if (!canEditSelectedFarm()) return false;
    if (!data.settings.animalRemovalCodeHash) {
      setNotice('Primero configura la clave de eliminación en Configuración.');
      return false;
    }
    if ((await secretHash(passcode)) !== data.settings.animalRemovalCodeHash) {
      setNotice('La clave de eliminación no es correcta.');
      return false;
    }
    if (
      !confirm(
        `¿Confirmas retirar a ${animal.displayId} de la operación? Su historial se conservará.`,
      )
    )
      return false;
    const now = new Date().toISOString();
    await persist({
      ...data,
      animals: data.animals.map((item) =>
        item.id === animal.id
          ? { ...item, status: 'Descartado', deletedAt: now, updatedAt: now }
          : item,
      ),
      audits: [
        ...data.audits,
        audit(
          'Animal',
          animal.id,
          'Baja lógica',
          'Retirado de operación mediante clave de eliminación.',
        ),
      ],
    });
    setNotice(
      `${animal.displayId} fue retirado de la operación. Su historial quedó guardado.`,
    );
    return true;
  };
  const saveSettings = async (form: HTMLFormElement) => {
    if (!canEditSelectedFarm()) return;
    const vals = new FormData(form);
    const settings = {
      ...data.settings,
      farmName: formValue(vals, 'farmName').trim() || defaultSettings.farmName,
      localUser:
        formValue(vals, 'localUser').trim() || defaultSettings.localUser,
      ...Object.fromEntries(
        numericSettingKeys.map((key) => [key, Number(vals.get(key))]),
      ),
      updatedAt: new Date().toISOString(),
    } as Settings;
    await persist({
      ...data,
      settings,
      audits: [...data.audits, audit('Configuración', 'parámetros', 'Edición')],
    });
    setNotice('Parámetros guardados localmente.');
  };
  const saveRemovalCode = async (form: HTMLFormElement) => {
    const values = new FormData(form);
    const passcode = formValue(values, 'passcode');
    if (
      data.settings.animalRemovalCodeHash &&
      (await secretHash(formValue(values, 'currentPasscode'))) !==
        data.settings.animalRemovalCodeHash
    ) {
      setNotice('La clave actual no es correcta.');
      return;
    }
    if (
      passcode.length < 8 ||
      passcode !== formValue(values, 'passcodeConfirm')
    ) {
      setNotice(
        'La clave debe tener al menos 8 caracteres y coincidir en ambos campos.',
      );
      return;
    }
    await persist({
      ...data,
      settings: {
        ...data.settings,
        animalRemovalCodeHash: await secretHash(passcode),
      },
      audits: [
        ...data.audits,
        audit(
          'Configuración',
          'clave-eliminación',
          'Edición',
          'Clave de eliminación de animales actualizada.',
        ),
      ],
    });
    form.reset();
    setNotice('Clave de eliminación guardada en este dispositivo.');
  };
  const signInRemote = async (form: HTMLFormElement) => {
    const values = new FormData(form);
    const { error } = await getSupabase().auth.signInWithPassword({
      email: formValue(values, 'remoteEmail').trim(),
      password: formValue(values, 'remotePassword'),
    });
    if (error) {
      setNotice(`No fue posible iniciar sesión: ${error.message}`);
      return;
    }
    await refreshRemoteUser();
    await refreshRemoteWorkspace();
    form.reset();
    setNotice('Sesión remota iniciada. Selecciona una finca compartida o sincroniza la finca local.');
  };
  const signUpRemote = async (form: HTMLFormElement) => {
    const values = new FormData(form);
    const { error } = await getSupabase().auth.signUp({
      email: formValue(values, 'remoteEmail').trim(),
      password: formValue(values, 'remotePassword'),
    });
    if (error) {
      setNotice(`No fue posible crear la cuenta piloto: ${error.message}`);
      return;
    }
    form.reset();
    setNotice('Cuenta piloto solicitada. La contraseña es la que escribiste en este formulario; no se genera ni se muestra después. Revisa el correo de confirmación antes de iniciar sesión.');
  };
  const requestRemotePasswordReset = async (form: HTMLFormElement) => {
    const values = new FormData(form);
    const { error } = await getSupabase().auth.resetPasswordForEmail(
      formValue(values, 'remoteEmail').trim(),
      { redirectTo: window.location.origin },
    );
    if (error) {
      setNotice(`No fue posible solicitar el cambio de contraseña: ${error.message}`);
      return;
    }
    form.reset();
    setNotice('Si el correo tiene una cuenta piloto, recibirás un enlace para definir una nueva contraseña.');
  };
  const updateRemotePassword = async (form: HTMLFormElement) => {
    const values = new FormData(form);
    const password = formValue(values, 'remotePassword');
    if (password !== formValue(values, 'remotePasswordConfirmation')) {
      setNotice('Las contraseñas no coinciden.');
      return;
    }
    const { error } = await getSupabase().auth.updateUser({ password });
    if (error) {
      setNotice(`No fue posible actualizar la contraseña: ${error.message}`);
      return;
    }
    form.reset();
    setRemotePasswordRecovery(false);
    setNotice('Contraseña actualizada. Guárdala en un lugar seguro para futuros inicios de sesión.');
  };
  const signOutRemote = async () => {
    await getSupabase().auth.signOut();
    setRemoteUserEmail(undefined);
    setRemoteFarms([]);
    setRemoteInvitations([]);
    setRemoteMembers([]);
    setNotice('Sesión remota cerrada en este dispositivo.');
  };
  const selectRemoteFarm = async (farmId: string) => {
    const remote = remoteFarms.find((farm) => farm.id === farmId);
    if (!remote) return;
    if (
      !confirm(
        `Se descargará ${remote.name} y reemplazará la vista local actual de este dispositivo. Antes de continuar, confirma que tienes respaldo de cualquier trabajo local pendiente. ¿Deseas abrir esta finca?`,
      )
    )
      return;
    try {
      const pulled = await pullRemoteFarm(data, farmId);
      await persist(pulled);
      await refreshRemoteWorkspace(farmId);
      setNotice(`Finca compartida ${remote.name} cargada. Rol actual: ${remote.role}.`);
    } catch (error) {
      setNotice(`No se pudo abrir la finca compartida: ${error instanceof Error ? error.message : 'Error desconocido.'}`);
    }
  };
  const acceptInvitation = async (invitationId: string) => {
    try {
      const farmId = await acceptRemoteInvitation(invitationId);
      await refreshRemoteWorkspace(farmId);
      setNotice('Invitación aceptada. Ya puedes abrir la finca compartida.');
    } catch (error) {
      setNotice(`No se pudo aceptar la invitación: ${error instanceof Error ? error.message : 'Error desconocido.'}`);
    }
  };
  const inviteMember = async (form: HTMLFormElement) => {
    if (!data.settings.remoteFarmId) return;
    const values = new FormData(form);
    try {
      await inviteRemoteMember(
        data.settings.remoteFarmId,
        formValue(values, 'memberEmail'),
        formValue(values, 'memberRole') as Exclude<FarmRole, 'owner'>,
      );
      form.reset();
      setNotice('Invitación creada. La persona debe iniciar sesión con ese correo y aceptarla en RB SmartFarm.');
    } catch (error) {
      setNotice(`No se pudo crear la invitación: ${error instanceof Error ? error.message : 'Error desconocido.'}`);
    }
  };
  const changeMemberRole = async (
    userId: string,
    role: Exclude<FarmRole, 'owner'>,
  ) => {
    if (!data.settings.remoteFarmId) return;
    try {
      await updateRemoteMemberRole(data.settings.remoteFarmId, userId, role);
      await refreshRemoteWorkspace();
      setNotice('Permiso del usuario actualizado.');
    } catch (error) {
      setNotice(`No se pudo actualizar el permiso: ${error instanceof Error ? error.message : 'Error desconocido.'}`);
    }
  };
  const removeMember = async (userId: string) => {
    if (!data.settings.remoteFarmId || !confirm('¿Retirar este usuario de la finca compartida?')) return;
    try {
      await removeRemoteMember(data.settings.remoteFarmId, userId);
      await refreshRemoteWorkspace();
      setNotice('Usuario retirado de la finca compartida.');
    } catch (error) {
      setNotice(`No se pudo retirar el usuario: ${error instanceof Error ? error.message : 'Error desconocido.'}`);
    }
  };
  const syncRemote = async () => {
    if (
      !confirm(
        'Se compararán los datos locales con la finca remota seleccionada. Los cambios compatibles se enviarán y luego se descargará la versión remota. Ante un conflicto, se conserva la versión remota y se te avisará. ¿Deseas continuar?',
      )
    )
      return;
    try {
      const result = await syncFarmData(data);
      await persist(result.data);
      const completionMessage =
        result.conflicts
          ? `Sincronización terminada: ${result.records} registros y ${result.audits} auditorías procesados. ${result.conflicts} conflicto(s): se conservó la versión remota y fue descargada.`
          : `Sincronización terminada: ${result.records} registros y ${result.audits} entradas de auditoría procesados y actualizados.`;
      // La escritura y descarga ya fueron exitosas. El aviso debe mostrarse
      // incluso si la actualización auxiliar de la lista compartida falla.
      setNotice(completionMessage);
      try {
        await refreshRemoteWorkspace(result.farmId);
      } catch {
        setNotice(
          `${completionMessage} La lista de usuarios se actualizará al recargar la página.`,
        );
      }
    } catch (error) {
      setNotice(
        `No se pudo sincronizar: ${error instanceof Error ? error.message : 'Error desconocido.'}`,
      );
    }
  };
  const activeAnimals = data.animals.filter((item) => !item.deletedAt);
  const reviewCycles = cycles.filter(
    (cycle) => cycle.status === 'Requiere revisión',
  );
  const nowDay = new Date().toISOString().slice(0, 10);
  const overdueTasks = data.tasks.filter((task) => isTaskOverdue(task, nowDay));
  const agenda = useMemo(
    () =>
      reproductiveAgenda(
        activeAnimals,
        data.events,
        cycles,
        data.settings,
        nowDay,
      ),
    [activeAnimals, cycles, data.events, data.settings, nowDay],
  );
  const nav: { icon: React.ReactNode; label: View }[] = [
    { icon: <HeartPulse />, label: 'Resumen' },
    {
      icon: (
        <span className="nav-animal-icon" aria-hidden="true">
          🐃
        </span>
      ),
      label: 'Animales',
    },
    { icon: <ClipboardPlus />, label: 'Eventos' },
    { icon: <CalendarDays />, label: 'Ciclos' },
    { icon: <ListTodo />, label: 'Agenda' },
    { icon: <ClipboardCheck />, label: 'Planificación' },
    { icon: <BarChart3 />, label: 'Indicadores' },
    {
      icon: (
        <span className="nav-animal-icon" aria-hidden="true">
          🐮
        </span>
      ),
      label: 'Partos',
    },
    { icon: <FileSearch />, label: 'Auditoría' },
    { icon: <Settings2 />, label: 'Configuración' },
  ];
  return (
    <main className="farm-shell">
      <aside
        className={`sidebar ${mobileNav ? 'open' : ''}`}
        aria-label="Navegación principal"
      >
        <div className="brand">
          <span className="brand-mark">RB</span>
          <span>
            <strong>SmartFarm</strong>
            <small>Reproducción</small>
          </span>
          <button
            className="icon-button close-nav"
            onClick={() => setMobileNav(false)}
            aria-label="Cerrar menú"
          >
            <X />
          </button>
        </div>
        <nav>
          {nav.map(({ icon, label }) => (
            <button
              key={label}
              className={view === label ? 'nav-active' : ''}
              onClick={() => {
                setView(label);
                if (label === 'Animales') setAnimalFilter('all');
                setMobileNav(false);
              }}
            >
              {icon}
              {label}
              {label === 'Ciclos' && reviewCycles.length > 0 && (
                <em>{reviewCycles.length}</em>
              )}
              {label === 'Agenda' && agenda.length > 0 && (
                <em>{agenda.length}</em>
              )}
              {label === 'Planificación' && overdueTasks.length > 0 && (
                <em>{overdueTasks.length}</em>
              )}
            </button>
          ))}
        </nav>
        <div className="offline">
          <span />
          Datos en este dispositivo
          <br />
          <small>
            {loaded ? 'Listos para uso offline' : 'Abriendo almacenamiento…'}
          </small>
        </div>
      </aside>
      <section className="content">
        <header className="topbar">
          <button
            className="icon-button menu"
            onClick={() => setMobileNav(true)}
            aria-label="Abrir menú"
          >
            <Menu />
          </button>
          <div>
            <p className="eyebrow">{data.settings.farmName}</p>
            <h1>{view}</h1>
          </div>
          <div className="top-actions">
            <span className="sync-state">
              {remoteUserEmail ? '● Sesión remota activa' : '● Datos locales'}
            </span>
            <button
              className="primary"
              onClick={() => setView(view === 'Eventos' ? 'Partos' : 'Eventos')}
            >
              <Plus /> Registrar
            </button>
          </div>
        </header>
        {notice && (
          <div className="notice" role="status">
            <AlertTriangle />
            {notice}
            <button onClick={() => setNotice('')} aria-label="Cerrar aviso">
              <X />
            </button>
          </div>
        )}
        {!loaded ? (
          <div className="loading">Cargando los datos locales…</div>
        ) : (
          <div className="view-area">
            {view === 'Resumen' && (
              <Dashboard
                animals={activeAnimals}
                cycles={cycles}
                births={data.births}
                overdueTasks={overdueTasks.length}
                review={reviewCycles}
                agenda={agenda}
                settings={data.settings}
                onNavigate={setView}
                onOpenAnimals={(filter) => {
                  setAnimalFilter(filter);
                  setView('Animales');
                }}
              />
            )}
            {view === 'Animales' && (
              <Animals
                animals={data.animals}
                cycles={cycles}
                events={data.events}
                births={data.births}
                audits={data.audits}
                settings={data.settings}
                selectedFilter={animalFilter}
                onFilterChange={setAnimalFilter}
                onAdd={addAnimal}
                onRetire={retireAnimal}
                onWean={registerWeaning}
              />
            )}
            {view === 'Eventos' && (
              <Events
                events={data.events}
                animals={activeAnimals}
                onAdd={addEvent}
              />
            )}
            {view === 'Ciclos' && (
              <Cycles cycles={cycles} animals={activeAnimals} />
            )}
            {view === 'Agenda' && (
              <Agenda items={agenda} onNavigate={setView} />
            )}
            {view === 'Planificación' && (
              <Tasks
                tasks={data.tasks}
                animals={activeAnimals}
                today={nowDay}
                onAdd={addTask}
                onUpdateStatus={updateTaskStatus}
              />
            )}
            {view === 'Indicadores' && (
              <Indicators
                animals={data.animals}
                events={data.events}
                births={data.births}
              />
            )}
            {view === 'Partos' && (
              <Births
                births={data.births}
                animals={activeAnimals}
                cycles={cycles}
                onAdd={addBirth}
                onCreateCalf={createCalf}
              />
            )}
            {view === 'Auditoría' && (
              <Audit entries={data.audits} onNavigate={setView} />
            )}
            {view === 'Configuración' && (
              <Configuration
                settings={data.settings}
                backupStatus={backupStatusFor(data.settings)}
                remoteConfigured={isSupabaseConfigured}
                remoteUserEmail={remoteUserEmail}
                remotePasswordRecovery={remotePasswordRecovery}
                remoteFarms={remoteFarms}
                remoteInvitations={remoteInvitations}
                remoteMembers={remoteMembers}
                onSave={saveSettings}
                onSaveRemovalCode={saveRemovalCode}
                onExportBackup={exportBackup}
                onRestoreBackup={restoreBackup}
                onSignInRemote={signInRemote}
                onSignUpRemote={signUpRemote}
                onRequestRemotePasswordReset={requestRemotePasswordReset}
                onUpdateRemotePassword={updateRemotePassword}
                onSignOutRemote={signOutRemote}
                onSyncRemote={syncRemote}
                onSelectRemoteFarm={selectRemoteFarm}
                onAcceptInvitation={acceptInvitation}
                onInviteMember={inviteMember}
                onChangeMemberRole={changeMemberRole}
                onRemoveMember={removeMember}
              />
            )}
          </div>
        )}
      </section>
    </main>
  );
}

function Dashboard({
  animals,
  cycles,
  births,
  overdueTasks,
  review,
  agenda,
  settings,
  onNavigate,
  onOpenAnimals,
}: {
  animals: Animal[];
  cycles: Cycle[];
  births: Birth[];
  overdueTasks: number;
  review: Cycle[];
  agenda: AgendaItem[];
  settings: Settings;
  onNavigate: (v: View) => void;
  onOpenAnimals: (filter: AnimalListFilter) => void;
}) {
  const metric = (label: string, value: number, tone: string) => (
    <article className={`metric ${tone}`} key={label}>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
  const inventoryCount = (
    group: ReturnType<typeof inventoryCategory>['group'],
  ) =>
    animals.filter(
      (animal) => inventoryCategory(animal, settings).group === group,
    ).length;
  const calfCount = (sex: Animal['sex']) =>
    animals.filter(
      (animal) =>
        inventoryCategory(animal, settings).group === 'cría' &&
        animal.sex === sex,
    ).length;
  return (
    <>
      <section className="hero">
        <div>
          <p className="eyebrow">Panel operativo</p>
          <h2>La reproducción, clara para actuar.</h2>
          <p>Seguimiento local de cada hembra, ciclo y parto.</p>
        </div>
        <div className="hero-count">
          <Beef />
          <strong>{animals.length}</strong>
          <span>animales activos</span>
        </div>
      </section>
      <section className="metrics">
        {metric(
          'Hembras activas',
          animals.filter((item) => item.sex === 'Hembra').length,
          'blue',
        )}
        {metric(
          'Gestaciones activas',
          cycles.filter((item) => item.status === 'Gestación activa').length,
          'green',
        )}
        {metric(
          'Vacías',
          cycles.filter((item) => item.status === 'Vacía').length,
          'gray',
        )}
        {metric(
          'Partos validados',
          births.filter((item) => item.valid).length,
          'purple',
        )}
        {metric('Ciclos por revisar', review.length, 'red')}
        {metric('Tareas vencidas', overdueTasks, 'red')}
      </section>
      <section className="panel inventory-summary">
        <div className="panel-head">
          <div>
            <p className="eyebrow">Inventario actual</p>
            <h3>Animales presentes en la finca</h3>
            <p>Clasificación automática según sexo, especie y edad.</p>
          </div>
          <button className="quiet" onClick={() => onOpenAnimals('all')}>
            Ver Base maestra <ChevronRight />
          </button>
        </div>
        <div className="inventory-breakdown">
          <button onClick={() => onOpenAnimals('female-calves')}>
            <span>Crías hembras</span>
            <strong>{calfCount('Hembra')}</strong>
          </button>
          <button onClick={() => onOpenAnimals('male-calves')}>
            <span>Crías machos</span>
            <strong>{calfCount('Macho')}</strong>
          </button>
          <button onClick={() => onOpenAnimals('heifers')}>
            <span>Novillas / levante</span>
            <strong>{inventoryCount('novilla')}</strong>
          </button>
          <button onClick={() => onOpenAnimals('breeding-females')}>
            <span>Hembras reproductoras</span>
            <strong>{inventoryCount('hembra-reproductora')}</strong>
          </button>
          <button onClick={() => onOpenAnimals('breeders')}>
            <span>Reproductores</span>
            <strong>{inventoryCount('reproductor')}</strong>
          </button>
          <button onClick={() => onOpenAnimals('young-males')}>
            <span>Machos jóvenes</span>
            <strong>{inventoryCount('joven')}</strong>
          </button>
        </div>
      </section>
      <section className="dashboard-grid">
        <article className="panel">
          <div className="panel-head">
            <div>
              <h3>Alertas prioritarias</h3>
              <p>Información que requiere seguimiento.</p>
            </div>
            <button className="quiet" onClick={() => onNavigate('Agenda')}>
              Ver agenda <ChevronRight />
            </button>
          </div>
          {agenda.length === 0 ? (
            <p className="empty">No hay alertas abiertas.</p>
          ) : (
            <div className="alert-list">
              {agenda.slice(0, 4).map((item) => (
                <AgendaRow key={item.id} item={item} />
              ))}
            </div>
          )}
        </article>
        <article className="panel compact">
          <div className="panel-head">
            <div>
              <h3>Estado de ciclos</h3>
              <p>Derivado de eventos y partos.</p>
            </div>
          </div>
          <div className="state-breakdown">
            {(
              [
                'Gestación activa',
                'Vacía',
                'Requiere revisión',
                'Cerrado por parto',
              ] as CycleStatus[]
            ).map((status) => (
              <div key={status}>
                <span className={`dot ${statusClass(status)}`} />
                <span>{status}</span>
                <strong>
                  {cycles.filter((item) => item.status === status).length}
                </strong>
              </div>
            ))}
          </div>
        </article>
      </section>
    </>
  );
}
function AgendaRow({ item }: { item: AgendaItem }) {
  return (
    <div className="alert-row">
      <span
        className={`icon-tile ${item.priority === 'Urgente' ? 'review' : 'upcoming'}`}
      >
        <AlertTriangle />
      </span>
      <div>
        <strong>{item.title}</strong>
        <p>{item.detail}</p>
      </div>
      <span
        className={`badge ${item.priority === 'Urgente' ? 'danger' : 'warning'}`}
      >
        {item.priority}
      </span>
    </div>
  );
}

function Agenda({
  items,
  onNavigate,
}: {
  items: AgendaItem[];
  onNavigate: (view: View) => void;
}) {
  const [filter, setFilter] = useState<'Todas' | 'Urgente' | 'Próximo'>(
    'Todas',
  );
  const visibleItems = items.filter(
    (item) => filter === 'Todas' || item.priority === filter,
  );
  const destination: Record<AgendaItem['kind'], View> = {
    review: 'Ciclos',
    diagnosis: 'Eventos',
    birth: 'Partos',
  };
  const actionLabel: Record<AgendaItem['kind'], string> = {
    review: 'Ver ciclo',
    diagnosis: 'Registrar diagnóstico',
    birth: 'Registrar parto',
  };
  return (
    <>
      <section className="section-head">
        <div>
          <p className="eyebrow">Trabajo del día</p>
          <h2>Agenda reproductiva</h2>
          <p>
            Pendientes obtenidos de ciclos, servicios y fechas probables de
            parto.
          </p>
        </div>
      </section>
      <section className="panel agenda-toolbar">
        <div>
          <strong>{items.length} pendiente(s)</strong>
          <small>Se actualiza con los registros de este dispositivo.</small>
        </div>
        <div className="agenda-filters" aria-label="Filtrar agenda">
          {(['Todas', 'Urgente', 'Próximo'] as const).map((item) => (
            <button
              key={item}
              className={filter === item ? 'selected' : ''}
              onClick={() => setFilter(item)}
            >
              {item}
            </button>
          ))}
        </div>
      </section>
      <section className="agenda-list">
        {visibleItems.length === 0 ? (
          <div className="panel empty">No hay pendientes para este filtro.</div>
        ) : (
          visibleItems.map((item) => (
            <article className="panel agenda-card" key={item.id}>
              <div>
                <span
                  className={`badge ${item.priority === 'Urgente' ? 'danger' : 'warning'}`}
                >
                  {item.priority}
                </span>
                <h3>{item.title}</h3>
                <p>{item.detail}</p>
                <small>Fecha: {date(item.dueDate)}</small>
              </div>
              <button
                className="quiet"
                onClick={() => onNavigate(destination[item.kind])}
              >
                {actionLabel[item.kind]} <ChevronRight />
              </button>
            </article>
          ))
        )}
      </section>
    </>
  );
}

function Tasks({
  tasks,
  animals,
  today,
  onAdd,
  onUpdateStatus,
}: {
  tasks: ReproductiveTask[];
  animals: Animal[];
  today: string;
  onAdd: (form: HTMLFormElement) => Promise<void>;
  onUpdateStatus: (
    task: ReproductiveTask,
    status: Extract<ReproductiveTask['status'], 'Completada' | 'Cancelada'>,
  ) => Promise<void>;
}) {
  const [filter, setFilter] = useState<
    'Todas' | 'Pendientes' | 'Vencidas' | 'Completadas'
  >('Todas');
  const matchesFilter = (task: ReproductiveTask) => {
    if (filter === 'Todas') return true;
    if (filter === 'Vencidas') return isTaskOverdue(task, today);
    if (filter === 'Pendientes') return task.status === 'Pendiente';
    return task.status === 'Completada';
  };
  const visibleTasks = [...tasks]
    .filter(matchesFilter)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const state = (task: ReproductiveTask) =>
    isTaskOverdue(task, today)
      ? { label: 'Vencida', tone: 'danger' }
      : task.status === 'Completada'
        ? { label: 'Completada', tone: 'good' }
        : task.status === 'Cancelada'
          ? { label: 'Cancelada', tone: 'neutral' }
          : { label: 'Pendiente', tone: 'warning' };
  return (
    <>
      <section className="section-head">
        <div>
          <p className="eyebrow">Trabajo programado</p>
          <h2>Planificación reproductiva</h2>
          <p>
            Programa actividades, asigna responsables y registra su
            cumplimiento.
          </p>
        </div>
      </section>
      <form
        className="entry-form"
        onSubmit={async (event) => {
          event.preventDefault();
          await onAdd(event.currentTarget);
        }}
      >
        <Select
          label="Animal"
          name="animalId"
          options={animals.map((animal) => `${animal.id}|${animal.displayId}`)}
          encoded
          placeholder="Selecciona el animal"
          defaultValue=""
          required
        />
        <Select
          label="Tarea"
          name="type"
          options={[
            'Diagnóstico',
            'Palpación',
            'Revisión posparto',
            'Vacunación',
            'Otro',
          ]}
          placeholder="Selecciona la tarea"
          defaultValue=""
          required
        />
        <Input label="Fecha programada" name="dueDate" type="date" required />
        <Input label="Responsable" name="responsible" required />
        <Input label="Observaciones" name="notes" />
        <button className="primary form-submit">Programar tarea</button>
      </form>
      <section className="panel task-toolbar">
        <div>
          <strong>{tasks.length} tarea(s) registradas</strong>
          <small>
            {tasks.filter((task) => isTaskOverdue(task, today)).length} vencida(s)
          </small>
        </div>
        <div className="agenda-filters" aria-label="Filtrar tareas">
          {(['Todas', 'Pendientes', 'Vencidas', 'Completadas'] as const).map(
            (item) => (
              <button
                key={item}
                className={filter === item ? 'selected' : ''}
                onClick={() => setFilter(item)}
              >
                {item}
              </button>
            ),
          )}
        </div>
      </section>
      <section className="panel table-panel">
        <table>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Animal</th>
              <th>Tarea</th>
              <th>Responsable</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {visibleTasks.length === 0 ? (
              <tr>
                <td colSpan={6} className="empty">
                  No hay tareas para este filtro.
                </td>
              </tr>
            ) : (
              visibleTasks.map((task) => {
                const currentState = state(task);
                return (
                  <tr key={task.id}>
                    <td>{date(task.dueDate)}</td>
                    <td>
                      <strong>
                        {animals.find((animal) => animal.id === task.animalId)
                          ?.displayId ?? 'No disponible'}
                      </strong>
                      {task.notes && <small>{task.notes}</small>}
                    </td>
                    <td>{task.type}</td>
                    <td>{task.responsible}</td>
                    <td>
                      <span className={`badge ${currentState.tone}`}>
                        {currentState.label}
                      </span>
                      {task.completedAt && (
                        <small>Completada: {date(task.completedAt)}</small>
                      )}
                    </td>
                    <td>
                      {task.status === 'Pendiente' ? (
                        <div className="row-actions">
                          <button
                            className="quiet"
                            onClick={() => void onUpdateStatus(task, 'Completada')}
                          >
                            Completar
                          </button>
                          <button
                            className="text-danger"
                            onClick={() => void onUpdateStatus(task, 'Cancelada')}
                          >
                            Cancelar
                          </button>
                        </div>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </section>
    </>
  );
}

function Indicators({
  animals,
  events,
  births,
}: {
  animals: Animal[];
  events: ReproductiveEvent[];
  births: Birth[];
}) {
  const [filters, setFilters] = useState<ReportFilters>({ species: 'Todas' });
  const report = useMemo(
    () =>
      reproductiveReport(
        animals,
        events,
        births,
        filters,
        new Date().toISOString().slice(0, 10),
      ),
    [animals, births, events, filters],
  );
  const number = (value?: number, suffix = '') =>
    value === undefined ? 'Sin datos' : `${value}${suffix}`;
  const reset = () => setFilters({ species: 'Todas' });
  const setFilter = <K extends keyof ReportFilters>(
    key: K,
    value: ReportFilters[K],
  ) => setFilters((current) => ({ ...current, [key]: value || undefined }));
  return (
    <section id="print-report" className="report-page">
      <section className="section-head">
        <div>
          <p className="eyebrow">Análisis reproductivo</p>
          <h2>Indicadores y reportes</h2>
          <p>
            Resultados calculados a partir de los registros locales validados.
          </p>
        </div>
        <button className="quiet print-button" onClick={() => requestPrint('report')}>
          <Printer /> Imprimir reporte
        </button>
      </section>
      <section className="panel report-filters" aria-label="Filtros de indicadores">
        <div className="panel-head">
          <div>
            <h3>Período a consultar</h3>
            <p>Deja las fechas vacías para revisar todo el historial.</p>
          </div>
          <button className="quiet" onClick={reset}>
            Limpiar filtros
          </button>
        </div>
        <div className="report-filter-fields">
          <Input
            label="Desde"
            name="reportFrom"
            type="date"
            value={filters.from ?? ''}
            onChange={(event) => setFilter('from', event.target.value)}
          />
          <Input
            label="Hasta"
            name="reportTo"
            type="date"
            value={filters.to ?? ''}
            onChange={(event) => setFilter('to', event.target.value)}
          />
          <Select
            label="Especie"
            name="reportSpecies"
            options={['Todas', 'Bovino', 'Búfalo']}
            value={filters.species}
            onChange={(event) =>
              setFilter(
                'species',
                event.target.value as ReportFilters['species'],
              )
            }
            required
          />
        </div>
      </section>
      <section className="report-summary" aria-live="polite">
        <p>
          <strong>{report.animalsIncluded}</strong> animales incluidos ·{' '}
          <strong>{report.conclusiveDiagnoses}</strong> diagnósticos concluyentes
        </p>
      </section>
      <section className="report-grid">
        <article className="panel report-card good">
          <span>Tasa de preñez</span>
          <strong>{number(report.pregnancyRate, '%')}</strong>
          <small>
            {report.positiveDiagnoses} diagnóstico(s) gestantes de{' '}
            {report.conclusiveDiagnoses} concluyentes.
          </small>
        </article>
        <article className="panel report-card blue">
          <span>Servicios por concepción</span>
          <strong>{number(report.servicesPerConception)}</strong>
          <small>
            {report.validServices} servicios válidos por cada diagnóstico
            gestante.
          </small>
        </article>
        <article className="panel report-card purple">
          <span>Partos validados</span>
          <strong>{report.validatedBirths}</strong>
          <small>Partos registrados dentro del período consultado.</small>
        </article>
        <article className="panel report-card danger">
          <span>Abortos validados</span>
          <strong>{report.validatedAbortions}</strong>
          <small>Abortos con causa y gestación activa confirmadas.</small>
        </article>
        <article className="panel report-card warning">
          <span>Promedio de días abiertos</span>
          <strong>{number(report.averageOpenDays, ' días')}</strong>
          <small>
            Desde cada parto hasta el siguiente servicio, o hasta hoy si falta
            servicio.
          </small>
        </article>
        <article className="panel report-card neutral">
          <span>Promedio entre partos</span>
          <strong>{number(report.averageBirthIntervalDays, ' días')}</strong>
          <small>
            Días entre dos partos validados de la misma madre.
          </small>
        </article>
      </section>
      <section className="panel report-definition">
        <h3>Cómo leer estos indicadores</h3>
        <p>
          La tasa de preñez compara los diagnósticos “Gestante” con los
          diagnósticos concluyentes “Gestante” y “Vacía”. Los servicios por
          concepción dividen los servicios válidos del período entre los
          diagnósticos gestantes del mismo período.
        </p>
      </section>
    </section>
  );
}
function Animals({
  animals,
  cycles,
  events,
  births,
  audits,
  settings,
  selectedFilter,
  onFilterChange,
  onAdd,
  onRetire,
  onWean,
}: {
  animals: Animal[];
  cycles: Cycle[];
  events: ReproductiveEvent[];
  births: Birth[];
  audits: AuditEntry[];
  settings: Settings;
  selectedFilter: AnimalListFilter;
  onFilterChange: (filter: AnimalListFilter) => void;
  onAdd: (form: HTMLFormElement) => void;
  onRetire: (animal: Animal, passcode: string) => Promise<boolean>;
  onWean: (animal: Animal, form: HTMLFormElement) => Promise<boolean>;
}) {
  const [showForm, setShowForm] = useState(false);
  const [history, setHistory] = useState<Animal | null>(null);
  const [technicalSheet, setTechnicalSheet] = useState<Animal | null>(null);
  const [pendingRemoval, setPendingRemoval] = useState<Animal | null>(null);
  const [pendingWeaning, setPendingWeaning] = useState<Animal | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [speciesFilter, setSpeciesFilter] = useState<
    'Todas' | Animal['species']
  >('Todas');
  const [reproductiveFilter, setReproductiveFilter] = useState<
    'Todos' | CycleStatus
  >('Todos');
  const [searchQuery, setSearchQuery] = useState('');
  const visibleAnimals = animals.filter((animal) => !animal.deletedAt);
  const state = (animal: Animal) => {
    const cycle = cycles.filter((item) => item.animalId === animal.id).at(-1);
    return cycle
      ? { label: cycle.status, tone: statusClass(cycle.status) }
      : reproductiveCategory(animal, settings);
  };
  const hasValidatedBirth = (animal: Animal) =>
    births.some((birth) => birth.motherId === animal.id && birth.valid);
  const matchesCategory = (animal: Animal) => {
    const category = inventoryCategory(animal, settings).group;
    switch (selectedFilter) {
      case 'parous-females':
        return animal.sex === 'Hembra' && hasValidatedBirth(animal);
      case 'heifers':
        return category === 'novilla';
      case 'females':
        return animal.sex === 'Hembra';
      case 'breeding-females':
        return category === 'hembra-reproductora';
      case 'calves':
        return category === 'cría';
      case 'female-calves':
        return category === 'cría' && animal.sex === 'Hembra';
      case 'male-calves':
        return category === 'cría' && animal.sex === 'Macho';
      case 'breeders':
        return category === 'reproductor';
      case 'young-males':
        return category === 'joven';
      default:
        return true;
    }
  };
  const filteredAnimals = visibleAnimals.filter(
    (animal) =>
      matchesCategory(animal) &&
      (speciesFilter === 'Todas' || animal.species === speciesFilter) &&
      (reproductiveFilter === 'Todos' ||
        state(animal).label === reproductiveFilter) &&
      (searchQuery.trim() === '' ||
        [animal.displayId, animal.rfid, animal.earTag]
          .filter((value): value is string => Boolean(value))
          .some((value) =>
            value
              .toLocaleLowerCase('es-CO')
              .includes(searchQuery.trim().toLocaleLowerCase('es-CO')),
          )),
  );
  const activeFilterLabel = animalListFilters.find(
    (filter) => filter.value === selectedFilter,
  )?.label;
  const motherIdOf = (animal: Animal) =>
    animal.motherId ??
    births.find((birth) => birth.calfId === animal.id)?.motherId;
  const offspringOf = (motherId: string) =>
    visibleAnimals.filter((animal) => motherIdOf(animal) === motherId);
  const indicatorsFor = (animal: Animal) =>
    reproductiveIndicators(
      births.filter((birth) => birth.motherId === animal.id),
      events.filter((event) => event.animalId === animal.id),
    );
  const hasServiceAfterLatestBirth = (animal: Animal) => {
    const latestBirth = births
      .filter((birth) => birth.motherId === animal.id && birth.valid)
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))[0];
    return (
      !!latestBirth &&
      events.some(
        (event) =>
          event.animalId === animal.id &&
          event.valid &&
          event.type === 'Servicio' &&
          event.occurredAt > latestBirth.occurredAt,
      )
    );
  };
  const historyItems = (animal: Animal) =>
    [
      {
        at: animal.createdAt,
        title: 'Animal creado',
        detail: `${animal.species} · ${animal.breed}`,
      },
      ...events
        .filter((item) => item.animalId === animal.id)
        .map((item) => ({
          at: item.occurredAt,
          title: `Evento: ${item.type}`,
          detail: item.result || eventDetail(item),
        })),
      ...births
        .filter((item) => item.motherId === animal.id)
        .map((item) => ({
          at: item.occurredAt,
          title: `Parto: ${item.type}`,
          detail: birthDetail(item) || 'Requiere revisión',
        })),
      ...(animal.weanedAt
        ? [
            {
              at: animal.weanedAt,
              title: 'Destete registrado',
              detail: `${animal.weaningWeightKg ? `${animal.weaningWeightKg} kg · ` : ''}${animal.weaningNotes || 'Sin observaciones'}`,
            },
          ]
        : []),
      ...offspringOf(animal.id)
        .filter((calf) => calf.weanedAt)
        .map((calf) => ({
          at: calf.weanedAt!,
          title: `Destete de ${calf.displayId}`,
          detail: calf.weaningWeightKg
            ? `${calf.weaningWeightKg} kg`
            : 'Sin peso registrado',
        })),
      ...audits
        .filter(
          (item) => item.entity === 'Animal' && item.entityId === animal.id,
        )
        .map((item) => ({
          at: item.at,
          title: `Auditoría: ${item.action}`,
          detail: item.reason || 'Registrado por Usuario local',
        })),
    ].sort((a, b) => b.at.localeCompare(a.at));
  return (
    <>
      <section className="section-head">
        <div>
          <p className="eyebrow">Base maestra</p>
          <h2>Animales</h2>
          <p>La eliminación operativa conserva todo el historial del animal.</p>
        </div>
        <div className="section-actions">
          <button
            className={`quiet filter-trigger ${filtersOpen ? 'active' : ''}`}
            onClick={() => setFiltersOpen(!filtersOpen)}
            aria-expanded={filtersOpen}
          >
            <Funnel /> Filtros
          </button>
          <button className="primary" onClick={() => setShowForm(!showForm)}>
            <Plus /> Nuevo animal
          </button>
        </div>
      </section>
      <label className="animal-search">
        <Search aria-hidden="true" />
        <span className="visually-hidden">Buscar animal por ID, RFID o arete</span>
        <input
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="Buscar por ID, RFID o arete"
          aria-label="Buscar animal por ID, RFID o arete"
        />
      </label>
      {filtersOpen && (
        <section
          className="panel animal-filters"
          aria-label="Filtros de animales"
        >
          <div className="filter-heading">
            <div>
              <p className="eyebrow">Consultar inventario</p>
              <h3>Filtrar animales</h3>
              <p>Los filtros organizan la lista sin cambiar ningún registro.</p>
            </div>
            <button
              className="quiet"
              onClick={() => {
                onFilterChange('all');
                setSpeciesFilter('Todas');
                setReproductiveFilter('Todos');
                setSearchQuery('');
              }}
            >
              Limpiar filtros
            </button>
          </div>
          <div className="filter-groups">
            <div>
              <span className="filter-label">Grupo de animales</span>
              <div className="filter-chips">
                {animalListFilters.map((filter) => (
                  <button
                    key={filter.value}
                    className={
                      selectedFilter === filter.value ? 'selected' : ''
                    }
                    onClick={() => onFilterChange(filter.value)}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>
            </div>
            <label>
              <span className="filter-label">Especie</span>
              <select
                value={speciesFilter}
                onChange={(event) =>
                  setSpeciesFilter(
                    event.target.value as 'Todas' | Animal['species'],
                  )
                }
              >
                <option value="Todas">Todas las especies</option>
                <option value="Bovino">Bovino</option>
                <option value="Búfalo">Búfalo</option>
              </select>
            </label>
            <label>
              <span className="filter-label">Estado reproductivo</span>
              <select
                value={reproductiveFilter}
                onChange={(event) =>
                  setReproductiveFilter(
                    event.target.value as 'Todos' | CycleStatus,
                  )
                }
              >
                <option value="Todos">Todos los estados</option>
                {(
                  [
                    'Gestación activa',
                    'Vacía',
                    'Requiere revisión',
                    'Cerrado por parto',
                    'Aborto',
                  ] as CycleStatus[]
                ).map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>
      )}
      {showForm && (
        <form
          className="entry-form"
          onSubmit={(e) => {
            e.preventDefault();
            onAdd(e.currentTarget);
          }}
        >
          <Input
            label="ID visible"
            name="displayId"
            required
            placeholder="A0011"
          />
          <Input label="RFID" name="rfid" />
          <Input label="Arete" name="earTag" />
          <Select
            label="Especie"
            name="species"
            options={['Bovino', 'Búfalo']}
          />
          <Select
            label="Raza"
            name="breed"
            options={[
              'Brahman',
              'Gyr',
              'Girolando',
              'Holstein',
              'Jersey',
              'Simmental',
              'Angus',
              'Nelore',
              'Murrah',
              'Carabao',
              'Mediterráneo',
              'Otra',
            ]}
          />
          <Select label="Sexo" name="sex" options={['Hembra', 'Macho']} />
          <AnimalAgeFields />
          <Input label="Lote" name="lot" />
          <Input label="Potrero" name="paddock" />
          <button className="primary form-submit">Guardar animal</button>
        </form>
      )}
      <section className="panel table-panel">
        <div className="table-filter-summary" aria-live="polite">
          <div>
            <span>Resultado de la consulta</span>
            <strong>
              Mostrando {filteredAnimals.length} de {visibleAnimals.length}{' '}
              animales
            </strong>
          </div>
          {(selectedFilter !== 'all' ||
            speciesFilter !== 'Todas' ||
            reproductiveFilter !== 'Todos' ||
            searchQuery.trim() !== '') && (
            <p>
              {searchQuery.trim() && `Búsqueda: ${searchQuery.trim()}`}
              {searchQuery.trim() &&
                (selectedFilter !== 'all' ||
                  speciesFilter !== 'Todas' ||
                  reproductiveFilter !== 'Todos') &&
                ' · '}
              {selectedFilter !== 'all' && activeFilterLabel}
              {speciesFilter !== 'Todas' &&
                `${selectedFilter !== 'all' || searchQuery.trim() ? ' · ' : ''}${speciesFilter}`}
              {reproductiveFilter !== 'Todos' &&
                `${selectedFilter !== 'all' || speciesFilter !== 'Todas' || searchQuery.trim() ? ' · ' : ''}${reproductiveFilter}`}
            </p>
          )}
        </div>
        <table>
          <thead>
            <tr>
              <th>Animal</th>
              <th>Especie</th>
              <th>Sexo y edad</th>
              <th>Categoría</th>
              <th>Ubicación</th>
              <th>Estado reproductivo</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {visibleAnimals.length === 0 ? (
              <tr>
                <td colSpan={7} className="empty">
                  No hay animales activos registrados.
                </td>
              </tr>
            ) : filteredAnimals.length === 0 ? (
              <tr>
                <td colSpan={7} className="empty">
                  No hay animales que cumplan estos filtros.
                </td>
              </tr>
            ) : (
              filteredAnimals.map((animal) => {
                const animalState = state(animal);
                const category = inventoryCategory(animal, settings);
                return (
                  <tr key={animal.id}>
                    <td>
                      <strong>{animal.displayId}</strong>
                      <small>
                        {motherIdOf(animal)
                          ? `Cría de ${animals.find((item) => item.id === motherIdOf(animal))?.displayId ?? 'madre no disponible'}`
                          : animal.earTag
                            ? `Arete ${animal.earTag}`
                            : offspringOf(animal.id).length > 0
                              ? `${offspringOf(animal.id).length} cría(s) vinculada(s)`
                              : 'Sin arete'}
                      </small>
                    </td>
                    <td>
                      {animal.species}
                      <small>{animal.breed}</small>
                    </td>
                    <td>
                      {animal.sex}
                      <small>{ageLabel(animal)}</small>
                    </td>
                    <td>
                      <span className={`badge ${category.tone}`}>
                        {category.label}
                      </span>
                    </td>
                    <td>
                      {animal.lot ?? '—'}
                      <small>{animal.paddock ?? '—'}</small>
                    </td>
                    <td>
                      <span className={`badge ${animalState.tone}`}>
                        {animalState.label}
                      </span>
                    </td>
                    <td>
                      <div className="row-actions">
                        <button
                          className="quiet"
                          onClick={() => setTechnicalSheet(animal)}
                        >
                          Ficha técnica
                        </button>
                        <button
                          className="quiet"
                          onClick={() => setHistory(animal)}
                        >
                          Historial
                        </button>
                        {motherIdOf(animal) && (
                          <button
                            className="quiet"
                            onClick={() => setPendingWeaning(animal)}
                          >
                            {animal.weanedAt
                              ? 'Ver destete'
                              : 'Registrar destete'}
                          </button>
                        )}
                        <button
                          className="text-danger"
                          onClick={() => setPendingRemoval(animal)}
                        >
                          Eliminar
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </section>
      {technicalSheet && (
        <div className="modal-backdrop" role="presentation">
          <section
            id="print-technical-sheet"
            className="modal-card technical-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="technical-sheet-title"
          >
            <div className="panel-head">
              <div>
                <p className="eyebrow">Ficha técnica</p>
                <h3 id="technical-sheet-title">{technicalSheet.displayId}</h3>
                <p>
                  {technicalSheet.species} · {technicalSheet.breed}
                </p>
              </div>
              <button
                className="icon-button"
                onClick={() => setTechnicalSheet(null)}
                aria-label="Cerrar ficha técnica"
              >
                <X />
              </button>
            </div>
            <div className="technical-grid">
              <div>
                <span>Sexo</span>
                <strong>{technicalSheet.sex}</strong>
              </div>
              <div>
                <span>Edad</span>
                <strong>{ageLabel(technicalSheet)}</strong>
              </div>
              <div>
                <span>Categoría</span>
                <strong>
                  {inventoryCategory(technicalSheet, settings).label}
                </strong>
              </div>
              <div>
                <span>Estado reproductivo</span>
                <strong>{state(technicalSheet).label}</strong>
              </div>
              <div>
                <span>Nacimiento</span>
                <strong>{date(technicalSheet.birthDate)}</strong>
              </div>
              <div>
                <span>Estado operativo</span>
                <strong>{technicalSheet.status}</strong>
              </div>
              <div>
                <span>Arete</span>
                <strong>{technicalSheet.earTag || 'No registrado'}</strong>
              </div>
              <div>
                <span>RFID</span>
                <strong>{technicalSheet.rfid || 'No registrado'}</strong>
              </div>
              <div>
                <span>Lote</span>
                <strong>{technicalSheet.lot || 'No registrado'}</strong>
              </div>
              <div>
                <span>Potrero</span>
                <strong>{technicalSheet.paddock || 'No registrado'}</strong>
              </div>
            </div>
            {motherIdOf(technicalSheet) && (
              <p className="lineage-note">
                Madre:{' '}
                <strong>
                  {animals.find(
                    (animal) => animal.id === motherIdOf(technicalSheet),
                  )?.displayId ?? 'No disponible'}
                </strong>
              </p>
            )}
            {offspringOf(technicalSheet.id).length > 0 && (
              <p className="lineage-note">
                Crías vinculadas:{' '}
                <strong>
                  {offspringOf(technicalSheet.id)
                    .map((calf) => calf.displayId)
                    .join(', ')}
                </strong>
              </p>
            )}
            {technicalSheet.weanedAt && (
              <p className="lineage-note">
                Destete:{' '}
                <strong>
                  {date(technicalSheet.weanedAt)}
                  {technicalSheet.weaningWeightKg
                    ? ` · ${technicalSheet.weaningWeightKg} kg`
                    : ''}
                </strong>
              </p>
            )}
            <div className="modal-actions">
              <button
                className="quiet print-button"
                onClick={() => requestPrint('technical-sheet')}
              >
                <Printer /> Imprimir ficha
              </button>
              <button
                className="quiet"
                onClick={() => {
                  setTechnicalSheet(null);
                  setHistory(technicalSheet);
                }}
              >
                Ver historial
              </button>
              <button
                className="primary"
                onClick={() => setTechnicalSheet(null)}
              >
                Cerrar ficha
              </button>
            </div>
          </section>
        </div>
      )}
      {history && (
        <div className="modal-backdrop" role="presentation">
          <section
            className="modal-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="history-title"
          >
            <div className="panel-head">
              <div>
                <p className="eyebrow">Registro permanente</p>
                <h3 id="history-title">Historial de {history.displayId}</h3>
                <p>
                  {history.species} · {history.breed} · creado el{' '}
                  {date(history.createdAt)}
                </p>
              </div>
              <button
                className="icon-button"
                onClick={() => setHistory(null)}
                aria-label="Cerrar historial"
              >
                <X />
              </button>
            </div>
            {history.sex === 'Hembra' && (
              <section
                className="repro-indicators"
                aria-label="Indicadores reproductivos"
              >
                <p className="eyebrow">Indicadores reproductivos</p>
                <div>
                  <span>Intervalo entre partos</span>
                  <strong>
                    {indicatorsFor(history).intervalBetweenBirthsDays !==
                    undefined
                      ? `${indicatorsFor(history).intervalBetweenBirthsDays} días`
                      : 'Aún no disponible'}
                  </strong>
                </div>
                <div>
                  <span>Días abiertos del ciclo anterior</span>
                  <strong>
                    {indicatorsFor(history).priorOpenDays !== undefined
                      ? `${indicatorsFor(history).priorOpenDays} días`
                      : 'Aún no disponible'}
                  </strong>
                </div>
                <div>
                  <span>
                    {hasServiceAfterLatestBirth(history)
                      ? 'Días abiertos hasta el nuevo servicio'
                      : 'Días abiertos en curso'}
                  </span>
                  <strong>
                    {indicatorsFor(history).currentOpenDays !== undefined
                      ? `${indicatorsFor(history).currentOpenDays} días`
                      : 'Aún no disponible'}
                  </strong>
                </div>
              </section>
            )}
            {motherIdOf(history) && (
              <p className="lineage-note">
                Madre:{' '}
                <button
                  className="quiet"
                  onClick={() => {
                    const mother = animals.find(
                      (animal) => animal.id === motherIdOf(history),
                    );
                    if (mother) setHistory(mother);
                  }}
                >
                  {animals.find((animal) => animal.id === motherIdOf(history))
                    ?.displayId ?? 'No disponible'}
                </button>
              </p>
            )}
            {offspringOf(history.id).length > 0 && (
              <section className="lineage-note">
                <strong>Crías vinculadas</strong>
                <div className="linked-calves">
                  {offspringOf(history.id).map((calf) => (
                    <button
                      key={calf.id}
                      className="quiet"
                      onClick={() => setHistory(calf)}
                    >
                      {calf.displayId}
                      {calf.weanedAt ? ' · Destetada' : ''}
                    </button>
                  ))}
                </div>
              </section>
            )}
            <div className="history-list">
              {historyItems(history).map((item, index) => (
                <article key={`${item.at}-${index}`}>
                  <strong>{item.title}</strong>
                  <small>
                    {date(item.at)} · {item.detail}
                  </small>
                </article>
              ))}
            </div>
            <button
              className="primary modal-close"
              onClick={() => setHistory(null)}
            >
              Cerrar
            </button>
          </section>
        </div>
      )}
      {pendingWeaning && (
        <div className="modal-backdrop" role="presentation">
          <form
            className="modal-card removal-form"
            onSubmit={async (event) => {
              event.preventDefault();
              const saved = await onWean(pendingWeaning, event.currentTarget);
              if (saved) setPendingWeaning(null);
            }}
          >
            <div className="panel-head">
              <div>
                <p className="eyebrow">Manejo de cría</p>
                <h3>Destete de {pendingWeaning.displayId}</h3>
                <p>
                  Cría de{' '}
                  {animals.find(
                    (animal) => animal.id === motherIdOf(pendingWeaning),
                  )?.displayId ?? 'madre no disponible'}
                  .
                </p>
              </div>
              <button
                type="button"
                className="icon-button"
                onClick={() => setPendingWeaning(null)}
                aria-label="Cancelar destete"
              >
                <X />
              </button>
            </div>
            <Input
              label="Fecha de destete"
              name="weanedAt"
              type="date"
              required
              defaultValue={pendingWeaning.weanedAt}
            />
            <Input
              label="Peso al destete (kg)"
              name="weaningWeightKg"
              type="number"
              min="0.1"
              step="0.1"
              defaultValue={pendingWeaning.weaningWeightKg}
            />
            <Input
              label="Observaciones"
              name="weaningNotes"
              defaultValue={pendingWeaning.weaningNotes}
            />
            <div className="modal-actions">
              <button
                type="button"
                className="quiet"
                onClick={() => setPendingWeaning(null)}
              >
                Cancelar
              </button>
              <button className="primary" type="submit">
                Guardar destete
              </button>
            </div>
          </form>
        </div>
      )}
      {pendingRemoval && (
        <div className="modal-backdrop" role="presentation">
          <form
            className="modal-card removal-form"
            onSubmit={async (event) => {
              event.preventDefault();
              const success = await onRetire(
                pendingRemoval,
                formValue(new FormData(event.currentTarget), 'passcode'),
              );
              if (success) setPendingRemoval(null);
            }}
          >
            <div className="panel-head">
              <div>
                <p className="eyebrow">Acción protegida</p>
                <h3>Eliminar {pendingRemoval.displayId}</h3>
              </div>
              <button
                type="button"
                className="icon-button"
                onClick={() => setPendingRemoval(null)}
                aria-label="Cancelar eliminación"
              >
                <X />
              </button>
            </div>
            <p>
              El animal desaparecerá de la operación, pero su historial, eventos
              y partos se conservarán. Esta acción requiere la clave
              configurada.
            </p>
            <Input
              label="Clave de eliminación"
              name="passcode"
              type="password"
              autoComplete="current-password"
              required
            />
            <div className="modal-actions">
              <button
                type="button"
                className="quiet"
                onClick={() => setPendingRemoval(null)}
              >
                Cancelar
              </button>
              <button className="danger-button" type="submit">
                Confirmar eliminación
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
function AnimalAgeFields() {
  const [birthDate, setBirthDate] = useState('');
  const [ageMonths, setAgeMonths] = useState('');
  const setAge = (value: string) => {
    setAgeMonths(value);
    const months = Number(value);
    if (!Number.isInteger(months) || months < 0) return;
    const result = new Date();
    result.setHours(12, 0, 0, 0);
    result.setMonth(result.getMonth() - months);
    setBirthDate(result.toISOString().slice(0, 10));
  };
  const setBirth = (value: string) => {
    setBirthDate(value);
    setAgeMonths(value ? String(ageInMonths(value)) : '');
  };
  const months = Number(ageMonths);
  const readableAge =
    ageMonths !== '' && Number.isInteger(months) && months >= 0
      ? `${Math.floor(months / 12)} año(s) y ${months % 12} mes(es)`
      : '';
  return (
    <>
      <label>
        Nacimiento
        <input
          name="birthDate"
          type="date"
          required
          value={birthDate}
          onChange={(event) => setBirth(event.target.value)}
        />
      </label>
      <label>
        Edad total (meses)
        <input
          name="ageMonths"
          type="number"
          min="0"
          step="1"
          placeholder="Ej. 18"
          value={ageMonths}
          onChange={(event) => setAge(event.target.value)}
        />
      </label>
      {readableAge && (
        <p className="age-hint">
          Equivale a {readableAge}. La fecha de nacimiento se calcula
          automáticamente.
        </p>
      )}
    </>
  );
}
function Events({
  events,
  animals,
  onAdd,
}: {
  events: ReproductiveEvent[];
  animals: Animal[];
  onAdd: (form: HTMLFormElement) => Promise<void>;
}) {
  const [eventType, setEventType] = useState<ReproductiveEvent['type'] | ''>(
    '',
  );
  return (
    <>
      <section className="section-head">
        <div>
          <p className="eyebrow">Historial inmutable</p>
          <h2>Eventos reproductivos</h2>
        </div>
      </section>
      <form
        className="entry-form"
        onSubmit={async (e) => {
          e.preventDefault();
          await onAdd(e.currentTarget);
          setEventType('');
        }}
      >
        <Select
          label="Animal"
          name="animalId"
          options={animals.map((item) => `${item.id}|${item.displayId}`)}
          encoded
          required
        />
        <Input
          label="Fecha y hora"
          name="occurredAt"
          type="datetime-local"
          required
        />
        <Select
          label="Tipo"
          name="type"
          options={[
            'Servicio',
            'Celo',
            'Diagnóstico',
            'Aborto',
            'Revisión posparto',
            'Resolución de revisión',
            'Otro',
          ]}
          placeholder="Selecciona el tipo"
          value={eventType}
          onChange={(event) =>
            setEventType(event.target.value as ReproductiveEvent['type'])
          }
          required
        />
        {eventType === 'Servicio' && (
          <>
            <Select
              label="Método de servicio"
              name="serviceMethod"
              options={[
                'Inseminación artificial',
                'Monta natural',
                'Transferencia de embrión',
                'Otro',
              ]}
              placeholder="Selecciona el método"
              defaultValue=""
              required
            />
            <Input
              label="Reproductor, pajilla o embrión"
              name="serviceReference"
              placeholder="Ej. Toro 23 o lote de pajilla"
            />
            <Input label="Responsable" name="responsible" />
          </>
        )}
        {eventType === 'Diagnóstico' && (
          <>
            <Select
              label="Resultado del diagnóstico"
              name="result"
              options={['Gestante', 'Vacía', 'Dudosa', 'No evaluable']}
              placeholder="Selecciona el resultado"
              defaultValue=""
              required
            />
            <Input
              label="Fecha del servicio previo"
              name="serviceDate"
              type="date"
              required
            />
            <Select
              label="Método de diagnóstico"
              name="diagnosisMethod"
              options={[
                'Palpación',
                'Ecografía',
                'Prueba de laboratorio',
                'Otro',
              ]}
              placeholder="Selecciona el método"
              defaultValue=""
              required
            />
          </>
        )}
        {eventType === 'Aborto' && (
          <>
            <Select
              label="Causa del aborto"
              name="abortionCause"
              options={[
                'Desconocida',
                'Enfermedad',
                'Trauma',
                'Nutricional',
                'Otra',
              ]}
              placeholder="Selecciona la causa"
              defaultValue=""
              required
            />
            <Input
              label="Etapa de gestación"
              name="abortionStage"
              placeholder="Ej. Segundo tercio"
            />
          </>
        )}
        {eventType === 'Diagnóstico' && (
          <Input
            label="Fecha de diagnóstico"
            name="diagnosisDate"
            type="date"
          />
        )}
        <Input label="Notas" name="notes" />
        <button className="primary form-submit">Registrar evento</button>
      </form>
      <section className="panel table-panel">
        <table>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Animal</th>
              <th>Evento</th>
              <th>Resultado</th>
              <th>Detalle</th>
              <th>Validación</th>
            </tr>
          </thead>
          <tbody>
            {[...events]
              .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
              .map((event) => (
                <tr key={event.id}>
                  <td>{date(event.occurredAt)}</td>
                  <td>
                    <strong>
                      {animals.find((item) => item.id === event.animalId)
                        ?.displayId ?? 'No disponible'}
                    </strong>
                  </td>
                  <td>{event.type}</td>
                  <td>{event.result || '—'}</td>
                  <td>{eventDetail(event) || '—'}</td>
                  <td>
                    <span
                      className={`badge ${event.valid ? 'good' : 'danger'}`}
                    >
                      {event.valid ? 'Válido' : 'Revisar'}
                    </span>
                    {!event.valid && <small>{event.validationIssues[0]}</small>}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </section>
    </>
  );
}
function Cycles({ cycles, animals }: { cycles: Cycle[]; animals: Animal[] }) {
  return (
    <>
      <section className="section-head">
        <div>
          <p className="eyebrow">Entidad explícita</p>
          <h2>Ciclos reproductivos</h2>
          <p>
            El estado se calcula por fechas e identificadores, no por el orden
            visual.
          </p>
        </div>
      </section>
      <section className="cycle-grid">
        {[...cycles]
          .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
          .map((cycle) => (
            <article className="cycle-card" key={cycle.id}>
              <div>
                <span className={`badge ${statusClass(cycle.status)}`}>
                  {cycle.status}
                </span>
                <strong>
                  {animals.find((item) => item.id === cycle.animalId)
                    ?.displayId ?? 'Animal eliminado'}
                </strong>
              </div>
              <p>Inicio: {date(cycle.startedAt)}</p>
              {cycle.expectedBirthDate && (
                <p>
                  Parto probable:{' '}
                  <strong>{date(cycle.expectedBirthDate)}</strong>
                </p>
              )}
              {cycle.reviewReasons.length > 0 && (
                <p className="review-reason">{cycle.reviewReasons.join(' ')}</p>
              )}
              {cycle.resolvedAt && (
                <p>
                  Revisión resuelta: <strong>{date(cycle.resolvedAt)}</strong>
                  {cycle.resolutionNote && ` · ${cycle.resolutionNote}`}
                </p>
              )}
              <small>{cycle.eventIds.length} evento(s) vinculados</small>
            </article>
          ))}
      </section>
    </>
  );
}
function Births({
  births,
  animals,
  onAdd,
  onCreateCalf,
}: {
  births: Birth[];
  animals: Animal[];
  cycles: Cycle[];
  onAdd: (form: HTMLFormElement) => Promise<void>;
  onCreateCalf: (birth: Birth) => void;
}) {
  const mothers = animals.filter((animal) => animal.sex === 'Hembra');
  const [condition, setCondition] = useState<Birth['condition'] | ''>('');
  return (
    <>
      <section className="section-head">
        <div>
          <p className="eyebrow">Madre y cría</p>
          <h2>Partos y crías</h2>
          <p>Una cría viva se incorpora automáticamente al inventario.</p>
        </div>
      </section>
      <form
        className="entry-form"
        onSubmit={async (e) => {
          e.preventDefault();
          await onAdd(e.currentTarget);
          setCondition('');
        }}
      >
        <Select
          label="Madre"
          name="motherId"
          options={mothers.map((item) => `${item.id}|${item.displayId}`)}
          encoded
          placeholder="Selecciona la madre"
          defaultValue=""
          required
        />
        <Input
          label="Fecha y hora"
          name="occurredAt"
          type="datetime-local"
          required
        />
        <Select
          label="Tipo de parto"
          name="type"
          options={['Normal', 'Distócico', 'Cesárea']}
          placeholder="Selecciona el tipo"
          defaultValue=""
          required
        />
        <Select
          label="Sexo de cría"
          name="sex"
          options={['Hembra', 'Macho']}
          placeholder="Selecciona el sexo"
          defaultValue=""
          required={condition === 'Vivo'}
        />
        <Select
          label="Condición"
          name="condition"
          options={['Vivo', 'Muerto', 'Débil']}
          placeholder="Selecciona la condición"
          value={condition}
          onChange={(event) =>
            setCondition(event.target.value as Birth['condition'])
          }
          required
        />
        <Input
          label="ID visible de la cría"
          name="calfDisplayId"
          placeholder="Opcional. Si se omite, se genera."
          disabled={condition !== 'Vivo'}
        />
        <Input
          label="Peso al nacer (kg)"
          name="calfWeightKg"
          type="number"
          min="0.1"
          step="0.1"
          disabled={condition !== 'Vivo'}
        />
        <Input label="Asistencia" name="assistance" />
        <Input
          label="Observaciones de la cría"
          name="calfNotes"
          disabled={condition !== 'Vivo'}
        />
        <Input label="Observaciones de la madre" name="motherNotes" />
        <button className="primary form-submit">Registrar parto</button>
      </form>
      <section className="panel table-panel">
        <table>
          <thead>
            <tr>
              <th>Parto</th>
              <th>Madre</th>
              <th>Tipo</th>
              <th>Estado</th>
              <th>Cría</th>
            </tr>
          </thead>
          <tbody>
            {births.length === 0 ? (
              <tr>
                <td colSpan={5} className="empty">
                  No hay partos registrados.
                </td>
              </tr>
            ) : (
              births.map((birth) => {
                const calf = animals.find(
                  (animal) => animal.id === birth.calfId,
                );
                return (
                  <tr key={birth.id}>
                    <td>{date(birth.occurredAt)}</td>
                    <td>
                      <strong>
                        {mothers.find((item) => item.id === birth.motherId)
                          ?.displayId ?? 'No disponible'}
                      </strong>
                    </td>
                    <td>{birth.type}</td>
                    <td>
                      <span
                        className={`badge ${birth.valid ? 'good' : 'danger'}`}
                      >
                        {birth.valid ? 'Validado' : 'Requiere revisión'}
                      </span>
                      {birth.validationIssues[0] && (
                        <small>{birth.validationIssues[0]}</small>
                      )}
                    </td>
                    <td>
                      {birth.calfId ? (
                        <>
                          <span className="badge neutral">
                            {calf?.displayId ?? birth.calfDisplayId ?? 'Creada'}
                          </span>
                          <small>
                            {birth.condition}
                            {birth.calfWeightKg
                              ? ` · ${birth.calfWeightKg} kg`
                              : ''}
                          </small>
                        </>
                      ) : birth.valid && birth.condition === 'Vivo' ? (
                        <button
                          className="quiet"
                          onClick={() => onCreateCalf(birth)}
                        >
                          Crear cría pendiente
                        </button>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </section>
    </>
  );
}
function Audit({
  entries,
  onNavigate,
}: {
  entries: AuditEntry[];
  onNavigate: (view: View) => void;
}) {
  const [entity, setEntity] = useState('');
  const [action, setAction] = useState('');
  const results = entries
    .filter(
      (entry) =>
        (!entity || entry.entity === entity) &&
        (!action || entry.action === action),
    )
    .sort((a, b) => b.at.localeCompare(a.at));
  const destination: Record<AuditEntry['entity'], View> = {
    Animal: 'Animales',
    Evento: 'Eventos',
    Parto: 'Partos',
    Tarea: 'Planificación',
    Configuración: 'Configuración',
  };
  return (
    <>
      <section className="section-head">
        <div>
          <p className="eyebrow">Trazabilidad local</p>
          <h2>Auditoría</h2>
          <p>Creaciones, correcciones y bajas guardadas en este dispositivo.</p>
        </div>
      </section>
      <section className="audit-filters panel">
        <label>
          Entidad
          <select
            value={entity}
            onChange={(event) => setEntity(event.target.value)}
          >
            <option value="">Todas</option>
            {(
              [
                'Animal',
                'Evento',
                'Parto',
                'Tarea',
                'Configuración',
              ] as AuditEntry['entity'][]
            ).map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
        <label>
          Acción
          <select
            value={action}
            onChange={(event) => setAction(event.target.value)}
          >
            <option value="">Todas</option>
            {(
              [
                'Creación',
                'Edición',
                'Baja lógica',
                'Corrección',
              ] as AuditEntry['action'][]
            ).map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
      </section>
      <section className="panel table-panel">
        <table>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Usuario local</th>
              <th>Entidad</th>
              <th>Acción</th>
              <th>Motivo</th>
              <th>Registro</th>
            </tr>
          </thead>
          <tbody>
            {results.length === 0 ? (
              <tr>
                <td colSpan={6} className="empty">
                  No hay registros para este filtro.
                </td>
              </tr>
            ) : (
              results.map((entry) => (
                <tr key={entry.id}>
                  <td>
                    {new Intl.DateTimeFormat('es-CO', {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    }).format(new Date(entry.at))}
                  </td>
                  <td>{entry.localUser}</td>
                  <td>{entry.entity}</td>
                  <td>
                    <span className="badge neutral">{entry.action}</span>
                  </td>
                  <td>{entry.reason || '—'}</td>
                  <td>
                    <button
                      className="quiet"
                      onClick={() => onNavigate(destination[entry.entity])}
                    >
                      Abrir registro
                    </button>
                    <small>{entry.entityId}</small>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </>
  );
}
function Configuration({
  settings,
  backupStatus,
  remoteConfigured,
  remoteUserEmail,
  remotePasswordRecovery,
  remoteFarms,
  remoteInvitations,
  remoteMembers,
  onSave,
  onSaveRemovalCode,
  onExportBackup,
  onRestoreBackup,
  onSignInRemote,
  onSignUpRemote,
  onRequestRemotePasswordReset,
  onUpdateRemotePassword,
  onSignOutRemote,
  onSyncRemote,
  onSelectRemoteFarm,
  onAcceptInvitation,
  onInviteMember,
  onChangeMemberRole,
  onRemoveMember,
}: {
  settings: Settings;
  backupStatus: ReturnType<typeof backupStatusFor>;
  remoteConfigured: boolean;
  remoteUserEmail?: string;
  remotePasswordRecovery: boolean;
  remoteFarms: RemoteFarm[];
  remoteInvitations: RemoteInvitation[];
  remoteMembers: RemoteMember[];
  onSave: (form: HTMLFormElement) => void;
  onSaveRemovalCode: (form: HTMLFormElement) => void;
  onExportBackup: () => Promise<void>;
  onRestoreBackup: (file: File) => void;
  onSignInRemote: (form: HTMLFormElement) => Promise<void>;
  onSignUpRemote: (form: HTMLFormElement) => Promise<void>;
  onRequestRemotePasswordReset: (form: HTMLFormElement) => Promise<void>;
  onUpdateRemotePassword: (form: HTMLFormElement) => Promise<void>;
  onSignOutRemote: () => Promise<void>;
  onSyncRemote: () => Promise<void>;
  onSelectRemoteFarm: (farmId: string) => Promise<void>;
  onAcceptInvitation: (invitationId: string) => Promise<void>;
  onInviteMember: (form: HTMLFormElement) => Promise<void>;
  onChangeMemberRole: (
    userId: string,
    role: Exclude<FarmRole, 'owner'>,
  ) => Promise<void>;
  onRemoveMember: (userId: string) => Promise<void>;
}) {
  const [showRemotePasswordChange, setShowRemotePasswordChange] = useState(false);
  const labels: Record<(typeof numericSettingKeys)[number], string> = {
    bovineGestationDays: 'Gestación bovina (días)',
    buffaloGestationDays: 'Gestación bufalina (días)',
    upcomingBirthDays: 'Parto próximo (días)',
    postServiceDiagnosisDays: 'Diagnóstico posservicio (días)',
    earlyBirthToleranceDays: 'Tolerancia parto anticipado (días)',
    minimumBreedingAgeMonths: 'Edad mínima para reproducción (meses)',
  };
  const selectedRemoteFarm = remoteFarms.find(
    (farm) => farm.id === settings.remoteFarmId,
  );
  return (
    <>
      <section className="section-head">
        <div>
          <p className="eyebrow">Reglas configurables</p>
          <h2>Configuración</h2>
          <p>Los cambios se guardan en este dispositivo.</p>
        </div>
      </section>
      <form
        key={`${settings.remoteFarmId ?? 'local'}:${settings.farmName}`}
        className="settings-form panel"
        onSubmit={(e) => {
          e.preventDefault();
          onSave(e.currentTarget);
        }}
      >
        <Input
          label="Nombre de la finca"
          name="farmName"
          required
          defaultValue={settings.farmName}
        />
        <Input
          label="Usuario local"
          name="localUser"
          required
          defaultValue={settings.localUser}
        />
        {numericSettingKeys.map((key) => (
          <Input
            key={key}
            label={labels[key]}
            name={key}
            type="number"
            required
            defaultValue={settings[key]}
          />
        ))}
        <button className="primary form-submit">Guardar parámetros</button>
      </form>
      <section className="panel backup-panel">
        <div>
          <p className="eyebrow">Respaldo local</p>
          <h3>Protege los datos de la finca</h3>
          <p>
            Descarga una copia al finalizar cada jornada con cambios y siempre
            antes de actualizar, limpiar el navegador o cambiar de computador.
            La restauración reemplaza los datos actuales únicamente después de
            su confirmación.
          </p>
          <p
            className={`backup-status ${backupStatus.due ? 'is-due' : 'is-current'}`}
            role="status"
          >
            <strong>{backupStatus.label}.</strong> {backupStatus.detail}
          </p>
          <ul className="backup-checklist">
            <li>Guarda el archivo fuera de la carpeta Descargas.</li>
            <li>Conserva una segunda copia en la ubicación remota aprobada.</li>
            <li>El primer lunes de cada mes, prueba una restauración en otro perfil.</li>
          </ul>
          {settings.lastBackupRestoredAt && (
            <p className="backup-restore-date">
              Última restauración registrada en este equipo: {date(settings.lastBackupRestoredAt)}.
            </p>
          )}
        </div>
        <div className="backup-actions">
          <button className="primary" type="button" onClick={onExportBackup}>
            Descargar respaldo de hoy
          </button>
          <label className="quiet backup-restore">
            Restaurar respaldo
            <input
              type="file"
              accept="application/json,.json"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                if (file) onRestoreBackup(file);
                event.currentTarget.value = '';
              }}
            />
          </label>
        </div>
      </section>
      <section className="panel security-panel">
        <div>
          <p className="eyebrow">Seguridad</p>
          <h3>Clave para eliminar animales</h3>
          <p>
            Protege la retirada de animales de la operación. La clave se guarda
            de forma protegida en este dispositivo y nunca se muestra.
          </p>
        </div>
        <form
          className="security-form"
          onSubmit={(event) => {
            event.preventDefault();
            onSaveRemovalCode(event.currentTarget);
          }}
        >
          {settings.animalRemovalCodeHash && (
            <Input
              label="Clave actual"
              name="currentPasscode"
              type="password"
              autoComplete="current-password"
              required
            />
          )}
          <Input
            label="Nueva clave"
            name="passcode"
            type="password"
            minLength={8}
            autoComplete="new-password"
            required
          />
          <Input
            label="Confirmar clave"
            name="passcodeConfirm"
            type="password"
            minLength={8}
            autoComplete="new-password"
            required
          />
          <button className="primary form-submit">
            {settings.animalRemovalCodeHash ? 'Cambiar clave' : 'Guardar clave'}
          </button>
        </form>
      </section>
      <section className="panel remote-sync-panel">
        <h3>Sincronización remota</h3>
        {!remoteConfigured ? (
          <p>Falta la configuración local para enlazar este dispositivo al piloto remoto.</p>
        ) : remotePasswordRecovery ? (
          <form className="remote-password-reset" onSubmit={(event) => { event.preventDefault(); void onUpdateRemotePassword(event.currentTarget); }}>
            <p>El enlace fue validado. Define una contraseña para tu cuenta piloto.</p>
            <Input label="Nueva contraseña" name="remotePassword" type="password" minLength={8} autoComplete="new-password" required />
            <Input label="Confirmar nueva contraseña" name="remotePasswordConfirmation" type="password" minLength={8} autoComplete="new-password" required />
            <button className="primary" type="submit">Guardar nueva contraseña</button>
          </form>
        ) : remoteUserEmail ? (
          <>
            <p>
              Sesión piloto: <strong>{remoteUserEmail}</strong>. Los respaldos locales siguen siendo obligatorios.
            </p>
            <div className="backup-actions">
              <button className="primary" type="button" onClick={onSyncRemote}>
                Sincronizar y actualizar
              </button>
              <button className="quiet" type="button" onClick={() => setShowRemotePasswordChange((visible) => !visible)}>
                {showRemotePasswordChange ? 'Cancelar cambio de contraseña' : 'Cambiar contraseña'}
              </button>
              <button className="quiet" type="button" onClick={onSignOutRemote}>
                Cerrar sesión remota
              </button>
            </div>
            <div className="shared-farm-panel">
              <div>
                <p className="eyebrow">Fincas compartidas</p>
                <h4>Selecciona la finca de trabajo</h4>
                <p>
                  Al abrir una finca se descarga su información. Antes de cambiar
                  de finca, sincroniza o respalda el trabajo local pendiente.
                </p>
              </div>
              {remoteFarms.length ? (
                <div className="shared-farm-list">
                  {remoteFarms.map((farm) => (
                    <button
                      className={farm.id === settings.remoteFarmId ? 'shared-farm active' : 'shared-farm'}
                      type="button"
                      key={farm.id}
                      onClick={() => void onSelectRemoteFarm(farm.id)}
                    >
                      <span>{farm.name}</span>
                      <small>{farm.role === 'owner' ? 'Propietario' : farm.role}</small>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="backup-restore-date">Aún no tienes fincas remotas. Sincroniza la finca local para crear la primera.</p>
              )}
              {remoteInvitations.length > 0 && (
                <div className="invitation-list">
                  <h4>Invitaciones recibidas</h4>
                  {remoteInvitations.map((invitation) => (
                    <div className="invitation-row" key={invitation.invitation_id}>
                      <span>{invitation.farm_name} · {invitation.role}</span>
                      <button className="quiet" type="button" onClick={() => void onAcceptInvitation(invitation.invitation_id)}>
                        Aceptar invitación
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {selectedRemoteFarm?.role === 'owner' && (
                <div className="member-management">
                  <h4>Usuarios de {selectedRemoteFarm.name}</h4>
                  <form className="member-invite" onSubmit={(event) => { event.preventDefault(); void onInviteMember(event.currentTarget); }}>
                    <Input label="Correo del usuario" name="memberEmail" type="email" required />
                    <label>Rol
                      <select name="memberRole" defaultValue="operator">
                        <option value="manager">Administrador</option>
                        <option value="operator">Operador</option>
                        <option value="viewer">Solo lectura</option>
                      </select>
                    </label>
                    <button className="quiet" type="submit">Crear invitación</button>
                  </form>
                  <div className="member-list">
                    {remoteMembers.map((member) => (
                      <div className="member-row" key={member.user_id}>
                        <span>{member.email}</span>
                        {member.role === 'owner' ? (
                          <strong>Propietario</strong>
                        ) : (
                          <>
                            <select value={member.role} onChange={(event) => void onChangeMemberRole(member.user_id, event.currentTarget.value as Exclude<FarmRole, 'owner'>)}>
                              <option value="manager">Administrador</option>
                              <option value="operator">Operador</option>
                              <option value="viewer">Solo lectura</option>
                            </select>
                            <button className="quiet danger-action" type="button" onClick={() => void onRemoveMember(member.user_id)}>Retirar</button>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            {showRemotePasswordChange && (
              <form className="remote-password-reset" onSubmit={(event) => { event.preventDefault(); void onUpdateRemotePassword(event.currentTarget); }}>
                <p>La sesión piloto está activa. Define una contraseña nueva para futuros ingresos.</p>
                <Input label="Nueva contraseña" name="remotePassword" type="password" minLength={8} autoComplete="new-password" required />
                <Input label="Confirmar nueva contraseña" name="remotePasswordConfirmation" type="password" minLength={8} autoComplete="new-password" required />
                <button className="primary" type="submit">Guardar nueva contraseña</button>
              </form>
            )}
            {settings.remoteLastSyncedAt && (
              <p className="backup-restore-date">
                Última sincronización: {date(settings.remoteLastSyncedAt)}.
              </p>
            )}
            {settings.remoteLastPulledAt && (
              <p className="backup-restore-date">
                Última actualización descargada: {date(settings.remoteLastPulledAt)}. Los conflictos conservan la versión remota.
              </p>
            )}
          </>
        ) : (
          <div className="remote-auth-grid">
            <form onSubmit={(event) => { event.preventDefault(); void onSignInRemote(event.currentTarget); }}>
              <h4>Ingresar al piloto</h4>
              <Input label="Correo" name="remoteEmail" type="email" autoComplete="email" required />
              <Input label="Contraseña" name="remotePassword" type="password" autoComplete="current-password" required />
              <button className="primary" type="submit">Iniciar sesión</button>
            </form>
            <form onSubmit={(event) => { event.preventDefault(); void onSignUpRemote(event.currentTarget); }}>
              <h4>Crear cuenta piloto</h4>
              <Input label="Correo" name="remoteEmail" type="email" autoComplete="email" required />
              <Input label="Contraseña" name="remotePassword" type="password" minLength={8} autoComplete="new-password" required />
              <p>La contraseña la defines tú; por seguridad no se guarda ni se puede mostrar después.</p>
              <button className="quiet" type="submit">Enviar registro</button>
            </form>
            <form onSubmit={(event) => { event.preventDefault(); void onRequestRemotePasswordReset(event.currentTarget); }}>
              <h4>¿No recuerda la contraseña?</h4>
              <p>Enviaremos un enlace seguro para definir una nueva.</p>
              <Input label="Correo de la cuenta piloto" name="remoteEmail" type="email" autoComplete="email" required />
              <button className="quiet" type="submit">Enviar enlace de recuperación</button>
            </form>
          </div>
        )}
      </section>
    </>
  );
}
function Input({
  label,
  name,
  type = 'text',
  ...props
}: {
  label: string;
  name: string;
  type?: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label>
      {label}
      <input name={name} type={type} {...props} />
    </label>
  );
}
function Select({
  label,
  name,
  options,
  encoded,
  placeholder,
  ...props
}: {
  label: string;
  name: string;
  options: string[];
  encoded?: boolean;
  placeholder?: string;
} & React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <label>
      {label}
      <select name={name} {...props}>
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {!props.required && <option value="">Sin especificar</option>}
        {options.map((item) => {
          const [value, text] = encoded ? item.split('|') : [item, item];
          return (
            <option key={item} value={value}>
              {text}
            </option>
          );
        })}
      </select>
    </label>
  );
}
