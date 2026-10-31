/**
 * Настоящий рендер PDF-КП на фикстуре — без БД и без сервера.
 * Пишет PDF по варианту настроек, печатает страницы, размер и время.
 *
 *   npm run offer-pdf:snapshot -- --out tmp/offer-pdf
 *
 * Под jest @react-pdf/renderer (ESM-only) не грузится, поэтому реальный
 * рендер проверяется этим скриптом, а логика шаблонов — юнит-тестами.
 * Лежит в src (а не в /scripts — тот каталог в .gitignore), в бандл не
 * попадает: webpack собирает только от main.ts.
 */
import { mkdirSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { PDFDocument } from 'pdf-lib';
import { createOfferPdfModelFixture } from '../__tests__/fixtures/offer-pdf-model.fixture';
import {
    OfferPdfSettingsInput,
    resolveOfferPdfSettings,
} from '../model/offer-pdf-settings';
import { OfferPdfRenderService } from '../services/offer-pdf-render.service';
import {
    DocumentFieldDescriptionMode,
    DocumentFieldViewMode,
} from '../../offer/type/offer-settings.type';

const VARIANTS: Array<{ name: string; settings: OfferPdfSettingsInput }> = [
    { name: 'list-small', settings: {} },
    {
        name: 'list-big-price-first',
        settings: {
            descriptionMode: DocumentFieldDescriptionMode.BIG,
            isPriceFirst: true,
            salePhrase:
                'При оплате до конца месяца — дополнительная скидка 5 %',
        },
    },
    {
        name: 'table-no',
        settings: {
            viewMode: DocumentFieldViewMode.TABLE,
            descriptionMode: DocumentFieldDescriptionMode.NO,
        },
    },
    {
        name: 'table-groups-medium-no-manager',
        settings: {
            viewMode: DocumentFieldViewMode.TABLE_WITH_GROUP,
            descriptionMode: DocumentFieldDescriptionMode.MEDIUM,
            withManager: false,
            withStamps: false,
        },
    },
];

const readOutDir = (): string => {
    const index = process.argv.indexOf('--out');
    const value = index >= 0 ? process.argv[index + 1] : undefined;
    return resolve(value ?? 'tmp/offer-pdf');
};

const main = async (): Promise<void> => {
    const outDir = readOutDir();
    mkdirSync(outDir, { recursive: true });
    const service = new OfferPdfRenderService();

    for (const variant of VARIANTS) {
        const model = createOfferPdfModelFixture({
            settings: resolveOfferPdfSettings(variant.settings),
            meta: { date: '31 октября 2026 г.', documentNumber: 'КП-1042' },
        });
        const result = await service.render(model);
        const pages = (await PDFDocument.load(result.buffer)).getPageCount();
        const file = join(outDir, `classic-${variant.name}.pdf`);
        writeFileSync(file, result.buffer);
        console.log(
            `${variant.name}: ${pages} стр., ${result.buffer.length} байт, ${result.durationMs} мс → ${file}`,
        );
    }
};

main().catch(error => {
    console.error(error);
    process.exit(1);
});
