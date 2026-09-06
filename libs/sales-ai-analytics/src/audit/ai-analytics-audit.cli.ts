/**
 * Разбор аргументов командной строки аудита (без сторонних библиотек):
 *   --domain <домен> [--months 6] [--tz Europe/Moscow] [--out <файл.md>]
 * Поддерживаются формы `--key value` и `--key=value`.
 */

export const AUDIT_ARG_DEFAULTS = {
    months: 6,
    timeZone: 'Europe/Moscow',
    maxMonths: 36,
} as const;

export interface AuditArgs {
    domain: string;
    months: number;
    timeZone: string;
    /** Путь к markdown-отчёту; null — имя по умолчанию в ai/tasks. */
    out: string | null;
}

export const AUDIT_USAGE =
    'Использование: npx ts-node -r tsconfig-paths/register ' +
    'apps/kpi-report-sales/src/ai-analytics/audit/run-ai-analytics-audit.ts --domain <домен> ' +
    `[--months ${AUDIT_ARG_DEFAULTS.months}] [--tz ${AUDIT_ARG_DEFAULTS.timeZone}] [--out <файл.md>]`;

function collectOptions(argv: string[]): Map<string, string> {
    const options = new Map<string, string>();
    for (let i = 0; i < argv.length; i += 1) {
        const token = argv[i];
        if (!token.startsWith('--')) {
            throw new Error(`Неожиданный аргумент «${token}». ${AUDIT_USAGE}`);
        }
        const equals = token.indexOf('=');
        if (equals !== -1) {
            options.set(token.slice(2, equals), token.slice(equals + 1));
            continue;
        }
        const value = argv[i + 1];
        if (value === undefined || value.startsWith('--')) {
            throw new Error(`Нет значения для «${token}». ${AUDIT_USAGE}`);
        }
        options.set(token.slice(2), value);
        i += 1;
    }
    return options;
}

function parseMonths(raw: string | undefined): number {
    if (raw === undefined) return AUDIT_ARG_DEFAULTS.months;
    const months = Number(raw);
    if (
        !Number.isInteger(months) ||
        months < 1 ||
        months > AUDIT_ARG_DEFAULTS.maxMonths
    ) {
        throw new Error(
            `--months должно быть целым от 1 до ${AUDIT_ARG_DEFAULTS.maxMonths}, получено «${raw}».`,
        );
    }
    return months;
}

function parseTimeZone(raw: string | undefined): string {
    const timeZone = raw ?? AUDIT_ARG_DEFAULTS.timeZone;
    try {
        new Intl.DateTimeFormat('en-CA', { timeZone });
    } catch {
        throw new Error(`Неизвестный часовой пояс «${timeZone}».`);
    }
    return timeZone;
}

export function parseAuditArgs(argv: string[]): AuditArgs {
    const options = collectOptions(argv);
    const domain = options.get('domain')?.trim().toLowerCase();
    if (!domain) {
        throw new Error(`Не задан --domain. ${AUDIT_USAGE}`);
    }
    return {
        domain,
        months: parseMonths(options.get('months')),
        timeZone: parseTimeZone(options.get('tz')),
        out: options.get('out') ?? null,
    };
}
