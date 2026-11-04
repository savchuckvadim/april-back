/**
 * Аудит раскладки PDF-КП: рендер боевым сервисом на крайних данных и
 * проверка координат блоков, которые посчитал сам react-pdf (Yoga +
 * метрики шрифта).
 *
 *   npm run offer-pdf:audit -- --out tmp/offer-pdf-audit
 *   npm run offer-pdf:audit -- --dump      # срез дерева первого сценария
 *
 * На каждой странице: шапка и подвал (fixed) не залезают на текст, текст
 * не выходит за поля, заголовок не остаётся последним на странице.
 * Как и offer-pdf-snapshot, живёт в src: под jest react-pdf не грузится.
 */
import { mkdirSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { createOfferPdfModelFixture } from '../__tests__/fixtures/offer-pdf-model.fixture';
import { resolveOfferPdfSettings } from '../model/offer-pdf-settings';
import { OfferPdfRenderService } from '../services/offer-pdf-render.service';
import { auditLayout, dumpTree, formatAudit } from './layout-audit';
import { AUDIT_SCENARIOS } from './layout-audit.scenarios';

const readOutDir = (): string => {
    const index = process.argv.indexOf('--out');
    const value = index >= 0 ? process.argv[index + 1] : undefined;
    return resolve(value ?? 'tmp/offer-pdf-audit');
};

const main = async (): Promise<void> => {
    const outDir = readOutDir();
    mkdirSync(outDir, { recursive: true });
    const service = new OfferPdfRenderService();
    let problems = 0;

    for (const scenario of AUDIT_SCENARIOS) {
        const model = createOfferPdfModelFixture({
            settings: resolveOfferPdfSettings(scenario.settings),
            ...scenario.model,
        });
        const result = await service.render(model);
        writeFileSync(join(outDir, `${scenario.name}.pdf`), result.buffer);
        if (process.argv.includes('--dump')) {
            console.log(JSON.stringify(dumpTree(result.layout), null, 1).slice(0, 6000));
            return;
        }
        const report = auditLayout(result.layout);
        problems += report.issues.length;
        const frame = result.frame
            ? ` (поля подобраны: ${result.frame.paddingTop}/${result.frame.paddingBottom})`
            : '';
        console.log(formatAudit(`${scenario.name}${frame}`, report));
    }
    console.log(problems ? `\nПроблем: ${problems}` : '\nПроблем нет');
    process.exitCode = problems ? 1 : 0;
};

main().catch(error => {
    console.error(error);
    process.exit(1);
});
