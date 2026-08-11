import { randomFillSync } from 'crypto';
import PizZip from 'pizzip';
import sharp from 'sharp';
import { DocxMediaConfig } from '../config/docx-media.config';
import { DocxImageResizer } from '../services/docx-image-resizer.service';
import { DocxMediaOptimizerService } from '../services/docx-media-optimizer.service';

const CONTENT_TYPES = `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="jpeg" ContentType="image/jpeg"/><Default Extension="png" ContentType="image/png"/></Types>`;
const DOCUMENT_XML = `<?xml version="1.0"?><w:document><w:body><w:p/></w:body></w:document>`;
const RELS_XML = `<?xml version="1.0"?><Relationships><Relationship Id="rId1" Target="media/image1.jpeg"/><Relationship Id="rId2" Target="media/image2.png"/></Relationships>`;

function config(overrides: Partial<DocxMediaConfig> = {}): DocxMediaConfig {
    return {
        maxDimensionPx: 400,
        jpegQuality: 85,
        minBytesToProcess: 1024,
        ...overrides,
    };
}

function build(overrides: Partial<DocxMediaConfig> = {}): {
    optimizer: DocxMediaOptimizerService;
} {
    const cfg = config(overrides);
    return {
        optimizer: new DocxMediaOptimizerService(
            cfg,
            new DocxImageResizer(cfg),
        ),
    };
}

/** Шумная картинка: сжимается плохо, как реальное фото на всю страницу. */
async function noisyJpeg(width: number, height: number): Promise<Buffer> {
    const raw = Buffer.alloc(width * height * 3);
    randomFillSync(raw);
    return sharp(raw, { raw: { width, height, channels: 3 } })
        .jpeg({ quality: 95 })
        .toBuffer();
}

async function tinyPng(): Promise<Buffer> {
    return sharp({
        create: {
            width: 40,
            height: 40,
            channels: 3,
            background: { r: 10, g: 20, b: 30 },
        },
    })
        .png()
        .toBuffer();
}

async function buildDocx(): Promise<Buffer> {
    const zip = new PizZip();
    zip.file('[Content_Types].xml', CONTENT_TYPES);
    zip.file('word/document.xml', DOCUMENT_XML);
    zip.file('word/_rels/document.xml.rels', RELS_XML);
    zip.file('word/media/image1.jpeg', await noisyJpeg(1200, 1600));
    zip.file('word/media/image2.png', await tinyPng());
    zip.file('word/media/logo.emf', Buffer.from('это не растр, а вектор'));
    return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}

describe('DocxMediaOptimizerService', () => {
    let docx: Buffer;

    beforeAll(async () => {
        docx = await buildDocx();
    });

    it('уменьшает крупную картинку и облегчает файл', async () => {
        const result = await build().optimizer.optimize(docx);

        const image1 = result.items.find(item => item.name === 'image1.jpeg');
        expect(image1?.action).toBe('resized');
        expect(image1?.after).toEqual({ width: 300, height: 400 });
        expect(image1!.afterBytes).toBeLessThan(image1!.beforeBytes);
        expect(result.afterBytes).toBeLessThan(result.beforeBytes);
        expect(result.mediaAfterBytes).toBeLessThan(result.mediaBeforeBytes);
    });

    it('мелкие картинки не трогает', async () => {
        const result = await build().optimizer.optimize(docx);

        expect(
            result.items.find(item => item.name === 'image2.png')?.action,
        ).toBe('skipped-small');
    });

    it('вектор (EMF) пропускает — менять формат небезопасно', async () => {
        const result = await build({ minBytesToProcess: 0 }).optimizer.optimize(
            docx,
        );

        const emf = result.items.find(item => item.name === 'logo.emf');
        expect(emf?.action).toBe('skipped-format');
        expect(emf?.afterBytes).toBe(emf?.beforeBytes);
    });

    it('сохраняет структуру архива: имена и ссылки остаются валидными', async () => {
        const result = await build().optimizer.optimize(docx);
        const optimized = new PizZip(result.buffer as Buffer);

        expect(Object.keys(optimized.files).sort()).toEqual(
            Object.keys(new PizZip(docx).files).sort(),
        );
        expect(optimized.files['word/_rels/document.xml.rels'].asText()).toBe(
            RELS_XML,
        );
        expect(optimized.files['[Content_Types].xml'].asText()).toBe(
            CONTENT_TYPES,
        );
    });

    it('картинка остаётся в том же формате', async () => {
        const result = await build().optimizer.optimize(docx);
        const optimized = new PizZip(result.buffer as Buffer);
        const image = Buffer.from(
            optimized.files['word/media/image1.jpeg'].asUint8Array(),
        );

        await expect(sharp(image).metadata()).resolves.toMatchObject({
            format: 'jpeg',
        });
    });

    it('dryRun считает выигрыш, но файл не собирает', async () => {
        const result = await build().optimizer.optimize(docx, { dryRun: true });

        expect(result.buffer).toBeNull();
        expect(result.afterBytes).toBe(result.beforeBytes);
        expect(result.mediaAfterBytes).toBeLessThan(result.mediaBeforeBytes);
        expect(
            result.items.find(item => item.name === 'image1.jpeg')?.action,
        ).toBe('resized');
    });

    it('если ничего не изменилось — не пересобирает архив', async () => {
        const result = await build({
            maxDimensionPx: 10_000,
            minBytesToProcess: 10 * 1024 * 1024,
        }).optimizer.optimize(docx);

        expect(result.buffer).toBeNull();
        expect(
            result.items.every(item => item.action.startsWith('skipped')),
        ).toBe(true);
        expect(result.afterBytes).toBe(result.beforeBytes);
    });
});
