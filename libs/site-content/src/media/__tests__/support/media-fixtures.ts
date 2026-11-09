import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { ConfigService } from '@nestjs/config';
import { StorageService } from '@lib/core/storage';
import { SiteMediaStorage } from '../../site-media.storage';

/** Минимальные «файлы» с настоящими сигнатурами — формат узнаётся по ним. */
const pad = (head: Buffer, size: number, seed: string): Buffer =>
    Buffer.concat([head, Buffer.alloc(Math.max(0, size - head.length), seed)]);

export const fakePng = (seed = 'a', size = 64): Buffer =>
    pad(
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        size,
        seed,
    );

export const fakeJpg = (seed = 'b', size = 64): Buffer =>
    pad(Buffer.from([0xff, 0xd8, 0xff, 0xe0]), size, seed);

export const fakeWebp = (seed = 'c', size = 64): Buffer =>
    pad(
        Buffer.concat([
            Buffer.from('RIFF', 'latin1'),
            Buffer.from([0x24, 0, 0, 0]),
            Buffer.from('WEBPVP8 ', 'latin1'),
        ]),
        size,
        seed,
    );

/** ISO-BMFF с брендом: isom/mp42 — ролик, qt/heic — нет. */
export const fakeBmff = (brand: string, seed = 'd', size = 64): Buffer =>
    pad(
        Buffer.concat([
            Buffer.from([0, 0, 0, 0x18]),
            Buffer.from(`ftyp${brand}`, 'latin1'),
        ]),
        size,
        seed,
    );

export const fakeMp4 = (seed = 'd', size = 64): Buffer =>
    fakeBmff('isom', seed, size);

export const fakeHtml = (): Buffer =>
    Buffer.from('<!doctype html><script>alert(1)</script>', 'utf8');

/** Временный корень storage: сервисы пишут в настоящую файловую систему. */
export interface TempStorage {
    root: string;
    config: ConfigService;
    storage: SiteMediaStorage;
    cleanup: () => void;
}

export const createTempStorage = (): TempStorage => {
    const root = mkdtempSync(join(tmpdir(), 'site-media-'));
    const config = {
        get: (key: string) => (key === 'STORAGE_PATH' ? root : undefined),
    } as unknown as ConfigService;
    return {
        root,
        config,
        storage: new SiteMediaStorage(new StorageService(config)),
        cleanup: () => rmSync(root, { recursive: true, force: true }),
    };
};
