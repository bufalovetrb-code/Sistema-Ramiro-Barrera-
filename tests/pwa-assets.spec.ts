import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const projectFile = (name: string) => resolve(process.cwd(), 'public', name);
const dimensions = (png: Buffer) => ({ width: png.readUInt32BE(16), height: png.readUInt32BE(20) });

describe('recursos de instalación PWA', () => {
  it('declara identificador estable e iconos PNG de Chromium', async () => {
    const manifest = JSON.parse(await readFile(projectFile('manifest.webmanifest'), 'utf8')) as { id: string; icons: { src: string; sizes: string; purpose?: string }[] };
    expect(manifest.id).toBe('/rb-smartfarm-reproduccion');
    expect(manifest.icons).toEqual(expect.arrayContaining([
      expect.objectContaining({ src: '/icon-192.png', sizes: '192x192', purpose: 'any maskable' }),
      expect.objectContaining({ src: '/icon-512.png', sizes: '512x512', purpose: 'any maskable' }),
    ]));
  });
  it('entrega los tamaños PNG declarados y un service worker con fallback offline', async () => {
    expect(dimensions(await readFile(projectFile('icon-192.png')))).toEqual({ width: 192, height: 192 });
    expect(dimensions(await readFile(projectFile('icon-512.png')))).toEqual({ width: 512, height: 512 });
    await expect(readFile(projectFile('sw.js'), 'utf8')).resolves.toContain("caches.match('/')");
  });
});
