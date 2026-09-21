import type { BxVoximplantStatisticRow } from '@lib/bitrix/domain/telephony';
import {
    buildManagerCounters,
    buildMonthCounters,
    mergeManagerMonths,
} from '../domain/loaders/style-crm.calc';
import {
    dispersionIndex,
    median,
    STYLE_CRM_THRESHOLDS,
} from '../domain/loaders/style-crm.units';
import type { StyleCrmManagerMonth } from '../domain/loaders/style-crm.types';

/**
 * Склейка сегментов окна стиля (долги 31 и 33 волны C): медианы окна —
 * по объединённым выборкам сегментов, а не среднее медиан; порог индекса
 * дисперсии приходит параметром и применяется к дням всего окна.
 */

/** Строка телефонии: исходящий разговор менеджера 7 по лиду. */
function talk(
    day: string,
    durationSec: number,
    fields: Partial<BxVoximplantStatisticRow> = {},
): BxVoximplantStatisticRow {
    return {
        PORTAL_USER_ID: '7',
        CALL_TYPE: '1',
        CALL_DURATION: String(durationSec),
        CALL_FAILED_CODE: '200',
        CALL_START_DATE: `${day}T10:00:00+03:00`,
        CRM_ENTITY_TYPE: 'LEAD',
        CRM_ENTITY_ID: '1',
        ...fields,
    };
}

const AUGUST = ['2026-08-03', '2026-08-04', '2026-08-05'];
const SEPTEMBER = ['2026-09-01', '2026-09-02', '2026-09-03'];

const input = (workdays: readonly string[]) => ({
    workdays,
    leads: [],
    promises: [],
    thresholds: STYLE_CRM_THRESHOLDS,
});

describe('buildManagerCounters — ряды под-осей и медианы по типам', () => {
    it('длительности по типам и скорость ответа хранятся рядами, медианы — по ним', () => {
        const rows = [
            talk('2026-08-03', 120),
            talk('2026-08-04', 300),
            talk('2026-08-05', 90, { CALL_TYPE: '2', CRM_ENTITY_ID: '2' }),
            talk('2026-08-05', 12),
        ];
        const leads = [
            { id: '1', managerId: '7', createdAt: '2026-08-03T09:00:00+03:00' },
        ];

        const counters = buildManagerCounters('7', rows, {
            ...input(AUGUST),
            leads,
        });

        expect(counters.units.conversationSecByType).toEqual({
            outgoing: [120, 300],
            incoming: [90],
            incomingRedirect: [],
            callback: [],
        });
        expect(counters.conversationSecMedianByType).toEqual({
            outgoing: 210,
            incoming: 90,
            incomingRedirect: null,
            callback: null,
        });
        expect(counters.conversationSecMedian).toBe(median([120, 300, 90]));
        // Лид создан в 09:00, первый исходящий по нему — в 10:00.
        expect(counters.units.leadResponseMin).toEqual([60]);
        expect(counters.leadResponseMinMedian).toBe(60);
    });
});

describe('mergeManagerMonths — точная склейка окна', () => {
    const august = buildMonthCounters(
        ['7'],
        [talk('2026-08-03', 100), talk('2026-08-04', 200)],
        input(AUGUST),
    );
    const september = buildMonthCounters(
        ['7'],
        [
            talk('2026-09-01', 1000),
            talk('2026-09-02', 1100),
            talk('2026-09-03', 1200),
        ],
        input(SEPTEMBER),
    );

    it('медиана окна — медиана объединённой выборки, а не среднее медиан', () => {
        const [merged] = mergeManagerMonths([august, september]);

        expect(merged.units.conversationSecByType.outgoing).toEqual([
            100, 200, 1000, 1100, 1200,
        ]);
        expect(merged.conversationSecMedian).toBe(1000);
        expect(merged.conversationSecMedianByType.outgoing).toBe(1000);
        // Среднее медиан сегментов дало бы (150 + 1100) / 2 = 625.
        expect(merged.conversationSecMedian).not.toBe(
            ((august[0].conversationSecMedian ?? 0) +
                (september[0].conversationSecMedian ?? 0)) /
                2,
        );
        expect(merged.calls).toBe(5);
        expect(merged.workdays).toBe(6);
        expect(merged.units.callsPerWorkday).toEqual([1, 1, 0, 1, 1, 1]);
    });

    it('порог дисперсии приходит параметром и применяется к дням окна', () => {
        const daily = [1, 1, 0, 1, 1, 1];
        const [strict] = mergeManagerMonths([august, september]);
        const [loose] = mergeManagerMonths([august, september], {
            ...STYLE_CRM_THRESHOLDS,
            dispersionMinDays: 6,
        });

        // Дефолт реестра (15 рабочих дней) для шести дней — null.
        expect(strict.dispersionIndex).toBeNull();
        expect(loose.dispersionIndex).toBe(dispersionIndex(daily, 6));
        expect(loose.dispersionIndex).not.toBeNull();
    });

    it('один сегмент — агрегаты пересчитаны из его же рядов (кэш не старше порога)', () => {
        const cached: StyleCrmManagerMonth = {
            ...september[0],
            // Сегмент из кэша, посчитанный при другом пороге дисперсии.
            dispersionIndex: 0.42,
        };
        const [merged] = mergeManagerMonths([[cached]], {
            ...STYLE_CRM_THRESHOLDS,
            dispersionMinDays: 3,
        });

        expect(merged.dispersionIndex).toBe(
            dispersionIndex(september[0].units.callsPerWorkday, 3),
        );
        expect(merged.conversationSecMedian).toBe(
            september[0].conversationSecMedian,
        );
        expect(merged.units).toEqual(september[0].units);
    });

    it('доля входящих взвешивается по звонкам сегментов', () => {
        const withIncoming = buildMonthCounters(
            ['7'],
            [
                talk('2026-08-03', 100, { CALL_TYPE: '2' }),
                talk('2026-08-04', 100, { CALL_TYPE: '2' }),
            ],
            input(AUGUST),
        );
        const [merged] = mergeManagerMonths([withIncoming, september]);

        // 2 входящих из 5 звонков окна.
        expect(merged.incomingShare).toBeCloseTo(2 / 5, 9);
    });
});
