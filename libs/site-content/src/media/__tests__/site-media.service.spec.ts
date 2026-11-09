import {
    BadRequestException,
    NotFoundException,
    PayloadTooLargeException,
} from '@nestjs/common';
import { existsSync, readdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { SITE_MEDIA_MAX_BYTES } from '../domain/site-media.types';
import { SITE_MEDIA_MESSAGES, SiteMediaService } from '../site-media.service';
import {
    createTempStorage,
    fakeBmff,
    fakeHtml,
    fakeJpg,
    fakeMp4,
    fakePng,
    fakeWebp,
    type TempStorage,
} from './support/media-fixtures';

const SECTION = 'platform';

describe('SiteMediaService', () => {
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

    describe('загрузка картинки', () => {
        it('файл ложится в storage/public/site-media/<раздел> под именем с отпечатком', async () => {
            const item = await service.put(SECTION, 'calls-form', {
                file: { buffer: fakePng() },
            });
            expect(item.kind).toBe('image');
            expect(item.file).toMatch(/^calls-form\.[0-9a-f]{12}\.png$/);
            expect(
                existsSync(
                    join(temp.root, 'public', 'site-media', SECTION, item.file),
                ),
            ).toBe(true);
            await expect(service.list(SECTION)).resolves.toEqual([item]);
        });

        it('замена: новый файл на месте, прежний удалён', async () => {
            const first = await service.put(SECTION, 'calls-form', {
                file: { buffer: fakePng('a') },
            });
            const second = await service.put(SECTION, 'calls-form', {
                file: { buffer: fakeWebp('b') },
            });
            expect(second.file).not.toBe(first.file);
            expect(filesOnDisk()).toEqual([second.file]);
        });

        it('тот же файл ещё раз — то же имя, один файл', async () => {
            const first = await service.put(SECTION, 'calls-form', {
                file: { buffer: fakePng('a') },
            });
            await service.put(SECTION, 'calls-form', {
                file: { buffer: fakePng('a') },
            });
            expect(filesOnDisk()).toEqual([first.file]);
        });

        it('другие места раздела не трогаются', async () => {
            const kpi = await service.put(SECTION, 'kpi-all-tab', {
                file: { buffer: fakeJpg() },
            });
            const calls = await service.put(SECTION, 'calls-form', {
                file: { buffer: fakePng() },
            });
            expect(filesOnDisk()).toEqual([calls.file, kpi.file].sort());
        });
    });

    describe('видео и постер', () => {
        it('ролик с постером, затем замена ролика — постер остаётся', async () => {
            const first = await service.put(SECTION, 'hub-overview', {
                file: { buffer: fakeMp4('a') },
                poster: { buffer: fakeJpg('p') },
            });
            expect(first.kind).toBe('video');
            expect(first.poster).toMatch(
                /^hub-overview\.poster\.[0-9a-f]{12}\.jpg$/,
            );

            const second = await service.put(SECTION, 'hub-overview', {
                file: { buffer: fakeMp4('b') },
            });
            expect(second.poster).toBe(first.poster);
            expect(filesOnDisk()).toEqual(
                [second.file, first.poster as string].sort(),
            );
        });

        it('только постер — меняется постер, ролик тот же', async () => {
            const video = await service.put(SECTION, 'hub-overview', {
                file: { buffer: fakeMp4() },
                poster: { buffer: fakeJpg('p') },
            });
            const updated = await service.put(SECTION, 'hub-overview', {
                poster: { buffer: fakePng('q') },
            });
            expect(updated.file).toBe(video.file);
            expect(updated.poster).not.toBe(video.poster);
            expect(filesOnDisk()).toEqual(
                [video.file, updated.poster as string].sort(),
            );
        });

        it('ролик заменили картинкой — постер удаляется', async () => {
            await service.put(SECTION, 'hub-overview', {
                file: { buffer: fakeMp4() },
                poster: { buffer: fakeJpg() },
            });
            const image = await service.put(SECTION, 'hub-overview', {
                file: { buffer: fakePng() },
            });
            expect(image.poster).toBeUndefined();
            expect(filesOnDisk()).toEqual([image.file]);
        });

        it('постер без ролика, к картинке или видео вместо постера — 400 без записи', async () => {
            await expect(
                service.put(SECTION, 'hub-overview', {
                    poster: { buffer: fakeJpg() },
                }),
            ).rejects.toThrow(SITE_MEDIA_MESSAGES.posterWithoutVideo);

            await service.put(SECTION, 'calls-form', {
                file: { buffer: fakePng() },
            });
            await expect(
                service.put(SECTION, 'calls-form', {
                    poster: { buffer: fakeJpg() },
                }),
            ).rejects.toThrow(SITE_MEDIA_MESSAGES.posterWithoutVideo);
            await expect(
                service.put(SECTION, 'calls-form', {
                    file: { buffer: fakePng('x') },
                    poster: { buffer: fakeJpg() },
                }),
            ).rejects.toThrow(SITE_MEDIA_MESSAGES.posterForImage);
            await expect(
                service.put(SECTION, 'hub-overview', {
                    file: { buffer: fakeMp4() },
                    poster: { buffer: fakeMp4('z') },
                }),
            ).rejects.toThrow(SITE_MEDIA_MESSAGES.posterNotImage);
            expect(filesOnDisk()).toHaveLength(1);
        });
    });

    describe('проверка файла', () => {
        it('HTML, MOV и HEIC — 400 с подсказкой про форматы', async () => {
            for (const buffer of [
                fakeHtml(),
                fakeBmff('qt  '),
                fakeBmff('heic'),
            ]) {
                const error = await service
                    .put(SECTION, 'calls-form', { file: { buffer } })
                    .catch((caught: unknown) => caught);
                expect(error).toBeInstanceOf(BadRequestException);
                expect((error as Error).message).toBe(
                    SITE_MEDIA_MESSAGES.unsupported,
                );
            }
            expect(filesOnDisk()).toEqual([]);
        });

        it('картинка больше 10 МБ — 413', async () => {
            await expect(
                service.put(SECTION, 'calls-form', {
                    file: {
                        buffer: fakePng('a', SITE_MEDIA_MAX_BYTES.image + 1),
                    },
                }),
            ).rejects.toThrow(PayloadTooLargeException);
        });

        it('ни кадра, ни постера — 400', async () => {
            await expect(
                service.put(SECTION, 'calls-form', {}),
            ).rejects.toThrow(SITE_MEDIA_MESSAGES.nothingUploaded);
        });

        it('раздел и место с точками, слэшами или заглавными — 400, на диск не идёт', async () => {
            for (const [section, slot] of [
                ['..', 'calls-form'],
                [SECTION, '../calls-form'],
                [SECTION, 'Calls-Form'],
                ['platform/x', 'calls-form'],
            ]) {
                await expect(
                    service.put(section, slot, { file: { buffer: fakePng() } }),
                ).rejects.toThrow(SITE_MEDIA_MESSAGES.badKey);
            }
            await expect(service.list('../x')).rejects.toThrow(
                BadRequestException,
            );
        });
    });

    describe('удаление', () => {
        it('кадр с постером удаляется целиком; пустое место — 404', async () => {
            await service.put(SECTION, 'hub-overview', {
                file: { buffer: fakeMp4() },
                poster: { buffer: fakeJpg() },
            });
            await service.remove(SECTION, 'hub-overview');
            expect(filesOnDisk()).toEqual([]);
            await expect(
                service.remove(SECTION, 'hub-overview'),
            ).rejects.toThrow(NotFoundException);
        });

        it('снять постер: ролик остаётся; без постера — 404', async () => {
            const video = await service.put(SECTION, 'hub-overview', {
                file: { buffer: fakeMp4() },
                poster: { buffer: fakeJpg() },
            });
            const item = await service.removePoster(SECTION, 'hub-overview');
            expect(item.poster).toBeUndefined();
            expect(filesOnDisk()).toEqual([video.file]);
            await expect(
                service.removePoster(SECTION, 'hub-overview'),
            ).rejects.toThrow(SITE_MEDIA_MESSAGES.posterMissing);
            await expect(
                service.removePoster(SECTION, 'calls-form'),
            ).rejects.toThrow(SITE_MEDIA_MESSAGES.slotEmpty);
        });
    });

    it('параллельные загрузки в одно место идут по очереди — остаётся ровно один кадр', async () => {
        const results = await Promise.all(
            ['a', 'b', 'c', 'd'].map(seed =>
                service.put(SECTION, 'calls-form', {
                    file: { buffer: fakePng(seed) },
                }),
            ),
        );
        expect(filesOnDisk()).toEqual([results[results.length - 1].file]);
    });

    it('недописанный временный файл в каталоге не попадает в список', async () => {
        const item = await service.put(SECTION, 'calls-form', {
            file: { buffer: fakePng() },
        });
        writeFileSync(
            join(temp.storage.sectionDir(SECTION), '.upload-unfinished'),
            'x',
        );
        await expect(service.list(SECTION)).resolves.toEqual([item]);
    });

    describe('resolveFile', () => {
        it('файл раздела: каталог, имя и тип по расширению', async () => {
            const item = await service.put(SECTION, 'hub-overview', {
                file: { buffer: fakeMp4() },
            });
            await expect(
                service.resolveFile(SECTION, item.file),
            ).resolves.toEqual({
                root: temp.storage.sectionDir(SECTION),
                name: item.file,
                mime: 'video/mp4',
            });
        });

        it('чужое имя, опасный раздел или удалённый файл — null', async () => {
            writeFileSync(join(temp.root, 'secret.png'), 'x');
            await expect(
                service.resolveFile(SECTION, '../../secret.png'),
            ).resolves.toBeNull();
            await expect(
                service.resolveFile('..', 'calls-form.0123456789ab.png'),
            ).resolves.toBeNull();
            await expect(
                service.resolveFile(SECTION, 'calls-form.0123456789ab.png'),
            ).resolves.toBeNull();
        });
    });
});
