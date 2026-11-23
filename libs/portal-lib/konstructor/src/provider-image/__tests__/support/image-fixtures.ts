import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { ConfigService } from '@nestjs/config';
import sharp from 'sharp';
import { StorageService } from '@lib/core/storage';
import { ProviderImageStorage } from '../../provider-image.storage';

/** Настоящий PNG заданного размера: файлы картинок в git не лежат, тесты рисуют их сами. */
export const makePng = (width = 40, height = 20): Promise<Buffer> =>
    sharp({
        create: {
            width,
            height,
            channels: 3,
            background: { r: 200, g: 30, b: 30 },
        },
    })
        .png()
        .toBuffer();

/** Настоящий JPEG заданного размера. */
export const makeJpg = (width = 40, height = 20): Promise<Buffer> =>
    sharp({
        create: {
            width,
            height,
            channels: 3,
            background: { r: 30, g: 30, b: 200 },
        },
    })
        .jpeg()
        .toBuffer();

/** Настоящий GIF: формат, который загружать нельзя. */
export const makeGif = (): Promise<Buffer> =>
    sharp({
        create: {
            width: 4,
            height: 4,
            channels: 3,
            background: { r: 0, g: 0, b: 0 },
        },
    })
        .gif()
        .toBuffer();

export const fakeHtml = (): Buffer =>
    Buffer.from('<!doctype html><script>alert(1)</script>', 'utf8');

/** PNG-сигнатура с мусором вместо картинки: формат узнаётся, читаться файл не будет. */
export const brokenPng = (): Buffer =>
    Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        Buffer.alloc(64, 'x'),
    ]);

/** Временный корень storage: сервис пишет в настоящую файловую систему. */
export interface TempStorage {
    root: string;
    config: ConfigService;
    storageService: StorageService;
    storage: ProviderImageStorage;
    /** Полный путь файла по пути внутри `storage/app` */
    fullPath: (relativePath: string) => string;
    cleanup: () => void;
}

export const createTempStorage = (): TempStorage => {
    const root = mkdtempSync(join(tmpdir(), 'provider-image-'));
    const config = {
        get: (key: string) => (key === 'STORAGE_PATH' ? root : undefined),
    } as unknown as ConfigService;
    const storageService = new StorageService(config);
    return {
        root,
        config,
        storageService,
        storage: new ProviderImageStorage(storageService),
        fullPath: relativePath => join(root, 'app', relativePath),
        cleanup: () => rmSync(root, { recursive: true, force: true }),
    };
};
