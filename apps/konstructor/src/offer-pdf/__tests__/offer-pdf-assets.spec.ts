import { Logger } from '@nestjs/common';
import { mkdir, mkdtemp, rm, utimes, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import {
    OFFER_PDF_ASSETS_SUBPATH,
    OfferPdfAssetStore,
} from '../lib/offer-pdf-asset-store';
import { parseSvgLogo } from '../lib/svg-logo.util';

const LOGO_SVG =
    '<svg width="104" height="35" xmlns="http://www.w3.org/2000/svg">' +
    '<g transform="translate(-632 -157)"><g>' +
    '<path d="M1 2 3 4Z" stroke="#A02B93" fill="#A02B93" transform="matrix(1 0 0 1.01 632 157)"/>' +
    '<path d="M5 6 7 8Z" fill="#A02B93"/>' +
    '</g></g></svg>';

describe('логотип из SVG', () => {
    it('размеры, transform группы и пути с их transform; цвет файла не берётся', () => {
        expect(parseSvgLogo(LOGO_SVG)).toEqual({
            width: 104,
            height: 35,
            groupTransform: 'translate(-632 -157)',
            paths: [
                { d: 'M1 2 3 4Z', transform: 'matrix(1 0 0 1.01 632 157)' },
                { d: 'M5 6 7 8Z' },
            ],
        });
    });

    it('SVG без путей или размеров — не логотип', () => {
        expect(parseSvgLogo('<svg width="1" height="1"></svg>')).toBeNull();
        expect(parseSvgLogo('<svg><path d="M0 0Z"/></svg>')).toBeNull();
    });

    it('viewBox важнее width/height: экспорт из Figma не уезжает в масштабе', () => {
        const logo = parseSvgLogo(
            '<svg width="208" height="70" viewBox="10 20 104 35"><path d="M0 0Z"/></svg>',
        );
        expect(logo).toMatchObject({
            width: 104,
            height: 35,
            minX: 10,
            minY: 20,
        });
    });

    it('stroke-width не принимается за ширину', () => {
        const logo = parseSvgLogo(
            '<svg stroke-width="3" width="104" height="35"><path d="M0 0Z"/></svg>',
        );
        expect(logo).toMatchObject({ width: 104, height: 35 });
        expect(
            parseSvgLogo(
                '<svg stroke-width="3" height="35"><path d="M0 0Z"/></svg>',
            ),
        ).toBeNull();
    });
});

describe('картинки и логотипы стилей из storage', () => {
    let root: string;

    const putImage = async (name: string, content: string): Promise<string> => {
        const file = join(root, OFFER_PDF_ASSETS_SUBPATH, name);
        await mkdir(join(file, '..'), { recursive: true });
        await writeFile(file, Buffer.from(content));
        return file;
    };

    beforeEach(async () => {
        root = await mkdtemp(join(tmpdir(), 'offer-pdf-assets-'));
    });

    afterEach(async () => {
        jest.restoreAllMocks();
        await rm(root, { recursive: true, force: true });
    });

    it('найденное отдаёт с форматом, ненайденное — списком недостающего', async () => {
        await putImage('facet/cover.jpg', 'jpg');
        await mkdir(join(root, 'logos'));
        await writeFile(join(root, 'logos', 'iscra_logo.svg'), LOGO_SVG);

        const { assets, missing } = await new OfferPdfAssetStore(root).load({
            images: ['facet/cover.jpg', 'facet/sheet.png'],
            logos: ['iscra', 'garant'],
        });

        expect(Object.keys(assets.images)).toEqual(['facet/cover.jpg']);
        expect(assets.images['facet/cover.jpg']?.format).toBe('jpg');
        expect(Object.keys(assets.logos)).toEqual(['iscra']);
        expect(assets.logos.iscra?.paths).toHaveLength(2);
        expect(missing).toEqual([
            'konstructor/offer-pdf/facet/sheet.png',
            'logos/garant_logo_pink.svg',
        ]);
    });

    it('файл, занесённый позже, подхватывается без перезапуска; подпись набора меняется', async () => {
        const store = new OfferPdfAssetStore(root);
        const before = await store.load({ images: ['halo/cover.png'] });
        expect(before.assets.images).toEqual({});
        expect(before.missing).toHaveLength(1);

        await putImage('halo/cover.png', 'png');
        const after = await store.load({ images: ['halo/cover.png'] });
        expect(after.assets.images['halo/cover.png']?.format).toBe('png');
        expect(after.missing).toEqual([]);
        expect(after.version).not.toBe(before.version);
    });

    it('заменённый файл перечитывается, нетронутый — берётся из памяти', async () => {
        const store = new OfferPdfAssetStore(root);
        const file = await putImage('silk/cover.jpg', 'первый');
        const first = await store.load({ images: ['silk/cover.jpg'] });
        const again = await store.load({ images: ['silk/cover.jpg'] });
        // тот же буфер — значит с диска второй раз не читали
        expect(again.assets.images['silk/cover.jpg']?.data).toBe(
            first.assets.images['silk/cover.jpg']?.data,
        );
        expect(again.version).toBe(first.version);

        await writeFile(file, Buffer.from('второй, длиннее'));
        // время правки — явно: на быстрой машине оно могло бы совпасть
        await utimes(file, new Date(), new Date(Date.now() + 5_000));
        const replaced = await store.load({ images: ['silk/cover.jpg'] });
        expect(replaced.assets.images['silk/cover.jpg']?.data.toString()).toBe(
            'второй, длиннее',
        );
        expect(replaced.version).not.toBe(first.version);
    });

    it('о недостающем файле и о неразобранном логотипе пишет в лог один раз', async () => {
        const warn = jest
            .spyOn(Logger.prototype, 'warn')
            .mockImplementation(() => undefined);
        await mkdir(join(root, 'logos'));
        await writeFile(join(root, 'logos', 'iscra_logo.svg'), '<svg></svg>');
        const store = new OfferPdfAssetStore(root);
        const request = {
            images: ['pearl/cover.jpg'],
            logos: ['iscra' as const],
        };

        const first = await store.load(request);
        await store.load(request);
        await store.load(request);

        expect(first.missing).toEqual([
            'konstructor/offer-pdf/pearl/cover.jpg',
            'logos/iscra_logo.svg',
        ]);
        expect(warn).toHaveBeenCalledTimes(2);
    });
});
