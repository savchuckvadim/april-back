import { BadRequestException, NotFoundException } from '@nestjs/common';
import { rmSync } from 'fs';
import { join } from 'path';
import { fakeMp4 } from '../../media/__tests__/support/media-fixtures';
import { SITE_MEDIA_LIBRARY_DIR } from '../domain/site-media-library.const';
import { SITE_MEDIA_LIBRARY_MESSAGES } from '../domain/site-media-library.messages';
import {
    createLibraryHarness,
    realImage,
    type LibraryHarness,
} from './support/library-fixtures';

describe('SiteMediaLibraryFilesService', () => {
    let h: LibraryHarness;
    let png: Buffer;
    let jpg: Buffer;

    beforeAll(async () => {
        png = await realImage(40, 30);
        jpg = await realImage(80, 60, 'jpeg', '#00aa55');
    });

    beforeEach(() => {
        h = createLibraryHarness();
    });

    afterEach(() => h.temp.cleanup());

    const uploadImage = () => h.library.upload({ file: { buffer: png } }, null);
    const uploadVideo = () =>
        h.library.upload(
            { file: { buffer: fakeMp4() }, width: 1280, height: 720 },
            null,
        );

    describe('замена файла', () => {
        it('картинка картинкой: новое имя, новые размеры, прежний файл убран', async () => {
            const before = await uploadImage();
            const after = await h.files.replaceFile(
                before.id,
                { buffer: jpg },
                {},
            );
            expect(after.fileName).not.toBe(before.fileName);
            expect(after).toMatchObject({
                mime: 'image/jpeg',
                width: 80,
                height: 60,
            });
            expect(h.filesOnDisk()).toEqual([after.fileName]);
        });

        it('ролик роликом: постер остаётся, размеры — из запроса или пусто', async () => {
            const poster = await realImage(16, 9, 'jpeg');
            const before = await h.library.upload(
                {
                    file: { buffer: fakeMp4('a') },
                    poster: { buffer: poster },
                    width: 1280,
                    height: 720,
                    durationSec: 10,
                },
                null,
            );
            const after = await h.files.replaceFile(
                before.id,
                { buffer: fakeMp4('b') },
                { durationSec: 20 },
            );
            expect(after).toMatchObject({
                posterFileName: before.posterFileName,
                width: null,
                height: null,
                durationSec: 20,
            });
            expect(h.filesOnDisk()).toHaveLength(2);
        });

        it.each([
            ['картинку роликом', 'image', 'kindChanged'],
            ['ролик картинкой', 'video', 'kindChanged'],
            ['у внешнего видео', 'embed', 'noFileForEmbed'],
        ] as const)('нельзя заменить %s — 400', async (_name, kind, key) => {
            const record =
                kind === 'embed'
                    ? await h.library.createEmbed(
                          { url: 'https://youtu.be/dQw4w9WgXcQ' },
                          null,
                      )
                    : kind === 'image'
                      ? await uploadImage()
                      : await uploadVideo();
            const next = kind === 'image' ? fakeMp4() : png;
            await expect(
                h.files.replaceFile(record.id, { buffer: next }, {}),
            ).rejects.toThrow(SITE_MEDIA_LIBRARY_MESSAGES[key]);
        });

        it('две замены подряд одного медиа: строка указывает на последний файл, лишних нет', async () => {
            const record = await uploadImage();
            const second = await realImage(10, 10, 'webp');
            const [, last] = await Promise.all([
                h.files.replaceFile(record.id, { buffer: jpg }, {}),
                h.files.replaceFile(record.id, { buffer: second }, {}),
            ]);
            expect(h.repository.rows.get(record.id)?.fileName).toBe(
                last.fileName,
            );
            expect(h.filesOnDisk()).toEqual([last.fileName]);
        });
    });

    describe('постер', () => {
        it('поставить и снять постер ролика', async () => {
            const { id } = await uploadVideo();
            const poster = await realImage(16, 9, 'jpeg');
            const withPoster = await h.files.setPoster(id, { buffer: poster });
            expect(withPoster.posterFileName).toMatch(/\.poster\./);
            const without = await h.files.removePoster(id);
            expect(without.posterFileName).toBeNull();
            expect(h.filesOnDisk()).toEqual([without.fileName]);
        });

        it('постер к картинке — 400; снять отсутствующий — 404', async () => {
            const image = await uploadImage();
            await expect(
                h.files.setPoster(image.id, { buffer: png }),
            ).rejects.toThrow(SITE_MEDIA_LIBRARY_MESSAGES.posterOnlyForVideo);
            const video = await uploadVideo();
            await expect(h.files.removePoster(video.id)).rejects.toBeInstanceOf(
                NotFoundException,
            );
        });

        it('файла постера на диске уже нет — строка всё равно приводится в порядок', async () => {
            const { id } = await uploadVideo();
            const withPoster = await h.files.setPoster(id, {
                buffer: await realImage(16, 9, 'jpeg'),
            });
            rmSync(
                join(
                    h.temp.storage.sectionDir(SITE_MEDIA_LIBRARY_DIR),
                    withPoster.posterFileName ?? '',
                ),
            );
            const fixed = await h.files.removePoster(id);
            expect(fixed.posterFileName).toBeNull();
        });
    });

    describe('тёмный вариант', () => {
        it('поставить, заменить и снять', async () => {
            const { id, fileName } = await uploadImage();
            const first = await h.files.setDark(id, { buffer: jpg });
            const second = await h.files.setDark(id, {
                buffer: await realImage(40, 30, 'webp', '#000000'),
            });
            expect(second.darkFileName).not.toBe(first.darkFileName);
            expect(h.filesOnDisk()).toEqual(
                [fileName, second.darkFileName].sort(),
            );
            const removed = await h.files.removeDark(id);
            expect(removed.darkFileName).toBeNull();
            expect(h.filesOnDisk()).toEqual([fileName]);
        });

        it('к ролику — 400; ролик вместо картинки — 400; снять отсутствующий — 404', async () => {
            const video = await uploadVideo();
            await expect(
                h.files.setDark(video.id, { buffer: png }),
            ).rejects.toThrow(SITE_MEDIA_LIBRARY_MESSAGES.darkOnlyForImage);
            const image = await uploadImage();
            await expect(
                h.files.setDark(image.id, { buffer: fakeMp4() }),
            ).rejects.toBeInstanceOf(BadRequestException);
            await expect(h.files.removeDark(image.id)).rejects.toThrow(
                SITE_MEDIA_LIBRARY_MESSAGES.darkMissing,
            );
        });
    });

    it('нет медиа — 404', async () => {
        await expect(
            h.files.setPoster('00000000-0000-4000-8000-000000000000', {
                buffer: png,
            }),
        ).rejects.toBeInstanceOf(NotFoundException);
    });
});
