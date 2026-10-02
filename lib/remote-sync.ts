import { defaultSettings, type Settings } from './domain';
import type { FarmData } from './repository';
import { getSupabase } from './supabase';

const settingsRecordId = '00000000-0000-4000-8000-000000000001';

type RemoteEntity = 'Animal' | 'Evento' | 'Parto' | 'Tarea' | 'Configuración';
type RemoteRecord = {
  farm_id: string;
  entity: RemoteEntity;
  id: string;
  payload: object;
  version: number;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
};
type RemoteAudit = {
  id: string;
  entity: FarmData['audits'][number]['entity'];
  entity_id: string;
  action: FarmData['audits'][number]['action'];
  occurred_at: string;
  local_user: string;
  reason?: string | null;
};
export type FarmRole = 'owner' | 'manager' | 'operator' | 'viewer';
export type RemoteFarm = { id: string; name: string; role: FarmRole };
export type RemoteInvitation = {
  invitation_id: string;
  farm_id: string;
  farm_name: string;
  role: FarmRole;
  invited_at: string;
};
export type RemoteMember = {
  user_id: string;
  email: string;
  role: FarmRole;
  joined_at: string;
};
type ChangeResult = {
  entity: RemoteEntity;
  id: string;
  version: number;
  status: 'applied' | 'unchanged' | 'conflict';
};

const recordKey = (entity: RemoteEntity, id: string) => `${entity}:${id}`;
const sharedSettings = (settings: Settings) => {
  const {
    animalRemovalCodeHash: _localRemovalKey,
    remoteFarmId: _remoteFarmId,
    remoteLastSyncedAt: _remoteLastSyncedAt,
    remoteLastPulledAt: _remoteLastPulledAt,
    remoteRecordVersions: _remoteRecordVersions,
    ...shared
  } = settings;
  return shared;
};
const recordsFor = (data: FarmData, farmId: string): RemoteRecord[] => [
  ...data.animals.map((animal) => ({
    farm_id: farmId,
    entity: 'Animal' as const,
    id: animal.id,
    payload: animal,
    version: data.settings.remoteRecordVersions?.[recordKey('Animal', animal.id)] ?? 0,
    created_at: animal.createdAt,
    updated_at: animal.updatedAt,
    deleted_at: animal.deletedAt ?? null,
  })),
  ...data.events.map((event) => ({
    farm_id: farmId,
    entity: 'Evento' as const,
    id: event.id,
    payload: event,
    version: data.settings.remoteRecordVersions?.[recordKey('Evento', event.id)] ?? 0,
    created_at: event.createdAt,
    updated_at: event.createdAt,
  })),
  ...data.births.map((birth) => ({
    farm_id: farmId,
    entity: 'Parto' as const,
    id: birth.id,
    payload: birth,
    version: data.settings.remoteRecordVersions?.[recordKey('Parto', birth.id)] ?? 0,
    created_at: birth.createdAt,
    updated_at: birth.updatedAt ?? birth.createdAt,
  })),
  ...data.tasks.map((task) => ({
    farm_id: farmId,
    entity: 'Tarea' as const,
    id: task.id,
    payload: task,
    version: data.settings.remoteRecordVersions?.[recordKey('Tarea', task.id)] ?? 0,
    created_at: task.createdAt,
    updated_at: task.completedAt ?? task.createdAt,
  })),
  {
    farm_id: farmId,
    entity: 'Configuración' as const,
    id: settingsRecordId,
    payload: sharedSettings(data.settings),
    version:
      data.settings.remoteRecordVersions?.[
        recordKey('Configuración', settingsRecordId)
      ] ?? 0,
    created_at: data.settings.updatedAt ?? new Date().toISOString(),
    updated_at: data.settings.updatedAt ?? new Date().toISOString(),
  },
];

const requireRemoteUser = async () => {
  const supabase = getSupabase();
  const { data: auth, error } = await supabase.auth.getUser();
  if (error || !auth.user) throw new Error('Inicia sesión para sincronizar.');
  return supabase;
};

const remoteSnapshot = async (farmId: string) => {
  const supabase = await requireRemoteUser();
  const [{ data: farm, error: farmError }, { data: records, error: recordsError }, { data: audits, error: auditsError }] =
    await Promise.all([
      supabase.from('farms').select('id,name').eq('id', farmId).single(),
      supabase
        .from('farm_records')
        .select('farm_id,entity,id,payload,version,created_at,updated_at,deleted_at')
        .eq('farm_id', farmId),
      supabase
        .from('audit_entries')
        .select('id,entity,entity_id,action,occurred_at,local_user,reason')
        .eq('farm_id', farmId)
        .order('occurred_at'),
    ]);
  if (farmError || !farm) throw new Error(farmError?.message ?? 'No se encontró la finca remota.');
  if (recordsError) throw new Error(recordsError.message);
  if (auditsError) throw new Error(auditsError.message);
  return {
    farm: { id: farm.id as string, name: farm.name as string },
    records: (records ?? []) as RemoteRecord[],
    audits: (audits ?? []) as RemoteAudit[],
  };
};

const fromSnapshot = (
  local: FarmData,
  snapshot: Awaited<ReturnType<typeof remoteSnapshot>>,
): FarmData => {
  const records = snapshot.records;
  const findPayload = (entity: RemoteEntity) =>
    records.find((record) => record.entity === entity)?.payload;
  const settingsPayload = findPayload('Configuración') as Partial<Settings> | undefined;
  const collection = <T,>(entity: RemoteEntity) =>
    records
      .filter((record) => record.entity === entity)
      .map((record) => record.payload as T);
  const versions = Object.fromEntries(
    records.map((record) => [recordKey(record.entity, record.id), record.version]),
  );
  return {
    animals: collection<FarmData['animals'][number]>('Animal'),
    events: collection<FarmData['events'][number]>('Evento'),
    births: collection<FarmData['births'][number]>('Parto'),
    tasks: collection<FarmData['tasks'][number]>('Tarea'),
    audits: snapshot.audits.map((entry) => ({
      id: entry.id,
      entity: entry.entity,
      entityId: entry.entity_id,
      action: entry.action,
      at: entry.occurred_at,
      localUser: entry.local_user,
      reason: entry.reason ?? undefined,
    })) as FarmData['audits'],
    settings: {
      ...defaultSettings,
      ...settingsPayload,
      farmName: snapshot.farm.name,
      localUser: local.settings.localUser,
      animalRemovalCodeHash: local.settings.animalRemovalCodeHash,
      remoteFarmId: snapshot.farm.id,
      remoteLastPulledAt: new Date().toISOString(),
      remoteRecordVersions: versions,
    },
  };
};

export const listRemoteFarms = async (): Promise<RemoteFarm[]> => {
  const supabase = await requireRemoteUser();
  const [{ data: farms, error: farmsError }, { data: memberships, error: membersError }] =
    await Promise.all([
      supabase.from('farms').select('id,name'),
      supabase.from('farm_members').select('farm_id,role'),
    ]);
  if (farmsError) throw new Error(farmsError.message);
  if (membersError) throw new Error(membersError.message);
  const roleByFarm = new Map((memberships ?? []).map((member) => [member.farm_id as string, member.role as FarmRole]));
  return (farms ?? []).map((farm) => ({
    id: farm.id as string,
    name: farm.name as string,
    role: roleByFarm.get(farm.id as string) ?? 'viewer',
  }));
};

export const pullRemoteFarm = async (local: FarmData, farmId: string) =>
  fromSnapshot(local, await remoteSnapshot(farmId));

export const listRemoteInvitations = async (): Promise<RemoteInvitation[]> => {
  const supabase = await requireRemoteUser();
  const { data, error } = await supabase.rpc('rb_list_my_farm_invitations');
  if (error) throw new Error(error.message);
  return (data ?? []) as RemoteInvitation[];
};

export const acceptRemoteInvitation = async (invitationId: string) => {
  const supabase = await requireRemoteUser();
  const { data, error } = await supabase.rpc('rb_accept_farm_invitation', {
    invitation: invitationId,
  });
  if (error || !data) throw new Error(error?.message ?? 'No se pudo aceptar la invitación.');
  return data as string;
};

export const inviteRemoteMember = async (
  farmId: string,
  email: string,
  role: Exclude<FarmRole, 'owner'>,
) => {
  const supabase = await requireRemoteUser();
  const { error } = await supabase.rpc('rb_invite_farm_member', {
    target_farm: farmId,
    invitee_email: email.trim().toLowerCase(),
    member_role: role,
  });
  if (error) throw new Error(error.message);
};

export const listRemoteMembers = async (farmId: string): Promise<RemoteMember[]> => {
  const supabase = await requireRemoteUser();
  const { data, error } = await supabase.rpc('rb_list_farm_members', {
    target_farm: farmId,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as RemoteMember[];
};

export const updateRemoteMemberRole = async (
  farmId: string,
  userId: string,
  role: Exclude<FarmRole, 'owner'>,
) => {
  const supabase = await requireRemoteUser();
  const { error } = await supabase.rpc('rb_set_farm_member_role', {
    target_farm: farmId,
    target_user: userId,
    member_role: role,
  });
  if (error) throw new Error(error.message);
};

export const removeRemoteMember = async (farmId: string, userId: string) => {
  const supabase = await requireRemoteUser();
  const { error } = await supabase.rpc('rb_remove_farm_member', {
    target_farm: farmId,
    target_user: userId,
  });
  if (error) throw new Error(error.message);
};

export const syncFarmData = async (data: FarmData) => {
  const supabase = await requireRemoteUser();
  let farmId = data.settings.remoteFarmId;
  if (!farmId) {
    const { data: resolvedFarmId, error } = await supabase.rpc(
      'rb_find_or_create_owned_farm',
      { farm_name: data.settings.farmName },
    );
    if (error || !resolvedFarmId)
      throw new Error(error?.message ?? 'No se pudo crear la finca remota.');
    farmId = resolvedFarmId as string;
  }
  const records = recordsFor(data, farmId);
  const { data: changes, error: changesError } = await supabase.rpc(
    'rb_apply_farm_changes',
    {
      target_farm: farmId,
      changes: records.map((record) => ({
        entity: record.entity,
        id: record.id,
        payload: record.payload,
        base_version: record.version,
        created_at: record.created_at,
        deleted_at: record.deleted_at ?? null,
      })),
    },
  );
  if (changesError) throw new Error(changesError.message);

  const auditEntries = data.audits.map((entry) => ({
    id: entry.id,
    farm_id: farmId,
    entity: entry.entity,
    entity_id: entry.entityId,
    action: entry.action,
    occurred_at: entry.at,
    local_user: entry.localUser,
    reason: entry.reason ?? null,
  }));
  if (auditEntries.length) {
    const { error: auditError } = await supabase.rpc('rb_append_audit_entries', {
      target_farm: farmId,
      entries: auditEntries,
    });
    if (auditError) throw new Error(auditError.message);
  }
  const result = (changes ?? []) as ChangeResult[];
  const conflicts = result.filter((change) => change.status === 'conflict').length;
  const next = fromSnapshot(data, await remoteSnapshot(farmId));
  return {
    farmId,
    records: records.length,
    audits: auditEntries.length,
    conflicts,
    data: {
      ...next,
      settings: {
        ...next.settings,
        remoteLastSyncedAt: new Date().toISOString(),
      },
    },
  };
};
