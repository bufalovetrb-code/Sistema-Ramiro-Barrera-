import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Home from '../app/page';

vi.mock('../lib/repository', () => ({
  LocalFarmRepository: class {
    async load() {
      return {
        animals: [],
        events: [],
        births: [],
        audits: [],
        settings: {
          bovineGestationDays: 283,
          buffaloGestationDays: 310,
          upcomingBirthDays: 30,
          postServiceDiagnosisDays: 45,
          earlyBirthToleranceDays: 45,
          minimumBreedingAgeMonths: 18,
        },
      };
    }
    async save() {}
  },
}));

describe('indicadores en interfaz', () => {
  afterEach(cleanup);

  it('muestra filtros y definiciones de indicadores reproductivos', async () => {
    render(<Home />);
    fireEvent.click(await screen.findByRole('button', { name: 'Indicadores' }));
    expect(
      screen.getByRole('heading', { name: 'Indicadores y reportes' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Desde')).toBeInTheDocument();
    expect(screen.getByLabelText('Hasta')).toBeInTheDocument();
    expect(screen.getByLabelText('Especie')).toBeInTheDocument();
    expect(screen.getByText('Tasa de preñez')).toBeInTheDocument();
    expect(screen.getByText('Servicios por concepción')).toBeInTheDocument();
  });
});
