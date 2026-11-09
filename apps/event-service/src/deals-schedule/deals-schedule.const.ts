/** Имена кронов отдела сервиса — `name` в `@Cron` и ключи стартового отчёта. */
export enum CronJobName {
    MOVE_DEALS = 'moveDeals',
    CHECK_DEALS_EVERY_WEEK = 'checkDealsEveryWeek',
    ACTUALIZE_FIN_SERVICES_WITH_TASKS = 'actualizeDealsFinServicesWithTasks',
}

/** Единственный портал, для которого крон пересчитывает акты и ставит задачи. */
export const ACTUALIZE_FIN_SERVICES_DOMAIN = 'gsr.bitrix24.ru';
