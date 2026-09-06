/**
 * CLI-вход аудита данных AI-аналитики ОП (Фаза 0 плана
 * ai/tasks/ai-sales-analytics-plan.md): покрытие user_id по месяцам,
 * n разборов по (менеджер × тип × месяц), доля other/irrelevant,
 * распределение длительностей и доля звонков < 300 с, разборы по версиям,
 * заполненность полей user_result, глубина истории ais — и рекомендация
 * по порогам 4.11 и minDurationSec.
 *
 * Только Prisma (generated/prisma), без Nest. Вся логика — в
 * libs/sales-ai-analytics/src/audit (runAiAnalyticsAudit + PrismaAuditDb),
 * здесь — разбор аргументов, DATABASE_URL и запись файла. DATABASE_URL
 * берётся из окружения, иначе из apps/kpi-report-sales/.env, иначе из
 * корневого .env.
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
import { PrismaClient } from 'generated/prisma';
import {
    AUDIT_USAGE,
    parseAuditArgs,
} from '@lib/sales-ai-analytics/audit/ai-analytics-audit.cli';
import { PrismaAuditDb } from '@lib/sales-ai-analytics/audit/ai-analytics-audit.db';
import { runAiAnalyticsAudit } from '@lib/sales-ai-analytics/audit/ai-analytics-audit.run';

const ROOT_DIR = resolve(__dirname, '../../../../..');
const ENV_FILES = ['apps/kpi-report-sales/.env', '.env'];
const REPORT_DIR = 'ai/tasks';

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
        const { report, markdown } = await runAiAnalyticsAudit(
            new PrismaAuditDb(prisma),
            {
                domain: args.domain,
                months: args.months,
                timeZone: args.timeZone,
                now: new Date(),
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
            `Аудит ${args.domain}: ${report.totals.calls} звонков, ${report.totals.analyzed} разборов → ${outPath}`,
        );
    } finally {
        await prisma.$disconnect();
    }
}

main()
    .then(() => process.exit(0))
    .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`ai-analytics-audit failed: ${message}`);
        if (!message.includes(AUDIT_USAGE)) console.error(AUDIT_USAGE);
        process.exit(1);
    });
