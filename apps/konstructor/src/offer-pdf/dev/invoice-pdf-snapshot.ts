/**
 * Настоящий рендер PDF-счёта на фикстуре — без БД и без сервера.
 * Пишет PDF по вариантам (печати, QR, скидка, налог, ИП, длинная таблица),
 * печатает страницы, размер, время и проверку раскладки.
 *
 *   npm run invoice-pdf:snapshot -- --out tmp/invoice-pdf
 *
 * Под jest @react-pdf/renderer (ESM-only) не грузится, поэтому реальный
 * рендер проверяется этим скриптом, а логика шаблона — юнит-тестами.
 * Лежит в src: каталог /scripts в .gitignore. В бандл не попадает:
 * webpack собирает только от main.ts.
 */
import { mkdirSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { PDFDocument } from 'pdf-lib';
import sharp from 'sharp';
import type { IProductRenderItemData } from '@app/konstructor/offer-word/services/render-data-services/offer-render-price.service';
import type {
    InvoicePdfImages,
    InvoicePdfModel,
} from '../invoice/model/invoice-pdf.model';
import { InvoicePdfRenderService } from '../invoice/services/invoice-pdf-render.service';
import {
    createInvoiceDataFixture,
    createInvoicePdfModelFixture,
} from '../__tests__/fixtures/invoice-pdf-model.fixture';
import { createOfferRenderDataFixture } from '../__tests__/fixtures/offer-pdf-model.fixture';
import type { OfferPdfImage } from '../model/offer-pdf-document.model';
import { auditLayout, formatAudit } from './layout-audit';

const STAMP_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="276" height="276" viewBox="0 0 276 276">
  <circle cx="138" cy="138" r="130" fill="none" stroke="#1d4ed8" stroke-width="8"/>
  <circle cx="138" cy="138" r="104" fill="none" stroke="#1d4ed8" stroke-width="3"/>
  <path d="M138 70 L152 112 L196 112 L160 138 L174 180 L138 154 L102 180 L116 138 L80 112 L124 112 Z" fill="#1d4ed8"/>
</svg>`;

const SIGNATURE_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="240" height="120" viewBox="0 0 240 120">
  <path d="M10 90 C40 10 60 10 70 70 S100 110 120 50 S160 20 170 80 S200 100 230 40" fill="none" stroke="#111827" stroke-width="5" stroke-linecap="round"/>
</svg>`;

/** Псевдо-QR: сетка чёрных и белых клеток с тремя угловыми метками, как у настоящего. */
const qrSvg = (): string => {
    const cells = 25;
    const size = 10;
    let rects = '';
    let seed = 7;
    for (let row = 0; row < cells; row += 1) {
        for (let col = 0; col < cells; col += 1) {
            seed = (seed * 1103515245 + 12345) % 2147483648;
            if (seed % 3 === 0) {
                rects += `<rect x="${col * size}" y="${row * size}" width="${size}" height="${size}"/>`;
            }
        }
    }
    const finder = (x: number, y: number): string =>
        `<rect x="${x}" y="${y}" width="70" height="70" fill="#000"/><rect x="${x + 10}" y="${y + 10}" width="50" height="50" fill="#fff"/><rect x="${x + 20}" y="${y + 20}" width="30" height="30" fill="#000"/>`;
    const side = cells * size;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${side}" height="${side}" viewBox="0 0 ${side} ${side}"><rect width="${side}" height="${side}" fill="#fff"/><g fill="#000">${rects}</g>${finder(0, 0)}${finder(side - 70, 0)}${finder(0, side - 70)}</svg>`;
};

const png = async (svg: string): Promise<OfferPdfImage> => ({
    data: await sharp(Buffer.from(svg)).png().toBuffer(),
    format: 'png',
});

const readOutDir = (): string => {
    const index = process.argv.indexOf('--out');
    const value = index >= 0 ? process.argv[index + 1] : undefined;
    return resolve(value ?? 'tmp/invoice-pdf');
};

/** Длинная таблица: строки образца повторены, чтобы счёт занял несколько листов. */
const manyRows = (count: number): IProductRenderItemData[] => {
    const base = createOfferRenderDataFixture().ProductRows;
    return Array.from({ length: count }, (_, index) => ({
        ...base[index % base.length],
        ProductNumber: String(index + 1),
    }));
};

interface Variant {
    name: string;
    build: (images: Required<InvoicePdfImages>) => InvoicePdfModel;
}

const VARIANTS: Variant[] = [
    {
        name: 'full',
        build: images => createInvoicePdfModelFixture({ images }),
    },
    {
        name: 'no-stamps',
        build: images =>
            createInvoicePdfModelFixture({
                signer: null,
                images: { qr: images.qr },
            }),
    },
    {
        name: 'no-qr',
        build: ({ stamp, signatureDirector, signatureAccountant }) =>
            createInvoicePdfModelFixture({
                images: { stamp, signatureDirector, signatureAccountant },
            }),
    },
    {
        name: 'no-images',
        build: () => createInvoicePdfModelFixture(),
    },
    {
        name: 'no-discount-with-tax',
        build: images =>
            createInvoicePdfModelFixture({
                images,
                data: createInvoiceDataFixture({
                    ProductRows: createOfferRenderDataFixture().ProductRows.map(
                        row => ({ ...row, ProductDiscountPercent: '0' }),
                    ),
                    TotalRow: (
                        createOfferRenderDataFixture().TotalRow ?? []
                    ).map(total => ({
                        ...total,
                        TaxSum: '6928.57',
                        TotalTaxInvoiceInfo: 'Налог (НДС 5%)',
                    })),
                }),
            }),
    },
    {
        name: 'ip-no-kpp',
        build: images =>
            createInvoicePdfModelFixture({
                images,
                signer: {
                    position:
                        'Индивидуальный предприниматель Орлов Олег Олегович',
                    director: '',
                    accountant: '',
                },
                data: createInvoiceDataFixture({
                    MyCompanyKPP: '',
                    MyCompanyFullName:
                        'Индивидуальный предприниматель Орлов Олег Олегович',
                    RecipientCompanyName: '',
                }),
            }),
    },
    {
        name: 'many-rows',
        build: images =>
            createInvoicePdfModelFixture({
                images,
                data: createInvoiceDataFixture({ ProductRows: manyRows(40) }),
            }),
    },
];

const main = async (): Promise<void> => {
    const outDir = readOutDir();
    mkdirSync(outDir, { recursive: true });
    const service = new InvoicePdfRenderService();
    const [stamp, signature, qr] = await Promise.all([
        png(STAMP_SVG),
        png(SIGNATURE_SVG),
        png(qrSvg()),
    ]);
    const images: Required<InvoicePdfImages> = {
        stamp,
        signatureDirector: signature,
        signatureAccountant: signature,
        qr,
    };
    let problems = 0;

    for (const variant of VARIANTS) {
        const result = await service.render(variant.build(images));
        const pages = (await PDFDocument.load(result.buffer)).getPageCount();
        const file = join(outDir, `invoice-${variant.name}.pdf`);
        writeFileSync(file, result.buffer);
        const audit = auditLayout(result.layout);
        problems += audit.issues.length;
        console.log(
            `${variant.name}: ${pages} стр., ${result.buffer.length} байт, ${result.durationMs} мс → ${file}`,
        );
        console.log(formatAudit(variant.name, audit));
    }
    console.log(problems ? `\nПроблем: ${problems}` : '\nПроблем нет');
    process.exitCode = problems ? 1 : 0;
};

main().catch(error => {
    console.error(error);
    process.exit(1);
});
