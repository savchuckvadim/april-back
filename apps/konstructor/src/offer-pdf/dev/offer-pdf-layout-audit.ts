/**
 * Аудит раскладки PDF-КП: рендер боевым сервисом на крайних данных и
 * проверка координат блоков, которые посчитал сам react-pdf (Yoga +
 * метрики шрифта).
 *
 *   npm run offer-pdf:audit -- --out tmp/offer-pdf-audit
 *   npm run offer-pdf:audit -- --only facet,prism   # только эти стили
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
import { AUDIT_SCENARIOS, type AuditScenario } from './layout-audit.scenarios';
import type { OfferPdfTemplate } from '../templates/offer-pdf-template.interface';
import { OFFER_PDF_TEMPLATES } from '../templates/offer-pdf-template.registry';

const readOutDir = (): string => {
    const index = process.argv.indexOf('--out');
    const value = index >= 0 ? process.argv[index + 1] : undefined;
    return resolve(value ?? 'tmp/offer-pdf-audit');
};

/**
 * Неразрывный блок выше страницы react-pdf кладёт как есть и только пишет
 * предупреждение: текст лезет под подвал, хвост теряется, а в дереве
 * раскладки бокс уже обрезан — по координатам такое не поймать.
 */
const UNBREAKABLE_WARNING = "can't wrap between pages";

const countUnbreakable = async <T>(
    render: () => Promise<T>,
): Promise<{ result: T; count: number }> => {
    const original = console.warn;
    let count = 0;
    console.warn = (...args: unknown[]) => {
        if (args.some(arg => String(arg).includes(UNBREAKABLE_WARNING))) {
            count += 1;
            return;
        }
        original(...args);
    };
    try {
        return { result: await render(), count };
    } finally {
        console.warn = original;
    }
};

/** `--only prism,facet` — только эти стили */
const readOnly = (): Set<string> | null => {
    const index = process.argv.indexOf('--only');
    const value = index >= 0 ? process.argv[index + 1] : undefined;
    return value ? new Set(value.split(',')) : null;
};

interface AuditRun {
    template: OfferPdfTemplate;
    scenario: AuditScenario;
    /** null — первая гамма стиля */
    palette: string | null;
}

/**
 * Каждый сценарий — в каждом стиле (раскладку ломают и данные, и
 * оформление), плюс остальные гаммы стиля на сценарии по умолчанию.
 */
const auditRuns = (): AuditRun[] => {
    const only = readOnly();
    const [base] = AUDIT_SCENARIOS;
    return OFFER_PDF_TEMPLATES.filter(
        template => !only || only.has(template.code),
    ).flatMap(template => [
        ...AUDIT_SCENARIOS.map(scenario => ({
            template,
            scenario,
            palette: null,
        })),
        ...(base ? (template.palettes ?? []).slice(1) : []).map(palette => ({
            template,
            scenario: base,
            palette: palette.code,
        })),
    ]);
};

const main = async (): Promise<void> => {
    const outDir = readOutDir();
    mkdirSync(outDir, { recursive: true });
    const service = new OfferPdfRenderService();
    let problems = 0;

    for (const { template, scenario, palette } of auditRuns()) {
        const name = [template.code, palette, scenario.name]
            .filter(Boolean)
            .join('-');
        const model = createOfferPdfModelFixture({
            templateCode: template.code,
            palette,
            settings: resolveOfferPdfSettings(scenario.settings),
            ...scenario.model,
        });
        const { result, count: unbreakable } = await countUnbreakable(() =>
            service.render(model),
        );
        if (unbreakable) {
            problems += unbreakable;
            console.log(
                `!! ${name}: неразрывных блоков выше страницы — ${unbreakable} (текст под подвалом, хвост теряется)`,
            );
        }
        writeFileSync(join(outDir, `${name}.pdf`), result.buffer);
        if (process.argv.includes('--dump')) {
            console.log(
                JSON.stringify(dumpTree(result.layout), null, 1).slice(0, 6000),
            );
            return;
        }
        const report = auditLayout(result.layout);
        problems += report.issues.length;
        const frame = result.frame
            ? ` (поля подобраны: ${result.frame.paddingTop}/${result.frame.paddingBottom})`
            : '';
        // хвост карточки уходил на пустой лист: документ перерисован с другим нижним полем
        const tail =
            result.surfaceBottom === null
                ? ''
                : ` (нижнее поле карточек ${result.surfaceBottom})`;
        console.log(formatAudit(`${name}${frame}${tail}`, report));
    }
    console.log(problems ? `\nПроблем: ${problems}` : '\nПроблем нет');
    process.exitCode = problems ? 1 : 0;
};

main().catch(error => {
    console.error(error);
    process.exit(1);
});
