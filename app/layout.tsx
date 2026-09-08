import type { Metadata } from 'next';
import './globals.css';
import { PwaRegister } from './pwa-register';
export const metadata: Metadata = { title: 'RB SmartFarm – Reproducción', description: 'Gestión reproductiva local para bovinos y búfalos.', manifest: '/manifest.webmanifest' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="es"><body><PwaRegister />{children}</body></html>; }
