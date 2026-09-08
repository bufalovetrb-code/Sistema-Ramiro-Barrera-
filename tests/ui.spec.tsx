import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Home from '../app/page';

vi.mock('../lib/repository', () => ({ LocalFarmRepository: class { async load() { return { animals: [], events: [], births: [], audits: [], settings: { bovineGestationDays: 283, buffaloGestationDays: 310, upcomingBirthDays: 30, postServiceDiagnosisDays: 45, earlyBirthToleranceDays: 45, minimumBreedingAgeMonths: 18 } }; } async save() {} } }));
describe('interfaz', () => { beforeEach(() => { global.crypto.randomUUID = () => '00000000-0000-4000-8000-000000000000'; }); it('muestra la navegación principal al cargar', async () => { render(<Home />); expect(await screen.findByRole('button', { name: 'Animales' })).toBeInTheDocument(); expect(screen.getByRole('button', { name: 'Auditoría' })).toBeInTheDocument(); expect(screen.getByRole('heading', { name: 'Resumen' })).toBeInTheDocument(); }); });
