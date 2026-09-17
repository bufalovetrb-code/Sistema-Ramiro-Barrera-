import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Home from '../app/page';

vi.mock('../lib/repository', () => ({
  LocalFarmRepository: class {
    async load() {
      return {
        animals: [
          {
            id: 'animal-1',
            displayId: 'A0100',
            rfid: 'RFID-100',
            earTag: 'ARETE-100',
            species: 'Bovino',
            breed: 'Brahman',
            sex: 'Hembra',
            birthDate: '2022-01-01',
            status: 'Activo',
            createdAt: '2022-01-01T00:00:00.000Z',
            updatedAt: '2022-01-01T00:00:00.000Z',
          },
        ],
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

describe('paquete 5: búsqueda e impresión', () => {
  const print = vi.fn();

  beforeEach(() => {
    Object.defineProperty(window, 'print', {
      configurable: true,
      value: print,
    });
  });

  afterEach(() => {
    cleanup();
    print.mockReset();
    delete document.body.dataset.printTarget;
  });

  it('busca por ID visible, RFID y arete', async () => {
    render(<Home />);
    fireEvent.click(await screen.findByRole('button', { name: 'Animales' }));

    const search = screen.getByRole('textbox', {
      name: 'Buscar animal por ID, RFID o arete',
    });
    fireEvent.change(search, { target: { value: 'rfid-100' } });
    expect(screen.getByText('A0100')).toBeInTheDocument();

    fireEvent.change(search, { target: { value: 'ARETE-100' } });
    expect(screen.getByText('A0100')).toBeInTheDocument();

    fireEvent.change(search, { target: { value: 'sin-coincidencia' } });
    expect(
      screen.getByText('No hay animales que cumplan estos filtros.'),
    ).toBeInTheDocument();
  });

  it('abre la impresión de reporte y ficha técnica', async () => {
    render(<Home />);
    fireEvent.click(await screen.findByRole('button', { name: 'Indicadores' }));
    fireEvent.click(screen.getByRole('button', { name: 'Imprimir reporte' }));
    expect(print).toHaveBeenCalledTimes(1);
    expect(document.body.dataset.printTarget).toBe('report');

    fireEvent.click(screen.getByRole('button', { name: 'Animales' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ficha técnica' }));
    fireEvent.click(screen.getByRole('button', { name: 'Imprimir ficha' }));
    expect(print).toHaveBeenCalledTimes(2);
    expect(document.body.dataset.printTarget).toBe('technical-sheet');
  });
});
