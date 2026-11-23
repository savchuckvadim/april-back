import {
    cleanUploadName,
    PROVIDER_IMAGE_MAX_BYTES,
    readProviderImageSize,
    sniffProviderImageFormat,
} from '../lib/provider-image-file.util';
import {
    brokenPng,
    fakeHtml,
    makeGif,
    makeJpg,
    makePng,
} from './support/image-fixtures';

describe('картинки поставщика: формат по содержимому', () => {
    it('PNG и JPEG узнаются по первым байтам', async () => {
        expect(sniffProviderImageFormat(await makePng())).toBe('png');
        expect(sniffProviderImageFormat(await makeJpg())).toBe('jpg');
    });

    it('GIF, HTML и пустой файл не подходят', async () => {
        expect(sniffProviderImageFormat(await makeGif())).toBeNull();
        expect(sniffProviderImageFormat(fakeHtml())).toBeNull();
        expect(sniffProviderImageFormat(Buffer.alloc(0))).toBeNull();
        expect(sniffProviderImageFormat(Buffer.from([0xff, 0xd8]))).toBeNull();
    });

    it('потолок размера файла — 2 МБ', () => {
        expect(PROVIDER_IMAGE_MAX_BYTES).toBe(2 * 1024 * 1024);
    });
});

describe('картинки поставщика: размеры', () => {
    it('ширина и высота настоящей картинки', async () => {
        expect(await readProviderImageSize(await makePng(120, 80))).toEqual({
            width: 120,
            height: 80,
        });
        expect(await readProviderImageSize(await makeJpg(30, 60))).toEqual({
            width: 30,
            height: 60,
        });
    });

    it('файл с сигнатурой PNG, но без картинки, не читается', async () => {
        expect(await readProviderImageSize(brokenPng())).toBeNull();
    });
});

describe('картинки поставщика: имя загруженного файла', () => {
    it('кириллица, пришедшая от multer в latin1, восстанавливается', () => {
        const mojibake = Buffer.from('Печать ООО.png', 'utf8').toString(
            'latin1',
        );
        expect(cleanUploadName(mojibake)).toBe('Печать ООО.png');
    });

    it('имя, уже читаемое как юникод, остаётся как есть', () => {
        expect(cleanUploadName('Печать.png')).toBe('Печать.png');
        expect(cleanUploadName('stamp.png')).toBe('stamp.png');
    });

    it('каталоги из имени убираются, пустое имя — null', () => {
        expect(cleanUploadName('C:\\scan\\stamp.png')).toBe('stamp.png');
        expect(cleanUploadName('../../etc/stamp.png')).toBe('stamp.png');
        expect(cleanUploadName('   ')).toBeNull();
        expect(cleanUploadName(undefined)).toBeNull();
    });

    it('длинное имя обрезается до 255 знаков', () => {
        expect(cleanUploadName(`${'a'.repeat(400)}.png`)).toHaveLength(255);
    });
});
