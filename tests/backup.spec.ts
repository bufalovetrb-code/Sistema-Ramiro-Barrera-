import { describe, expect, it } from 'vitest';
import { restoreDataFrom } from '../app/page';

const base = {
  animals: [
    {
      id: 'mother-1',
      displayId: 'A001',
      species: 'Bovino',
      breed: 'Brahman',
      sex: 'Hembra',
      birthDate: '2020-01-01',
      status: 'Activo',
      createdAt: '2020-01-01T00:00:00.000Z',
      updatedAt: '2020-01-01T00:00:00.000Z',
    },
  ],
  events: [],
  births: [],
  audits: [],
  settings: { farmName: 'Miraflores' },
};

describe('respaldo local', () => {
  it('restaura un respaldo válido y completa los ajustes que falten', () => {
    const restored = restoreDataFrom({
      format: 'RB SmartFarm respaldo local',
      version: 1,
      data: base,
    });
    expect(restored?.animals).toHaveLength(1);
    expect(restored?.settings.farmName).toBe('Miraflores');
    expect(restored?.settings.localUser).toBe('Usuario local');
  });
  it('rechaza animales duplicados o eventos sin animal vinculado', () => {
    expect(
      restoreDataFrom({ ...base, animals: [...base.animals, base.animals[0]] }),
    ).toBeUndefined();
    expect(
      restoreDataFrom({
        ...base,
        events: [{ animalId: 'animal-inexistente' }],
      }),
    ).toBeUndefined();
  });
});
