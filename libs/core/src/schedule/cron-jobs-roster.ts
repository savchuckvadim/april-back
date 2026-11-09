/**
 * Сведения приложения о своих кронах для стартового отчёта.
 *
 * Реестр Nest знает только имена и расписание. Что крон делает и на каких
 * порталах включён — знает само приложение (настройки порталов в админке),
 * поэтому оно отдаёт эти сведения отчёту под токеном
 * `CRON_JOBS_ROSTER_SOURCE`; без источника отчёт печатает голый реестр.
 */

/** Портал, где крон включён; `note` — режим на портале («холостой ход»). */
export interface CronJobPortal {
    readonly domain: string;
    readonly note?: string;
}

export interface CronJobInfo {
    /** Что делает крон — одной строкой, для людей. */
    readonly purpose: string;
    /**
     * Порталы, где крон включён. Пустой список — нигде не включён;
     * null — у крона нет привязки к порталам, он просто работает.
     */
    readonly portals: readonly CronJobPortal[] | null;
}

/** Имя крона (`name` в `@Cron`) → сведения. */
export type CronJobsRoster = ReadonlyMap<string, CronJobInfo>;

/** Источник сведений; читается один раз при старте, после регистрации кронов. */
export interface CronJobsRosterSource {
    resolve(): Promise<CronJobsRoster>;
}

export const CRON_JOBS_ROSTER_SOURCE = Symbol('CRON_JOBS_ROSTER_SOURCE');

/** Источник с неизменным набором сведений — для кронов без привязки к порталам. */
export const staticCronJobsRoster = (
    roster: CronJobsRoster,
): CronJobsRosterSource => ({
    resolve: () => Promise.resolve(roster),
});
