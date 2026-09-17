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
        tasks: [],
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

describe('planificación en interfaz', () => {
  afterEach(cleanup);

  it('muestra la programación y filtros de tareas', async () => {
    render(<Home />);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Planificación' }),
    );
    expect(
      screen.getByRole('heading', { name: 'Planificación reproductiva' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Fecha programada')).toBeInTheDocument();
    expect(screen.getByLabelText('Responsable')).toBeInTheDocument();
    expect(screen.getByLabelText('Filtrar tareas')).toBeInTheDocument();
  });
});
