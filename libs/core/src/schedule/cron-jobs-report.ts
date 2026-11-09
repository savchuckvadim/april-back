import { CronJobInfo, CronJobPortal, CronJobsRoster } from './cron-jobs-roster';

/** Часовой пояс отчёта: расписания владельца — по Москве. */
export const CRON_REPORT_TIMEZONE = 'Europe/Moscow';

const NEXT_RUNS = 2;
const RUN_FORMAT = 'dd.MM HH:mm';

/**
 * Имя без `name` в `@Cron`: Nest подставляет случайный UUID, и по такой
 * строке в отчёте не понять, какой это крон.
 */
const GENERATED_NAME =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Момент запуска: ровно то, что отчёту нужно от luxon-даты крона. */
interface CronRunMoment {
    setZone(zone: string): { toFormat(format: string): string };
}

/**
 * Задача крона глазами отчёта. Структурный тип вместо `CronJob` из
 * пакета `cron`: тот не прямая зависимость монорепо, а отчёту нужен
 * один метод.
 */
export interface CronJobSchedule {
    nextDates(count: number): readonly CronRunMoment[];
}

export interface CronJobSummary {
    readonly name: string;
    /** Ближайшие запуски, уже в часовом поясе отчёта. */
    readonly nextRuns: readonly string[];
}

/** Строка отчёта: задача реестра плюс сведения приложения, если они есть. */
export interface CronJobReportLine extends CronJobSummary {
    /** undefined — источника сведений нет; null — крон в нём не описан. */
    readonly info?: CronJobInfo | null;
}

/** Задачи реестра → строки отчёта, по алфавиту имён. */
export const summarizeCronJobs = (
    jobs: ReadonlyMap<string, CronJobSchedule>,
    timeZone: string = CRON_REPORT_TIMEZONE,
): CronJobSummary[] =>
    [...jobs]
        .map(([name, job]) => ({
            name: GENERATED_NAME.test(name)
                ? 'без имени (задайте name в @Cron)'
                : name,
            nextRuns: job
                .nextDates(NEXT_RUNS)
                .map(moment => moment.setZone(timeZone).toFormat(RUN_FORMAT)),
        }))
        .sort((a, b) => a.name.localeCompare(b.name));

/**
 * Склейка реестра со сведениями приложения. Кроны, описанные в сведениях,
 * но не зарегистрированные в Nest (опечатка в имени, модуль не подключён),
 * попадают в предупреждение внизу отчёта.
 */
export const mergeCronJobsRoster = (
    jobs: readonly CronJobSummary[],
    roster: CronJobsRoster | null,
): { lines: CronJobReportLine[]; footer: string[] } => {
    if (!roster) return { lines: [...jobs], footer: [] };
    const registered = new Set(jobs.map(job => job.name));
    const unknown = [...roster.keys()].filter(name => !registered.has(name));
    return {
        lines: jobs.map(job => ({
            ...job,
            info: roster.get(job.name) ?? null,
        })),
        footer: unknown.length
            ? [`⚠️ Описаны, но не зарегистрированы: ${unknown.join(', ')}`]
            : [],
    };
};

const describePortals = (portals: readonly CronJobPortal[]): string =>
    portals.length
        ? portals
              .map(portal =>
                  portal.note
                      ? `${portal.domain} (${portal.note})`
                      : portal.domain,
              )
              .join(', ')
        : 'нигде не включён';

const describeInfo = (info: CronJobInfo | null | undefined): string | null => {
    if (info === undefined) return null;
    if (info === null) return 'привязка к порталам не описана';
    return info.portals === null
        ? info.purpose
        : `${info.purpose}: ${describePortals(info.portals)}`;
};

/** Текст отчёта о кронах приложения для лога и Telegram. */
export const formatCronJobsReport = (
    jobs: readonly CronJobReportLine[],
    footer: readonly string[] = [],
): string => {
    if (!jobs.length) {
        return (
            '🕒 Кроны не зарегистрированы — проверьте, что в приложении ' +
            'подключён ScheduleModule.forRoot()'
        );
    }
    const lines = jobs.flatMap(job => {
        const head = `• ${job.name} — ${job.nextRuns.join(', ')}`;
        const detail = describeInfo(job.info);
        return detail ? [head, `  ${detail}`] : [head];
    });
    return [
        `🕒 Кроны запущены: ${jobs.length} (ближайшие запуски, МСК)`,
        ...lines,
        ...footer,
    ].join('\n');
};
