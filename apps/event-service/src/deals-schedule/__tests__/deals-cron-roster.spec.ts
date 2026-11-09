import { DEALS_CRON_ROSTER } from '../deals-cron-roster';
import {
    ACTUALIZE_FIN_SERVICES_DOMAIN,
    CronJobName,
} from '../deals-schedule.const';

describe('DEALS_CRON_ROSTER', () => {
    it('описан каждый крон отдела сервиса, и только они', () => {
        expect([...DEALS_CRON_ROSTER.keys()].sort()).toEqual(
            Object.values(CronJobName).sort(),
        );
        for (const info of DEALS_CRON_ROSTER.values()) {
            expect(info.purpose.length).toBeGreaterThan(0);
        }
    });

    it('пересчёт актов привязан к одному порталу, остальные кроны — без привязки', () => {
        expect(
            DEALS_CRON_ROSTER.get(CronJobName.ACTUALIZE_FIN_SERVICES_WITH_TASKS)
                ?.portals,
        ).toEqual([{ domain: ACTUALIZE_FIN_SERVICES_DOMAIN }]);
        expect(
            DEALS_CRON_ROSTER.get(CronJobName.MOVE_DEALS)?.portals,
        ).toBeNull();
        expect(
            DEALS_CRON_ROSTER.get(CronJobName.CHECK_DEALS_EVERY_WEEK)?.portals,
        ).toBeNull();
    });
});
