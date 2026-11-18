import {
    BadRequestException,
    ConflictException,
    NotFoundException,
    PayloadTooLargeException,
} from '@nestjs/common';
import {
    fakeHtml,
    fakeMp4,
} from '../../media/__tests__/support/media-fixtures';
import { SITE_MEDIA_MAX_BYTES } from '../../media/domain/site-media.types';
import { SITE_MEDIA_LIBRARY_MESSAGES } from '../domain/site-media-library.messages';
import {
    createLibraryHarness,
    realImage,
    type LibraryHarness,
} from './support/library-fixtures';

const YT = 'https://youtu.be/dQw4w9WgXcQ';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe('SiteMediaLibraryService', () => {
    let h: LibraryHarness;
    let png: Buffer;

    beforeAll(async () => {
        png = await realImage(40, 30);
    });

    beforeEach(() => {
        h = createLibraryHarness();
    });

    afterEach(() => h.temp.cleanup());

    describe('загрузка', () => {
        it('картинка: файл на диске, строка с размерами от sharp и подписями', async () => {
            const record = await h.library.upload(
                {
                    file: { buffer: png },
                    title: '  Пульс  ',
                    caption: '',
                    alt: 'Таблица звонков',
                    width: 999,
                },
                'admin',
            );
            expect(record.id).toMatch(UUID);
            expect(record).toMatchObject({
                kind: 'image',
                title: 'Пульс',
                caption: null,
                alt: 'Таблица звонков',
                mime: 'image/png',
                sizeBytes: png.length,
                width: 40,
                height: 30,
                durationSec: null,
                uploadedBy: 'admin',
                embedProvider: null,
            });
            expect(record.fileName).toMatch(
                new RegExp(`^${record.id}\\.[0-9a-f]{12}\\.png$`),
            );
            expect(h.filesOnDisk()).toEqual([record.fileName]);
        });

        it('ролик с постером, размерами из админки и запасной ссылкой', async () => {
            const poster = await realImage(16, 9, 'jpeg');
            const record = await h.library.upload(
                {
                    file: { buffer: fakeMp4() },
                    poster: { buffer: poster },
                    width: 1920,
                    height: 1080,
                    durationSec: 95,
                    embedUrl: ` ${YT} `,
                },
                null,
            );
            expect(record).toMatchObject({
                kind: 'video',
                mime: 'video/mp4',
                width: 1920,
                height: 1080,
                durationSec: 95,
                embedProvider: 'youtube',
                embedId: 'dQw4w9WgXcQ',
                embedUrl: YT,
            });
            expect(record.posterFileName).toMatch(
                /\.poster\.[0-9a-f]{12}\.jpg$/,
            );
            expect(h.filesOnDisk()).toHaveLength(2);
        });

        it('картинка с тёмным вариантом — место <id>-dark', async () => {
            const dark = await realImage(40, 30, 'webp', '#111111');
            const record = await h.library.upload(
                { file: { buffer: png }, dark: { buffer: dark } },
                null,
            );
            expect(record.darkFileName).toMatch(
                new RegExp(`^${record.id}-dark\\.[0-9a-f]{12}\\.webp$`),
            );
            expect(h.filesOnDisk()).toHaveLength(2);
        });

        it('вставка строки сорвалась — файлы удалены, ошибка наружу', async () => {
            const poster = await realImage(16, 9, 'jpeg');
            h.repository.failNextCreate = new Error('база недоступна');
            await expect(
                h.library.upload(
                    { file: { buffer: fakeMp4() }, poster: { buffer: poster } },
                    null,
                ),
            ).rejects.toThrow('база недоступна');
            expect(h.filesOnDisk()).toEqual([]);
            expect(h.repository.rows.size).toBe(0);
        });

        it('сорвалась запись тёмного варианта — основной файл тоже убран', async () => {
            jest.spyOn(h.disk, 'putDark').mockRejectedValueOnce(
                new Error('диск полон'),
            );
            await expect(
                h.library.upload(
                    { file: { buffer: png }, dark: { buffer: png } },
                    null,
                ),
            ).rejects.toThrow('диск полон');
            expect(h.filesOnDisk()).toEqual([]);
        });

        it.each([
            ['без файла', {}, SITE_MEDIA_LIBRARY_MESSAGES.fileRequired],
            ['HTML вместо картинки', { file: { buffer: fakeHtml() } }, null],
            [
                'постер к картинке',
                { file: 'png', poster: 'png' },
                SITE_MEDIA_LIBRARY_MESSAGES.posterOnlyForVideo,
            ],
            [
                'тёмный вариант к ролику',
                { file: 'mp4', dark: 'png' },
                SITE_MEDIA_LIBRARY_MESSAGES.darkOnlyForImage,
            ],
            [
                'ссылка у картинки',
                { file: 'png', embedUrl: YT },
                SITE_MEDIA_LIBRARY_MESSAGES.embedOnlyForVideo,
            ],
            [
                'нераспознанная ссылка у ролика',
                { file: 'mp4', embedUrl: 'https://example.com/v.mp4' },
                SITE_MEDIA_LIBRARY_MESSAGES.embedUnknown,
            ],
            [
                'тёмный вариант — ролик',
                { file: 'png', dark: 'mp4' },
                SITE_MEDIA_LIBRARY_MESSAGES.darkNotImage,
            ],
        ])('%s — 400, на диске пусто', async (_name, parts, message) => {
            const buffers: Record<string, Buffer> = { png, mp4: fakeMp4() };
            const pick = (part: unknown) =>
                typeof part === 'string'
                    ? { buffer: buffers[part] }
                    : (part as { buffer: Buffer } | undefined);
            const input = parts as Record<string, unknown>;
            const call = h.library.upload(
                {
                    file: pick(input.file),
                    poster: pick(input.poster),
                    dark: pick(input.dark),
                    embedUrl: input.embedUrl as string | undefined,
                },
                null,
            );
            await expect(call).rejects.toBeInstanceOf(BadRequestException);
            if (message) await expect(call).rejects.toThrow(message);
            expect(h.filesOnDisk()).toEqual([]);
            expect(h.repository.rows.size).toBe(0);
        });

        it('битая картинка (подпись PNG, внутри мусор) — 400', async () => {
            const broken = Buffer.concat([
                png.subarray(0, 16),
                Buffer.alloc(64),
            ]);
            await expect(
                h.library.upload({ file: { buffer: broken } }, null),
            ).rejects.toThrow(SITE_MEDIA_LIBRARY_MESSAGES.imageUnreadable);
            expect(h.filesOnDisk()).toEqual([]);
        });

        it('ролик больше 80 МБ — 413, на диске пусто', async () => {
            const huge = fakeMp4('x', SITE_MEDIA_MAX_BYTES.video + 1);
            await expect(
                h.library.upload({ file: { buffer: huge } }, null),
            ).rejects.toBeInstanceOf(PayloadTooLargeException);
            expect(h.filesOnDisk()).toEqual([]);
        });
    });

    describe('внешнее видео', () => {
        it('строка без файла: поставщик и id из ссылки', async () => {
            const record = await h.library.createEmbed(
                { url: 'https://vkvideo.ru/video-1_2', caption: 'Обзор' },
                'admin',
            );
            expect(record).toMatchObject({
                kind: 'embed',
                fileName: null,
                embedProvider: 'vk',
                embedId: '-1_2',
                caption: 'Обзор',
            });
        });

        it('нераспознанная ссылка — 400 и строки нет', async () => {
            await expect(
                h.library.createEmbed({ url: '<iframe src=x>' }, null),
            ).rejects.toThrow(SITE_MEDIA_LIBRARY_MESSAGES.embedUnknown);
            expect(h.repository.rows.size).toBe(0);
        });
    });

    describe('правка', () => {
        it('подписи: не переданное не трогается, пустое — снимается', async () => {
            const { id } = await h.library.upload(
                { file: { buffer: png }, title: 'T', caption: 'C', alt: 'A' },
                null,
            );
            const edited = await h.library.edit(id, {
                caption: '  ',
                alt: 'B',
            });
            expect(edited).toMatchObject({
                title: 'T',
                caption: null,
                alt: 'B',
            });
        });

        it('у ролика можно поставить и снять запасную ссылку', async () => {
            const { id } = await h.library.upload(
                { file: { buffer: fakeMp4() } },
                null,
            );
            const withLink = await h.library.edit(id, { embedUrl: YT });
            expect(withLink.embedProvider).toBe('youtube');
            const without = await h.library.edit(id, { embedUrl: null });
            expect(without).toMatchObject({
                embedProvider: null,
                embedId: null,
                embedUrl: null,
            });
        });

        it.each([
            ['ссылка у картинки', 'png', { embedUrl: YT }, 'embedOnlyForVideo'],
            ['размеры у картинки', 'png', { width: 10 }, 'videoMetaForImage'],
            [
                'снять ссылку у внешнего видео',
                'embed',
                { embedUrl: '' },
                'embedRequired',
            ],
            [
                'кривая ссылка',
                'embed',
                { embedUrl: 'https://x.ru' },
                'embedUnknown',
            ],
        ] as const)('%s — 400', async (_name, kind, input, key) => {
            const record =
                kind === 'embed'
                    ? await h.library.createEmbed({ url: YT }, null)
                    : await h.library.upload({ file: { buffer: png } }, null);
            await expect(h.library.edit(record.id, input)).rejects.toThrow(
                SITE_MEDIA_LIBRARY_MESSAGES[key],
            );
        });

        it('нет медиа — 404', async () => {
            await expect(
                h.library.edit('00000000-0000-4000-8000-000000000000', {}),
            ).rejects.toBeInstanceOf(NotFoundException);
        });
    });

    describe('удаление', () => {
        it('неиспользуемое: строка и все файлы', async () => {
            const dark = await realImage(40, 30, 'jpeg');
            const { id } = await h.library.upload(
                { file: { buffer: png }, dark: { buffer: dark } },
                null,
            );
            await h.library.remove(id);
            expect(h.repository.rows.has(id)).toBe(false);
            expect(h.filesOnDisk()).toEqual([]);
        });

        it('стоит в статьях — 409 со списком статей, ничего не удалено', async () => {
            const { id, fileName } = await h.library.upload(
                { file: { buffer: png } },
                null,
            );
            h.repository.usages.set(id, [
                {
                    articleId: 'a1',
                    section: 'ai',
                    slug: 'theory/call-analysis',
                    title: 'Разбор звонка',
                    role: 'inline',
                    slot: 'scr-call',
                },
                {
                    articleId: 'a2',
                    section: 'articles',
                    slug: 'news/kpi',
                    title: null,
                    role: 'cover',
                    slot: 'cover',
                },
            ]);
            const call = h.library.remove(id);
            await expect(call).rejects.toBeInstanceOf(ConflictException);
            await expect(call).rejects.toThrow(
                'стоит в статьях: «Разбор звонка» (ai/theory/call-analysis), articles/news/kpi',
            );
            expect(h.repository.rows.has(id)).toBe(true);
            expect(h.filesOnDisk()).toEqual([fileName]);
        });

        it('внешнее видео удаляется без файлов', async () => {
            const { id } = await h.library.createEmbed({ url: YT }, null);
            await h.library.remove(id);
            expect(h.repository.rows.size).toBe(0);
        });
    });

    describe('список', () => {
        it('страница не больше потолка, номер страницы не меньше 1', async () => {
            const page = await h.library.list({ page: 0, pageSize: 10_000 });
            expect(page).toMatchObject({ page: 1, pageSize: 200, total: 0 });
        });

        it('фильтр «не используется» и поиск', async () => {
            const used = await h.library.upload(
                { file: { buffer: png }, title: 'Пульс отдела' },
                null,
            );
            await h.library.createEmbed({ url: YT, title: 'Обзор' }, null);
            h.repository.usages.set(used.id, [
                {
                    articleId: 'a1',
                    section: 'ai',
                    slug: 'index',
                    title: null,
                    role: 'cover',
                    slot: 'cover',
                },
            ]);
            const unused = await h.library.list({ unused: true });
            expect(unused.items.map(item => item.kind)).toEqual(['embed']);
            const found = await h.library.list({ search: 'пульс' });
            expect(found.items.map(item => item.id)).toEqual([used.id]);
            expect(found.items[0].usageCount).toBe(1);
        });
    });
});
