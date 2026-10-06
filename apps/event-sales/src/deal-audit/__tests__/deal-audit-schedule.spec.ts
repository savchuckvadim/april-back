import { ETimeZone } from '@lib/shared/lib/date';
import {
    DEAL_AUDIT_FREQUENCY,
    DealAuditFrequency,
    dealAuditPeriodKey,
    isDealAuditDue,
    isDealAuditNight,
    parseDealAuditFrequency,
} from '../lib/deal-audit-schedule';

/**
 * Календарь аудита (решение владельца, 05.10.2026): раз в неделю или раз в
 * месяц и только ночью по часам портала. Раньше старт сползал на полчаса в
 * сутки и попадал в рабочий день.
 */

const MSK = ETimeZone.EUROPE_MOSCOW;
const IRKUTSK = ETimeZone.ASIA_IRKUTSK;

/** Момент по московскому времени (UTC+3). */
const msk = (iso: string): Date => new Date(`${iso}+03:00`);

const weekly = DEAL_AUDIT_FREQUENCY.weekly;
const monthly = DEAL_AUDIT_FREQUENCY.monthly;

describe('ночное окно аудита', () => {
    it('с часу ночи до шести утра по часам портала', () => {
        expect(isDealAuditNight(msk('2026-10-05T00:59:00'), MSK)).toBe(false);
        expect(isDealAuditNight(msk('2026-10-05T01:00:00'), MSK)).toBe(true);
        expect(isDealAuditNight(msk('2026-10-05T05:59:00'), MSK)).toBe(true);
        expect(isDealAuditNight(msk('2026-10-05T06:00:00'), MSK)).toBe(false);
        expect(isDealAuditNight(msk('2026-10-05T14:30:00'), MSK)).toBe(false);
    });

    it('считается по таймзоне портала, а не сервера', () => {
        // 23:30 по Москве — в Иркутске (UTC+8) уже 04:30 следующего дня.
        const moment = msk('2026-10-04T23:30:00');

        expect(isDealAuditNight(moment, MSK)).toBe(false);
        expect(isDealAuditNight(moment, IRKUTSK)).toBe(true);
    });
});

describe('период аудита', () => {
    it('неделя — её понедельник, одинаковый с понедельника по воскресенье', () => {
        expect(
            dealAuditPeriodKey(msk('2026-10-05T03:00:00'), MSK, weekly),
        ).toBe('w:2026-10-05');
        expect(
            dealAuditPeriodKey(msk('2026-10-08T12:00:00'), MSK, weekly),
        ).toBe('w:2026-10-05');
        expect(
            dealAuditPeriodKey(msk('2026-10-11T23:59:00'), MSK, weekly),
        ).toBe('w:2026-10-05');
        expect(
            dealAuditPeriodKey(msk('2026-10-12T00:10:00'), MSK, weekly),
        ).toBe('w:2026-10-12');
    });

    it('месяц — год и месяц по календарю портала', () => {
        expect(
            dealAuditPeriodKey(msk('2026-10-31T23:00:00'), MSK, monthly),
        ).toBe('m:2026-10');
        expect(
            dealAuditPeriodKey(msk('2026-11-01T02:00:00'), MSK, monthly),
        ).toBe('m:2026-11');
    });

    it('граница суток — по таймзоне портала', () => {
        // Воскресенье 23:30 в Москве — в Иркутске уже понедельник.
        const moment = msk('2026-10-11T23:30:00');

        expect(dealAuditPeriodKey(moment, MSK, weekly)).toBe('w:2026-10-05');
        expect(dealAuditPeriodKey(moment, IRKUTSK, weekly)).toBe(
            'w:2026-10-12',
        );
    });
});

describe('пора ли прогонять портал', () => {
    const due = (
        iso: string,
        lastPeriodKey: string | null,
        frequency: DealAuditFrequency = weekly,
    ) => isDealAuditDue({ now: msk(iso), tz: MSK, frequency, lastPeriodKey });

    it('ночь на понедельник, неделя ещё не отработана — пора', () => {
        expect(due('2026-10-12T01:30:00', 'w:2026-10-05')).toBe(true);
    });

    it('в ту же ночь второй раз не запускается', () => {
        expect(due('2026-10-12T02:00:00', 'w:2026-10-12')).toBe(false);
    });

    it('днём не запускается никогда, даже если неделя не отработана', () => {
        expect(due('2026-10-12T10:00:00', 'w:2026-10-05')).toBe(false);
        expect(due('2026-10-12T18:30:00', null)).toBe(false);
    });

    it('остаток недели после прогона — тишина, включая следующие ночи', () => {
        expect(due('2026-10-13T03:00:00', 'w:2026-10-12')).toBe(false);
        expect(due('2026-10-18T03:00:00', 'w:2026-10-12')).toBe(false);
    });

    it('ночь понедельника пропущена (сервер лежал) — догоняет в ближайшую ночь', () => {
        expect(due('2026-10-13T01:10:00', 'w:2026-10-05')).toBe(true);
    });

    it('аудит только что включили — первый прогон ближайшей ночью', () => {
        expect(due('2026-10-07T04:00:00', null)).toBe(true);
    });

    it('раз в месяц: ночь на первое число — пора, остальные ночи месяца — нет', () => {
        expect(due('2026-11-01T02:00:00', 'm:2026-10', monthly)).toBe(true);
        expect(due('2026-11-02T02:00:00', 'm:2026-11', monthly)).toBe(false);
        expect(due('2026-11-30T02:00:00', 'm:2026-11', monthly)).toBe(false);
    });

    it('сменили частоту — старый ключ не совпадает, прогон уйдёт ближайшей ночью', () => {
        expect(due('2026-10-14T02:00:00', 'w:2026-10-12', monthly)).toBe(true);
    });
});

describe('значение настройки частоты', () => {
    it('раз в месяц — только явное значение, всё остальное — раз в неделю', () => {
        expect(parseDealAuditFrequency('monthly')).toBe(monthly);
        expect(parseDealAuditFrequency('weekly')).toBe(weekly);
        expect(parseDealAuditFrequency('')).toBe(weekly);
        expect(parseDealAuditFrequency(undefined)).toBe(weekly);
        expect(parseDealAuditFrequency(1440)).toBe(weekly);
    });
});
