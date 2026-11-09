import { CronJobInfo, CronJobsRoster } from '@lib/core/schedule';
import {
    ACTUALIZE_FIN_SERVICES_DOMAIN,
    CronJobName,
} from './deals-schedule.const';

/**
 * Что делает каждый крон отдела сервиса — для стартового отчёта в Telegram.
 *
 * Привязки к порталам у этих кронов нет: они работают всегда, пока
 * приложение поднято (`portals: null`); исключение — пересчёт актов, он
 * жёстко привязан к одному порталу.
 */
export const DEALS_CRON_ROSTER: CronJobsRoster = new Map<string, CronJobInfo>([
    [
        CronJobName.MOVE_DEALS,
        {
            purpose: 'перенос сделок сервиса по стадиям, каждые 5 часов',
            portals: null,
        },
    ],
    [
        CronJobName.CHECK_DEALS_EVERY_WEEK,
        {
            purpose:
                'проверка заказов и предупреждения менеджерам, пятница 15:00',
            portals: null,
        },
    ],
    [
        CronJobName.ACTUALIZE_FIN_SERVICES_WITH_TASKS,
        {
            purpose: 'пересчёт актов и задачи менеджерам, четверг 20:25',
            portals: [{ domain: ACTUALIZE_FIN_SERVICES_DOMAIN }],
        },
    ],
]);
