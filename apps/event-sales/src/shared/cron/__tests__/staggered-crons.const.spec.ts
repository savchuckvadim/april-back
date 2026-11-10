import { STAGGERED_HALF_HOUR_CRON } from '../staggered-crons.const';

/** Минуты запуска из выражения «сек мин час …». */
const minutesOf = (cron: string): number[] =>
    cron.split(' ')[1].split(',').map(Number);

/*
 * garant 09.11 10:00:05 и 10.11 11:30: всплески 500 Битрикса ровно на
 * тиках, где пять получасовых кронов шли в портал одновременно.
 */
describe('STAGGERED_HALF_HOUR_CRON — получасовые кроны на разных минутах', () => {
    const crons = Object.values(STAGGERED_HALF_HOUR_CRON);

    it('каждый тикает дважды в час с шагом 30 минут', () => {
        for (const cron of crons) {
            const [first, second] = minutesOf(cron);
            expect(minutesOf(cron)).toHaveLength(2);
            expect(second - first).toBe(30);
        }
    });

    it('никакие два не делят минуту', () => {
        const minutes = crons.flatMap(minutesOf);
        expect(new Set(minutes).size).toBe(minutes.length);
    });

    it('мимо :X0 — там SLA заявок, часовые кроны и разбор аналитики', () => {
        for (const minute of crons.flatMap(minutesOf)) {
            expect(minute % 10).not.toBe(0);
        }
    });
});
