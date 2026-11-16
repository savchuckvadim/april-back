import { mkdir, mkdtemp, rm, writeFile } from 'fs/promises';
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
});

describe('картинки и логотипы стилей из storage', () => {
    let root: string;

    beforeEach(async () => {
        root = await mkdtemp(join(tmpdir(), 'offer-pdf-assets-'));
    });

    afterEach(async () => {
        await rm(root, { recursive: true, force: true });
    });

    it('найденное отдаёт с форматом, ненайденного ключа нет', async () => {
        await mkdir(join(root, OFFER_PDF_ASSETS_SUBPATH, 'facet'), {
            recursive: true,
        });
        await writeFile(
            join(root, OFFER_PDF_ASSETS_SUBPATH, 'facet', 'cover.jpg'),
            Buffer.from('jpg'),
        );
        await mkdir(join(root, 'logos'));
        await writeFile(join(root, 'logos', 'iscra_logo.svg'), LOGO_SVG);

        const assets = await new OfferPdfAssetStore(root).load({
            images: ['facet/cover.jpg', 'facet/sheet.png'],
            logos: ['iscra', 'garant'],
        });

        expect(Object.keys(assets.images)).toEqual(['facet/cover.jpg']);
        expect(assets.images['facet/cover.jpg']?.format).toBe('jpg');
        expect(Object.keys(assets.logos)).toEqual(['iscra']);
        expect(assets.logos.iscra?.paths).toHaveLength(2);
    });

    it('файл, занесённый позже, подхватывается без перезапуска', async () => {
        const store = new OfferPdfAssetStore(root);
        const before = await store.load({ images: ['halo/cover.png'] });
        expect(before.images).toEqual({});

        await mkdir(join(root, OFFER_PDF_ASSETS_SUBPATH, 'halo'), {
            recursive: true,
        });
        await writeFile(
            join(root, OFFER_PDF_ASSETS_SUBPATH, 'halo', 'cover.png'),
            Buffer.from('png'),
        );
        const after = await store.load({ images: ['halo/cover.png'] });
        expect(after.images['halo/cover.png']?.format).toBe('png');
    });
});
