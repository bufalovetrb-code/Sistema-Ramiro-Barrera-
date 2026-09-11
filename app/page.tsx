'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CalendarDays,
  ChevronRight,
  ClipboardPlus,
  Beef,
  FileSearch,
  HeartPulse,
  Menu,
  Plus,
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
  type Settings,
  uid,
  validateBirth,
  validateEvent,
} from '@/lib/domain';
import { LocalFarmRepository, type FarmData } from '@/lib/repository';

type View =
  | 'Resumen'
  | 'Animales'
  | 'Eventos'
  | 'Ciclos'
  | 'Partos'
  | 'Auditoría'
  | 'Configuración';
const empty: FarmData = {
  animals: [],
  events: [],
  births: [],
  audits: [],
  settings: defaultSettings,
};
const fmt = new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium' });
const date = (value?: string) =>
  value ? fmt.format(new Date(`${value.slice(0, 10)}T12:00:00`)) : '—';
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
const minimumBreedingAge = (animal: Animal) =>
  animal.species === 'Búfalo' ? 24 : 18;
const inventoryCategory = (animal: Animal) => {
  const months = ageInMonths(animal.birthDate);
  const minimum = minimumBreedingAge(animal);
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
const reproductiveCategory = (animal: Animal) => inventoryCategory(animal);
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

export default function Home() {
  const [data, setData] = useState<FarmData>(empty);
  const [loaded, setLoaded] = useState(false);
  const [view, setView] = useState<View>('Resumen');
  const [mobileNav, setMobileNav] = useState(false);
  const [notice, setNotice] = useState('');
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
  const persist = async (next: FarmData) => {
    setData(next);
    await repo.save(next);
  };
  const audit = (
    entity: 'Animal' | 'Evento' | 'Parto' | 'Configuración',
    entityId: string,
    action: 'Creación' | 'Edición' | 'Baja lógica' | 'Corrección',
    reason?: string,
  ) => ({
    id: uid(),
    entity,
    entityId,
    action,
    at: new Date().toISOString(),
    localUser: 'Usuario local',
    reason,
  });
  const addAnimal = async (form: HTMLFormElement) => {
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
      diagnosisDate: formValue(values, 'diagnosisDate') || undefined,
      notes: formValue(values, 'notes') || undefined,
      valid: true,
      validationIssues: [],
      createdAt: new Date().toISOString(),
    };
    draft.validationIssues = validateEvent(draft, animal);
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
  const addBirth = async (form: HTMLFormElement) => {
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
    const issues = validateBirth(
      { motherId, occurredAt, type },
      mother,
      relevant,
      data.settings,
    );
    const birthId = uid();
    const shouldCreateCalf =
      issues.length === 0 &&
      formValue(values, 'condition') === 'Vivo' &&
      mother;
    const calf = shouldCreateCalf
      ? {
          id: uid(),
          displayId: nextCalfDisplayId(data.animals, occurredAt.slice(0, 10)),
          species: mother.species,
          breed: mother.breed,
          sex: (formValue(values, 'sex') || 'Hembra') as Animal['sex'],
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
      sex: (formValue(values, 'sex') || undefined) as Birth['sex'],
      condition: (formValue(values, 'condition') ||
        undefined) as Birth['condition'],
      assistance: formValue(values, 'assistance') || undefined,
      valid: issues.length === 0,
      needsReview: issues.length > 0,
      validationIssues: issues,
      calfId: calf?.id,
      createdAt: new Date().toISOString(),
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
    if (birth.calfId || !birth.valid) return;
    const mother = data.animals.find((item) => item.id === birth.motherId);
    if (!mother) return;
    const now = new Date().toISOString();
    const calf: Animal = {
      id: uid(),
      displayId: nextCalfDisplayId(data.animals, birth.occurredAt.slice(0, 10)),
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
        item.id === birth.id ? { ...item, calfId: calf.id } : item,
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
    const vals = new FormData(form);
    const settings = {
      ...data.settings,
      ...Object.fromEntries(
        numericSettingKeys.map((key) => [key, Number(vals.get(key))]),
      ),
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
  const activeAnimals = data.animals.filter((item) => !item.deletedAt);
  const activeCycles = cycles.filter(
    (cycle) => cycle.status === 'Gestación activa',
  );
  const reviewCycles = cycles.filter(
    (cycle) => cycle.status === 'Requiere revisión',
  );
  const nowDay = new Date().toISOString().slice(0, 10);
  const upcoming = activeCycles.filter(
    (cycle) =>
      cycle.expectedBirthDate &&
      new Date(`${cycle.expectedBirthDate}T12:00:00`).getTime() -
        new Date(`${nowDay}T12:00:00`).getTime() <=
        data.settings.upcomingBirthDays * 86_400_000,
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
                setMobileNav(false);
              }}
            >
              {icon}
              {label}
              {label === 'Ciclos' && reviewCycles.length > 0 && (
                <em>{reviewCycles.length}</em>
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
            <p className="eyebrow">Finca local</p>
            <h1>{view}</h1>
          </div>
          <div className="top-actions">
            <span className="sync-state">● Sin conexión</span>
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
                upcoming={upcoming}
                review={reviewCycles}
                onNavigate={setView}
              />
            )}
            {view === 'Animales' && (
              <Animals
                animals={data.animals}
                cycles={cycles}
                events={data.events}
                births={data.births}
                audits={data.audits}
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
                onSave={saveSettings}
                onSaveRemovalCode={saveRemovalCode}
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
  upcoming,
  review,
  onNavigate,
}: {
  animals: Animal[];
  cycles: Cycle[];
  births: Birth[];
  upcoming: Cycle[];
  review: Cycle[];
  onNavigate: (v: View) => void;
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
    animals.filter((animal) => inventoryCategory(animal).group === group)
      .length;
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
      </section>
      <section className="panel inventory-summary">
        <div className="panel-head">
          <div>
            <p className="eyebrow">Inventario actual</p>
            <h3>Animales presentes en la finca</h3>
            <p>Clasificación automática según sexo, especie y edad.</p>
          </div>
          <button className="quiet" onClick={() => onNavigate('Animales')}>
            Ver Base maestra <ChevronRight />
          </button>
        </div>
        <div className="inventory-breakdown">
          <div>
            <span>Crías</span>
            <strong>{inventoryCount('cría')}</strong>
          </div>
          <div>
            <span>Novillas / levante</span>
            <strong>{inventoryCount('novilla')}</strong>
          </div>
          <div>
            <span>Hembras reproductoras</span>
            <strong>{inventoryCount('hembra-reproductora')}</strong>
          </div>
          <div>
            <span>Reproductores</span>
            <strong>{inventoryCount('reproductor')}</strong>
          </div>
          <div>
            <span>Machos jóvenes</span>
            <strong>{inventoryCount('joven')}</strong>
          </div>
        </div>
      </section>
      <section className="dashboard-grid">
        <article className="panel">
          <div className="panel-head">
            <div>
              <h3>Alertas prioritarias</h3>
              <p>Información que requiere seguimiento.</p>
            </div>
            <button className="quiet" onClick={() => onNavigate('Ciclos')}>
              Ver ciclos <ChevronRight />
            </button>
          </div>
          {review.length === 0 && upcoming.length === 0 ? (
            <p className="empty">No hay alertas abiertas.</p>
          ) : (
            <div className="alert-list">
              {review.map((cycle) => (
                <AlertRow
                  key={cycle.id}
                  cycle={cycle}
                  kind="review"
                  animals={animals}
                />
              ))}
              {upcoming.map((cycle) => (
                <AlertRow
                  key={cycle.id}
                  cycle={cycle}
                  kind="upcoming"
                  animals={animals}
                />
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
function AlertRow({
  cycle,
  kind,
  animals,
}: {
  cycle: Cycle;
  kind: 'review' | 'upcoming';
  animals: Animal[];
}) {
  const animal = animals.find((item) => item.id === cycle.animalId);
  return (
    <div className="alert-row">
      <span className={`icon-tile ${kind}`}>
        <AlertTriangle />
      </span>
      <div>
        <strong>{animal?.displayId ?? 'Animal eliminado'}</strong>
        <p>
          {kind === 'review'
            ? cycle.reviewReasons.join(' ')
            : `Parto previsto: ${date(cycle.expectedBirthDate)}`}
        </p>
      </div>
      <span className={`badge ${kind === 'review' ? 'danger' : 'warning'}`}>
        {kind === 'review' ? 'Revisar ciclo' : 'Próximo parto'}
      </span>
    </div>
  );
}
function Animals({
  animals,
  cycles,
  events,
  births,
  audits,
  onAdd,
  onRetire,
  onWean,
}: {
  animals: Animal[];
  cycles: Cycle[];
  events: ReproductiveEvent[];
  births: Birth[];
  audits: AuditEntry[];
  onAdd: (form: HTMLFormElement) => void;
  onRetire: (animal: Animal, passcode: string) => Promise<boolean>;
  onWean: (animal: Animal, form: HTMLFormElement) => Promise<boolean>;
}) {
  const [showForm, setShowForm] = useState(false);
  const [history, setHistory] = useState<Animal | null>(null);
  const [technicalSheet, setTechnicalSheet] = useState<Animal | null>(null);
  const [pendingRemoval, setPendingRemoval] = useState<Animal | null>(null);
  const [pendingWeaning, setPendingWeaning] = useState<Animal | null>(null);
  const visibleAnimals = animals.filter((animal) => !animal.deletedAt);
  const state = (animal: Animal) => {
    const cycle = cycles.filter((item) => item.animalId === animal.id).at(-1);
    return cycle
      ? { label: cycle.status, tone: statusClass(cycle.status) }
      : reproductiveCategory(animal);
  };
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
          detail: item.result || item.notes || 'Sin resultado especificado',
        })),
      ...births
        .filter((item) => item.motherId === animal.id)
        .map((item) => ({
          at: item.occurredAt,
          title: `Parto: ${item.type}`,
          detail: item.valid
            ? 'Parto validado'
            : item.validationIssues.join(' ') || 'Requiere revisión',
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
        <button className="primary" onClick={() => setShowForm(!showForm)}>
          <Plus /> Nuevo animal
        </button>
      </section>
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
            ) : (
              visibleAnimals.map((animal) => {
                const animalState = state(animal);
                const category = inventoryCategory(animal);
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
                <strong>{inventoryCategory(technicalSheet).label}</strong>
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
  onAdd: (form: HTMLFormElement) => void;
}) {
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
        onSubmit={(e) => {
          e.preventDefault();
          onAdd(e.currentTarget);
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
            'Otro',
          ]}
        />
        <Select
          label="Resultado"
          name="result"
          options={['', 'Gestante', 'Vacía', 'Dudosa', 'No evaluable']}
        />
        <Input label="Fecha de servicio" name="serviceDate" type="date" />
        <Input label="Fecha diagnóstico" name="diagnosisDate" type="date" />
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
  onAdd: (form: HTMLFormElement) => void;
  onCreateCalf: (birth: Birth) => void;
}) {
  const mothers = animals.filter((animal) => animal.sex === 'Hembra');
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
        onSubmit={(e) => {
          e.preventDefault();
          onAdd(e.currentTarget);
        }}
      >
        <Select
          label="Madre"
          name="motherId"
          options={mothers.map((item) => `${item.id}|${item.displayId}`)}
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
          label="Tipo de parto"
          name="type"
          options={['Normal', 'Distócico', 'Cesárea']}
          required
        />
        <Select
          label="Sexo de cría"
          name="sex"
          options={['', 'Hembra', 'Macho']}
        />
        <Select
          label="Condición"
          name="condition"
          options={['', 'Vivo', 'Muerto', 'Débil']}
        />
        <Input label="Asistencia" name="assistance" />
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
                        <span className="badge neutral">
                          {calf?.displayId ?? 'Creada'}
                        </span>
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
  onSave,
  onSaveRemovalCode,
}: {
  settings: Settings;
  onSave: (form: HTMLFormElement) => void;
  onSaveRemovalCode: (form: HTMLFormElement) => void;
}) {
  const labels: Record<(typeof numericSettingKeys)[number], string> = {
    bovineGestationDays: 'Gestación bovina (días)',
    buffaloGestationDays: 'Gestación bufalina (días)',
    upcomingBirthDays: 'Parto próximo (días)',
    postServiceDiagnosisDays: 'Diagnóstico posservicio (días)',
    earlyBirthToleranceDays: 'Tolerancia parto anticipado (días)',
    minimumBreedingAgeMonths: 'Edad mínima para reproducción (meses)',
  };
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
        className="settings-form panel"
        onSubmit={(e) => {
          e.preventDefault();
          onSave(e.currentTarget);
        }}
      >
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
      <section className="panel integration-note">
        <h3>Integraciones futuras</h3>
        <p>
          Esta versión no realiza conexiones externas. Si se integra Google
          Drive, Sheets o Gmail, se hará únicamente por Composio y con la cuenta
          autorizada.
        </p>
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
  ...props
}: {
  label: string;
  name: string;
  options: string[];
  encoded?: boolean;
} & React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <label>
      {label}
      <select name={name} {...props}>
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
