import sharp from 'sharp';
import { createAuditProviderImages } from '../dev/layout-audit.images';
import { AUDIT_SCENARIOS } from '../dev/layout-audit.scenarios';

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47];

describe('сценарии аудита раскладки PDF-КП', () => {
    const names = AUDIT_SCENARIOS.map(scenario => scenario.name);

    it('имена сценариев не повторяются', () => {
        expect(new Set(names).size).toBe(names.length);
    });

    it('сценарий с латиницей после кириллицы остаётся последним в списке', () => {
        expect(names[names.length - 1]).toBe('29-latin-title-after-cyrillic');
    });

    it('сценарий 37 — печать и подпись поставщика — есть один раз и идёт до сценария с латиницей', () => {
        const stamps = names.filter(name => name.startsWith('37-'));
        expect(stamps).toEqual(['37-provider-images-stamps']);
        expect(names.indexOf('37-provider-images-stamps')).toBeLessThan(
            names.indexOf('29-latin-title-after-cyrillic'),
        );
        const scenario = AUDIT_SCENARIOS.find(item =>
            item.name.startsWith('37-'),
        );
        expect(scenario?.images).toBeDefined();
        expect(scenario?.settings.withStamps).toBeUndefined();
    });
});

describe('картинки поставщика для аудита', () => {
    it('печать и подпись — PNG, логотип — JPEG; все читаются как картинки нужного размера', async () => {
        const images = await createAuditProviderImages();

        expect(images.stamp?.format).toBe('png');
        expect(images.signature?.format).toBe('png');
        expect(images.logo?.format).toBe('jpg');
        expect([...(images.stamp?.data.subarray(0, 4) ?? [])]).toEqual(
            PNG_SIGNATURE,
        );
        expect(images.logo?.data[0]).toBe(0xff);
        expect(images.logo?.data[1]).toBe(0xd8);

        const sizes = await Promise.all(
            [images.stamp, images.signature, images.logo].map(async image => {
                const meta = await sharp(image?.data).metadata();
                return [meta.width, meta.height];
            }),
        );
        expect(sizes).toEqual([
            [276, 276],
            [240, 120],
            [320, 100],
        ]);
    });
});
