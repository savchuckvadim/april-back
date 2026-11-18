import { BadRequestException } from '@nestjs/common';
import { existsSync, readdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { SiteMediaService } from '../site-media.service';
import {
    createTempStorage,
    fakeJpg,
    fakeMp4,
    fakePng,
    type TempStorage,
} from './support/media-fixtures';

const SECTION = 'library';
const SLOT = '3f2b8c1e-5d4a-4f6b-9a7c-1e2d3c4b5a69';

/**
 * Запись без уборки (для медиатеки): новые файлы рядом с прежними, что
 * убрать — решает вызывающий. Обычный put (кадры /platform) не меняется —
 * его покрывает site-media.service.spec.ts.
 */
describe('SiteMediaService: stage и discard', () => {
    let temp: TempStorage;
    let service: SiteMediaService;

    const filesOnDisk = (): string[] => {
        const dir = temp.storage.sectionDir(SECTION);
        return existsSync(dir) ? readdirSync(dir).sort() : [];
    };

    beforeEach(() => {
        temp = createTempStorage();
        service = new SiteMediaService(temp.storage);
    });

    afterEach(() => temp.cleanup());

    it('новый кадр ложится рядом с прежним; прежний — в outdated', async () => {
        const first = await service.put(SECTION, SLOT, {
            file: { buffer: fakePng('a') },
        });
        const staged = await service.stage(SECTION, SLOT, {
            file: { buffer: fakePng('b') },
        });
        expect(staged.file).toMatch(
            new RegExp(`^${SLOT}\\.[0-9a-f]{12}\\.png$`),
        );
        expect(staged.created).toEqual([staged.file]);
        expect(staged.outdated).toEqual([first.file]);
        expect(filesOnDisk()).toEqual([first.file, staged.file].sort());
    });

    it('тот же файл по содержимому — не «новый»: откат его не удалит', async () => {
        const first = await service.put(SECTION, SLOT, {
            file: { buffer: fakePng('a') },
        });
        const staged = await service.stage(SECTION, SLOT, {
            file: { buffer: fakePng('a') },
        });
        expect(staged).toMatchObject({
            file: first.file,
            created: [],
            outdated: [],
        });
    });

    it('постер к ролику: прежний постер в outdated, ролик не трогается', async () => {
        const video = await service.put(SECTION, SLOT, {
            file: { buffer: fakeMp4() },
            poster: { buffer: fakeJpg('a') },
        });
        const staged = await service.stage(SECTION, SLOT, {
            poster: { buffer: fakeJpg('b') },
        });
        expect(staged.file).toBeUndefined();
        expect(staged.outdated).toEqual([video.poster]);
        expect(filesOnDisk()).toHaveLength(3);
    });

    it('проверки те же, что у put: постер без ролика — 400, на диске пусто', async () => {
        await expect(
            service.stage(SECTION, SLOT, { poster: { buffer: fakeJpg() } }),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(filesOnDisk()).toEqual([]);
    });

    it('discard убирает только имена медиа: чужие файлы и ../ не трогаются', async () => {
        const item = await service.put(SECTION, SLOT, {
            file: { buffer: fakePng() },
        });
        writeFileSync(join(temp.storage.sectionDir(SECTION), 'notes.txt'), 'x');
        await service.discard(SECTION, [item.file, 'notes.txt', '../secret']);
        expect(filesOnDisk()).toEqual(['notes.txt']);
        await expect(service.discard('Bad Section', [])).rejects.toBeInstanceOf(
            BadRequestException,
        );
    });
});
