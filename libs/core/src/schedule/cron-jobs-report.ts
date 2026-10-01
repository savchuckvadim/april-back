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

/** Текст отчёта о кронах приложения для лога и Telegram. */
export const formatCronJobsReport = (
    jobs: readonly CronJobSummary[],
): string => {
    if (!jobs.length) {
        return (
            '🕒 Кроны не зарегистрированы — проверьте, что в приложении ' +
            'подключён ScheduleModule.forRoot()'
        );
    }
    const lines = jobs.map(job => `• ${job.name} — ${job.nextRuns.join(', ')}`);
    return [
        `🕒 Кроны запущены: ${jobs.length} (ближайшие запуски, МСК)`,
        ...lines,
    ].join('\n');
};
