import { ROP_PERIOD_KIND, ROP_PERIOD_KINDS } from '../../period/rop-period';
import {
    ROP_MARK_TTL_SEC,
    ROP_SETUP_SCOPE,
    ROP_TASK_TTL_SEC,
    ropKeys,
} from '../rop-keys';

const DOMAIN = 'gsr.bitrix24.ru';

describe('ключи Redis отчёта РОПу', () => {
    const keys = ropKeys('event-sales:period-digest');

    it('замки портала и тика', () => {
        expect(keys.lock(DOMAIN)).toBe(
            'event-sales:period-digest:lock:gsr.bitrix24.ru',
        );
        expect(keys.tickLock()).toBe('event-sales:period-digest:tick-lock');
    });

    it('метка выпуска — своя у вида периода и у «только считать»', () => {
        expect(keys.released(DOMAIN, ROP_PERIOD_KIND.week, false)).toBe(
            'event-sales:period-digest:released:week:gsr.bitrix24.ru',
        );
        expect(keys.released(DOMAIN, ROP_PERIOD_KIND.month, true)).toBe(
            'event-sales:period-digest:released-count:month:gsr.bitrix24.ru',
        );
    });

    it('неудачи, память задач, получатели и итог прогона — с видом периода', () => {
        expect(keys.failures(DOMAIN, ROP_PERIOD_KIND.month)).toBe(
            'event-sales:period-digest:failed:month:gsr.bitrix24.ru',
        );
        expect(keys.failures(DOMAIN, ROP_SETUP_SCOPE)).toBe(
            'event-sales:period-digest:failed:setup:gsr.bitrix24.ru',
        );
        expect(keys.task(DOMAIN, ROP_PERIOD_KIND.week, 11)).toBe(
            'event-sales:period-digest:task:week:gsr.bitrix24.ru:11',
        );
        expect(keys.recipients(DOMAIN, ROP_PERIOD_KIND.week)).toBe(
            'event-sales:period-digest:recipients:week:gsr.bitrix24.ru',
        );
        expect(keys.lastRun(DOMAIN, ROP_PERIOD_KIND.month)).toBe(
            'event-sales:period-digest:last-run:month:gsr.bitrix24.ru',
        );
    });

    it('пустой префикс или с пробелом — ошибка, а не общие ключи всех отчётов', () => {
        expect(() => ropKeys('')).toThrow(RangeError);
        expect(() => ropKeys('event sales')).toThrow(RangeError);
    });

    it('сроки меток и памяти заданы для каждого вида и длиннее периода', () => {
        const day = 24 * 60 * 60;
        for (const kind of ROP_PERIOD_KINDS) {
            expect(ROP_MARK_TTL_SEC[kind]).toBeGreaterThan(7 * day);
            expect(ROP_TASK_TTL_SEC[kind]).toBeGreaterThan(
                ROP_MARK_TTL_SEC[ROP_PERIOD_KIND.week],
            );
        }
        expect(ROP_MARK_TTL_SEC.month).toBeGreaterThan(31 * day);
    });
});
