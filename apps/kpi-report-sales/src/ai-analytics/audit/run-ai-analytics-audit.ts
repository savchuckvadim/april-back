/**
 * CLI-вход аудита данных AI-аналитики ОП (Фаза 0 плана
 * ai/tasks/ai-sales-analytics-plan.md): покрытие user_id по месяцам,
 * n разборов по (менеджер × тип × месяц), доля other/irrelevant,
 * распределение длительностей и доля звонков короче порога портала,
 * разборы по версиям, заполненность полей user_result, глубина истории
 * ais — и рекомендация по порогам 4.11 и minDurationSec.
 *
 * Только Prisma (generated/prisma), без Nest. Вся логика — в
 * libs/sales-ai-analytics/src/audit (runAiAnalyticsAudit + PrismaAuditDb),
 * здесь — разбор аргументов, DATABASE_URL, порог «короткого» звонка
 * портала и запись файла. DATABASE_URL берётся из окружения, иначе из
 * apps/kpi-report-sales/.env, иначе из корневого .env.
 *
 * Порог «короткого» звонка — портальный, тем же путём, что у конвейера
 * разбора (CallReportSettingsService) и месячного снапшота
 * (AuditSnapshotUseCase): настройки [kpiSales] (`ai_analytics_definitions`,
 * `ai_analytics_model_params`) → прежний скаляр
 * `portal_ai_settings.min_duration_sec` → дефолт реестра. В отчёт уходит
 * МИНИМУМ карты: тип звонка в доле коротких не участвует (решение
 * владельца А.1, находка M12). Иначе отчёт описывал бы не ту выборку,
 * которую конвейер берёт в разбор.
 *
 * Использование:
 *   npx ts-node -r tsconfig-paths/register apps/kpi-report-sales/src/ai-analytics/audit/run-ai-analytics-audit.ts --domain <домен> [--months 6] [--tz Europe/Moscow] [--out <файл.md>]
 *   npm run audit:ai-analytics -- --domain <домен> --months 6
 *
 * Выход: ai/tasks/ai-analytics-audit-<YYYY-MM-DD>.md и тот же markdown в
 * stdout. Тот же отчёт по живой БД без доступа к серверу — админ-ручка
 * POST admin/ai-analytics/audit (apps/admin) и месячный снапшот в ais.
 * process.exit в конце обязателен: пул Prisma держит event loop.
 */
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { Prisma, PrismaClient } from 'generated/prisma';
import {
    EnumPortalAppCode,
    PORTAL_APP_SETTINGS_SCHEMA,
} from '@lib/portal-lib/store/app-settings/portal-app-settings.schema';
import {
    AUDIT_USAGE,
    parseAuditArgs,
} from '@lib/sales-ai-analytics/audit/ai-analytics-audit.cli';
import { PrismaAuditDb } from '@lib/sales-ai-analytics/audit/ai-analytics-audit.db';
import { runAiAnalyticsAudit } from '@lib/sales-ai-analytics/audit/ai-analytics-audit.run';
import {
    minDurationByTypeOfSettings,
    minDurationFloorSec,
} from '@lib/sales-ai-analytics/settings/min-duration.resolve';

const ROOT_DIR = resolve(__dirname, '../../../../..');
const ENV_FILES = ['apps/kpi-report-sales/.env', '.env'];
const REPORT_DIR = 'ai/tasks';

/** Ключи JSON-колонки `portal_app_settings.settings` приложения kpi-sales. */
const KPI_SALES_SETTINGS =
    PORTAL_APP_SETTINGS_SCHEMA[EnumPortalAppCode.kpiSales];
const AI_DEFINITIONS_CODE = KPI_SALES_SETTINGS.aiAnalyticsDefinitions.code;
const AI_MODEL_PARAMS_CODE = KPI_SALES_SETTINGS.aiAnalyticsModelParams.code;

/** Строки настроек портала, из которых считается порог «короткого» звонка. */
export interface AuditPortalThresholdRows {
    /** JSON `portal_app_settings.settings` приложения kpi-sales; null — строки нет. */
    kpiSalesSettings: Prisma.JsonValue | null;
    /** `portal_ai_settings.min_duration_sec` — прежний скаляр конвейера; null — не задан. */
    pipelineMinDurationSec: number | null;
}

/** Часть Prisma-клиента, нужная для чтения строк порога. */
export type AuditThresholdDb = Pick<
    PrismaClient,
    'portalAppSettings' | 'portalAiSettings'
>;

/** Строки порога по домену: настройки kpi-sales и прежний скаляр конвейера. */
export async function loadAuditThresholdRows(
    prisma: AuditThresholdDb,
    domain: string,
): Promise<AuditPortalThresholdRows> {
    const [app, ai] = await Promise.all([
        prisma.portalAppSettings.findFirst({
            where: { domain, appCode: EnumPortalAppCode.kpiSales },
            select: { settings: true },
        }),
        prisma.portalAiSettings.findFirst({
            where: { domain },
            select: { minDurationSec: true },
        }),
    ]);
    return {
        kpiSalesSettings: app?.settings ?? null,
        pipelineMinDurationSec: ai?.minDurationSec ?? null,
    };
}

/** Строковое значение ключа JSON-колонки; чужой тип или мусор — «ключ не задан». */
function textOf(
    settings: Prisma.JsonValue | null,
    key: string,
): string | undefined {
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
        return undefined;
    }
    const value = settings[key];
    return typeof value === 'string' ? value : undefined;
}

/**
 * Порог «короткого» звонка отчёта: тот же, которым конвейер разбора
 * отбирает звонки. Настроек нет — честная деградация на дефолт реестра
 * (`registryMinDurationSec`, 300 с), как и у месячного снапшота.
 */
export function auditShortCallSecOf(rows: AuditPortalThresholdRows): number {
    return minDurationFloorSec(
        minDurationByTypeOfSettings(
            {
                aiAnalyticsDefinitions: textOf(
                    rows.kpiSalesSettings,
                    AI_DEFINITIONS_CODE,
                ),
                aiAnalyticsModelParams: textOf(
                    rows.kpiSalesSettings,
                    AI_MODEL_PARAMS_CODE,
                ),
            },
            rows.pipelineMinDurationSec,
        ),
    );
}

/** DATABASE_URL из окружения либо первого .env, где он задан. */
function loadDatabaseUrl(): void {
    for (const file of ENV_FILES) {
        if (process.env.DATABASE_URL) return;
        const path = join(ROOT_DIR, file);
        if (!existsSync(path)) continue;
        try {
            process.loadEnvFile(path);
        } catch {
            // битый .env пропускаем — следующий файл может быть валидным
        }
    }
    if (!process.env.DATABASE_URL) {
        throw new Error(
            `DATABASE_URL не задан ни в окружении, ни в ${ENV_FILES.join(', ')}.`,
        );
    }
}

async function main(): Promise<void> {
    const args = parseAuditArgs(process.argv.slice(2));
    loadDatabaseUrl();

    const prisma = new PrismaClient();
    try {
        const shortCallSec = auditShortCallSecOf(
            await loadAuditThresholdRows(prisma, args.domain),
        );
        const { report, markdown } = await runAiAnalyticsAudit(
            new PrismaAuditDb(prisma),
            {
                domain: args.domain,
                months: args.months,
                timeZone: args.timeZone,
                now: new Date(),
                shortCallSec,
            },
        );
        const outPath = resolve(
            ROOT_DIR,
            args.out ??
                join(
                    REPORT_DIR,
                    `ai-analytics-audit-${report.meta.generatedAt}.md`,
                ),
        );

        mkdirSync(dirname(outPath), { recursive: true });
        writeFileSync(outPath, markdown, 'utf8');
        console.log(markdown);
        console.log(
            `Аудит ${args.domain}: ${report.totals.calls} звонков, ${report.totals.analyzed} разборов, ` +
                `порог короткого ${shortCallSec} с → ${outPath}`,
        );
    } finally {
        await prisma.$disconnect();
    }
}

// Запуск только как скрипт: спека импортирует чистые функции без побочек.
if (require.main === module) {
    main()
        .then(() => process.exit(0))
        .catch((error: unknown) => {
            const message =
                error instanceof Error ? error.message : String(error);
            console.error(`ai-analytics-audit failed: ${message}`);
            if (!message.includes(AUDIT_USAGE)) console.error(AUDIT_USAGE);
            process.exit(1);
        });
}
