import sharp from 'sharp';
import { normalizeProviderImage } from '../lib/provider-image-file.util';
import {
    brokenPng,
    makeCmykJpg,
    makeInterlacedPng,
    makeJpg,
    makePng,
    makePng16,
    makeProgressiveJpg,
    makeRotatedJpg,
} from './support/image-fixtures';

/** Что sharp видит в файле: формат, цветовое пространство, разрядность, каналы. */
const inspect = async (buffer: Buffer) => {
    const meta = await sharp(buffer).metadata();
    return {
        format: meta.format,
        space: meta.space,
        depth: meta.depth,
        channels: meta.channels,
        interlaced: meta.isProgressive,
        width: meta.width,
        height: meta.height,
    };
};

/** Перекодирование, которое обязано удаться. */
const normalize = async (buffer: Buffer, format: 'png' | 'jpg') => {
    const result = await normalizeProviderImage(buffer, format);
    if (!result) throw new Error('Картинка не перекодирована');
    return result;
};

describe('картинки поставщика: перекодирование в простой вид', () => {
    describe('исходники нормализации действительно нестандартные', () => {
        it('чересстрочный PNG, 16-битный PNG и CMYK JPEG читаются sharp как нестандартные', async () => {
            expect(await inspect(await makeInterlacedPng())).toMatchObject({
                format: 'png',
                interlaced: true,
            });
            expect(await inspect(await makePng16())).toMatchObject({
                format: 'png',
                depth: 'ushort',
            });
            expect(await inspect(await makeCmykJpg())).toMatchObject({
                format: 'jpeg',
                space: 'cmyk',
                channels: 4,
            });
        });
    });

    describe('PNG: 8 бит на канал, RGBA, без чересстрочности', () => {
        const expected = {
            format: 'png',
            space: 'srgb',
            depth: 'uchar',
            channels: 4,
            interlaced: false,
        };

        it('чересстрочный PNG становится обычным', async () => {
            const result = await normalize(
                await makeInterlacedPng(60, 30),
                'png',
            );
            expect(await inspect(result.data)).toMatchObject({
                ...expected,
                width: 60,
                height: 30,
            });
            expect(result).toMatchObject({ width: 60, height: 30 });
        });

        it('16-битный PNG становится 8-битным sRGB', async () => {
            const result = await normalize(await makePng16(), 'png');
            expect(await inspect(result.data)).toMatchObject(expected);
        });

        it('обычный PNG остаётся PNG того же размера в пикселях', async () => {
            const result = await normalize(await makePng(120, 80), 'png');
            expect(await inspect(result.data)).toMatchObject({
                ...expected,
                width: 120,
                height: 80,
            });
        });
    });

    describe('JPEG: sRGB, не прогрессивный', () => {
        const expected = {
            format: 'jpeg',
            space: 'srgb',
            depth: 'uchar',
            channels: 3,
            interlaced: false,
        };

        it('CMYK JPEG переводится в sRGB', async () => {
            const result = await normalize(await makeCmykJpg(50, 25), 'jpg');
            expect(await inspect(result.data)).toMatchObject({
                ...expected,
                width: 50,
                height: 25,
            });
        });

        it('прогрессивный JPEG становится обычным', async () => {
            const result = await normalize(await makeProgressiveJpg(), 'jpg');
            expect(await inspect(result.data)).toMatchObject(expected);
        });

        it('обычный JPEG остаётся JPEG', async () => {
            const result = await normalize(await makeJpg(), 'jpg');
            expect(await inspect(result.data)).toMatchObject(expected);
        });
    });

    describe('поворот из EXIF', () => {
        it('применяется к пикселям: ширина и высота результата — как покажет браузер', async () => {
            const source = await makeRotatedJpg(40, 20);
            expect((await sharp(source).metadata()).orientation).toBe(6);

            const result = await normalize(source, 'jpg');

            expect(result).toMatchObject({ width: 20, height: 40 });
            const after = await sharp(result.data).metadata();
            expect([after.width, after.height]).toEqual([20, 40]);
            // метаданные не сохраняются: второго поворота при показе не будет
            expect(after.orientation).toBeUndefined();
        });
    });

    it('файл, который sharp не раскодирует, не перекодируется: null', async () => {
        expect(await normalizeProviderImage(brokenPng(), 'png')).toBeNull();
    });
});
