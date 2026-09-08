import { defaultSettings, seedAnimals, seedEvents, type Animal, type AuditEntry, type Birth, type ReproductiveEvent, type Settings } from './domain';

export interface FarmData { animals: Animal[]; events: ReproductiveEvent[]; births: Birth[]; audits: AuditEntry[]; settings: Settings }
const DB = 'rb-smartfarm-reproduccion';
const STORE = 'farm-data';
const KEY = 'singleton';
const fresh = (): FarmData => ({ animals: seedAnimals, events: seedEvents, births: [], audits: [], settings: defaultSettings });

export class LocalFarmRepository {
  private db?: IDBDatabase;
  async open() {
    if (this.db) return this.db;
    this.db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DB, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return this.db;
  }
  async load(): Promise<FarmData> {
    const db = await this.open();
    const data = await new Promise<FarmData | undefined>((resolve, reject) => {
      const request = db.transaction(STORE, 'readonly').objectStore(STORE).get(KEY);
      request.onsuccess = () => resolve(request.result as FarmData | undefined);
      request.onerror = () => reject(request.error);
    });
    if (data) return data;
    const seeded = fresh();
    await this.save(seeded);
    return seeded;
  }
  async save(data: FarmData) {
    const db = await this.open();
    await new Promise<void>((resolve, reject) => {
      const request = db.transaction(STORE, 'readwrite').objectStore(STORE).put(data, KEY);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
}
