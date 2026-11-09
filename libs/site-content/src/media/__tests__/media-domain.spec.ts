import {
    MEDIA_SIGNATURE_BYTES,
    sniffMediaFormat,
} from '../domain/media-format';
import {
    buildMediaFileName,
    mediaContentHash,
    parseMediaFileName,
} from '../domain/media-file-name';
import { collectSiteMedia } from '../domain/site-media-collect';
import type { SiteMediaStoredFile } from '../domain/site-media.types';
import {
    fakeBmff,
    fakeHtml,
    fakeJpg,
    fakeMp4,
    fakePng,
    fakeWebp,
} from './support/media-fixtures';

describe('sniffMediaFormat', () => {
    it('картинки и ролик узнаются по первым байтам', () => {
        expect(sniffMediaFormat(fakePng())).toBe('png');
        expect(sniffMediaFormat(fakeJpg())).toBe('jpg');
        expect(sniffMediaFormat(fakeWebp())).toBe('webp');
        expect(sniffMediaFormat(fakeMp4())).toBe('mp4');
        expect(sniffMediaFormat(fakeBmff('mp42'))).toBe('mp4');
    });

    it('HTML, MOV, фото iPhone и обрывок файла — не медиа сайта', () => {
        expect(sniffMediaFormat(fakeHtml())).toBeNull();
        expect(sniffMediaFormat(fakeBmff('qt  '))).toBeNull();
        expect(sniffMediaFormat(fakeBmff('heic'))).toBeNull();
        expect(sniffMediaFormat(fakeBmff('avif'))).toBeNull();
        expect(
            sniffMediaFormat(fakePng().subarray(0, MEDIA_SIGNATURE_BYTES - 1)),
        ).toBeNull();
    });
});

describe('имя файла медиа', () => {
    it('кадр и постер: собирается и разбирается обратно', () => {
        const hash = mediaContentHash(fakePng());
        const main = buildMediaFileName('calls-form', 'main', hash, 'png');
        const poster = buildMediaFileName(
            'hub-overview',
            'poster',
            hash,
            'jpg',
        );
        expect(main).toBe(`calls-form.${hash}.png`);
        expect(poster).toBe(`hub-overview.poster.${hash}.jpg`);
        expect(parseMediaFileName(main)).toEqual({
            slot: 'calls-form',
            role: 'main',
            hash,
            extension: 'png',
        });
        expect(parseMediaFileName(poster)?.role).toBe('poster');
    });

    it('отпечаток зависит от содержимого', () => {
        expect(mediaContentHash(fakePng('a'))).toHaveLength(12);
        expect(mediaContentHash(fakePng('a'))).not.toBe(
            mediaContentHash(fakePng('b')),
        );
    });

    it('опасные и чужие имена не разбираются', () => {
        for (const name of [
            '../calls-form.0123456789ab.png',
            'calls-form.0123456789ab.png/../x',
            'Calls-Form.0123456789ab.png',
            'calls-form.0123456789ab.PNG',
            'calls-form.0123456789ab.html',
            'calls-form.0123.png',
            '.upload-5f8a',
            'calls-form.png',
        ]) {
            expect(parseMediaFileName(name)).toBeNull();
        }
    });
});

describe('collectSiteMedia', () => {
    const at = (minute: number) => new Date(Date.UTC(2026, 10, 9, 12, minute));
    const stored = (
        name: string,
        minute = 0,
        size = 10,
    ): SiteMediaStoredFile => ({
        name,
        size,
        modifiedAt: at(minute),
    });

    it('места по алфавиту, постер — только у видео, чужие файлы пропускаются', () => {
        const items = collectSiteMedia([
            stored('kpi-all-tab.0123456789ab.webp'),
            stored('hub-overview.aaaaaaaaaaaa.mp4', 0, 900),
            stored('hub-overview.poster.bbbbbbbbbbbb.jpg'),
            stored('calls-form.cccccccccccc.png'),
            stored('calls-form.poster.dddddddddddd.jpg'),
            stored('.upload-123'),
            stored('readme.txt'),
        ]);
        expect(items.map(item => item.slot)).toEqual([
            'calls-form',
            'hub-overview',
            'kpi-all-tab',
        ]);
        expect(items[1]).toEqual({
            slot: 'hub-overview',
            kind: 'video',
            file: 'hub-overview.aaaaaaaaaaaa.mp4',
            size: 900,
            updatedAt: at(0),
            poster: 'hub-overview.poster.bbbbbbbbbbbb.jpg',
        });
        expect(items[0].poster).toBeUndefined();
    });

    it('два кадра на одном месте — берётся свежий', () => {
        const [item] = collectSiteMedia([
            stored('calls-form.111111111111.png', 5),
            stored('calls-form.222222222222.png', 7),
            stored('calls-form.333333333333.png', 6),
        ]);
        expect(item.file).toBe('calls-form.222222222222.png');
    });

    it('постер без ролика — места нет', () => {
        expect(
            collectSiteMedia([stored('hub-overview.poster.bbbbbbbbbbbb.jpg')]),
        ).toEqual([]);
    });
});
