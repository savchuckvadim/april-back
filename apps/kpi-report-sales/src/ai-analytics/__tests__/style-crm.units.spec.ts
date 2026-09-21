import {
    BX_VOX_CALL_TYPES,
    type BxVoximplantStatisticRow,
} from '@lib/bitrix/domain/telephony';
import { AI_ANALYTICS_PARAM_DEFAULTS } from '@lib/sales-ai-analytics';
import {
    daysRange,
    workingMinutesBetween,
} from '../domain/loaders/style-crm.dates.util';
import {
    attemptsPerLead,
    callsPerWorkday,
    conversationDurationsByType,
    dispersionIndex,
    giveUpCounts,
    leadResponseMinutes,
    median,
    medianDurationByType,
    promiseCounts,
    rhythmContributions,
    STYLE_CRM_CALL_TYPE_KEYS,
    STYLE_CRM_THRESHOLDS,
    voxCallTypeKey,
    workdayDeadline,
} from '../domain/loaders/style-crm.units';

/** Строка телефонии: по умолчанию исходящий недозвон к лиду 1. */
function call(
    fields: Partial<BxVoximplantStatisticRow> = {},
): BxVoximplantStatisticRow {
    return {
        PORTAL_USER_ID: '7',
        CALL_TYPE: '1',
        CALL_DURATION: '0',
        CALL_FAILED_CODE: '603-S',
        CALL_START_DATE: '2026-08-03T10:00:00+03:00',
        CRM_ENTITY_TYPE: 'LEAD',
        CRM_ENTITY_ID: '1',
        ...fields,
    };
}

const talk = (fields: Partial<BxVoximplantStatisticRow> = {}) =>
    call({ CALL_DURATION: '120', CALL_FAILED_CODE: '200', ...fields });

const WORKDAYS = ['2026-08-03', '2026-08-04', '2026-08-05', '2026-08-06'];

describe('median', () => {
    it('нечётная длина — середина, чётная — среднее двух средних', () => {
        expect(median([3, 1, 2])).toBe(2);
        expect(median([4, 1, 3, 2])).toBe(2.5);
        expect(median([])).toBeNull();
    });
});

describe('attemptsPerLead', () => {
    it('считает попытки до первого разговора по каждой сущности', () => {
        const rows = [
            call({ CALL_START_DATE: '2026-08-03T10:00:00+03:00' }),
            call({ CALL_START_DATE: '2026-08-03T12:00:00+03:00' }),
            talk({ CALL_START_DATE: '2026-08-04T09:00:00+03:00' }),
            call({
                CRM_ENTITY_ID: '2',
                CALL_START_DATE: '2026-08-03T11:00:00+03:00',
            }),
        ];

        // Лид 1 — разговор с третьей попытки; лид 2 — так и не дозвонились
        // (одна попытка).
        expect(
            attemptsPerLead(rows, STYLE_CRM_THRESHOLDS.conversationMinSec).sort(
                (a, b) => a - b,
            ),
        ).toEqual([1, 3]);
    });

    it('короткий разговор (< 30 с) разговором не считается', () => {
        const rows = [
            call({ CALL_START_DATE: '2026-08-03T10:00:00+03:00' }),
            talk({
                CALL_DURATION: '12',
                CALL_START_DATE: '2026-08-03T11:00:00+03:00',
            }),
            talk({ CALL_START_DATE: '2026-08-03T12:00:00+03:00' }),
        ];

        expect(
            attemptsPerLead(rows, STYLE_CRM_THRESHOLDS.conversationMinSec),
        ).toEqual([3]);
    });

    it('сущность с входящим до первого исходящего в знаменатель не идёт', () => {
        const rows = [
            call({
                CALL_TYPE: '2',
                CALL_START_DATE: '2026-08-03T09:00:00+03:00',
            }),
            call({ CALL_START_DATE: '2026-08-03T10:00:00+03:00' }),
        ];

        expect(
            attemptsPerLead(rows, STYLE_CRM_THRESHOLDS.conversationMinSec),
        ).toEqual([]);
    });
});

describe('giveUpCounts / workdayDeadline', () => {
    it('дедлайн второй попытки — три рабочих дня после первой', () => {
        expect(workdayDeadline('2026-08-03', WORKDAYS, 3)).toBe('2026-08-06');
        // Календарь короче трёх дней — граница окна.
        expect(workdayDeadline('2026-08-05', WORKDAYS, 3)).toBe('2026-08-06');
    });

    it('без второй попытки в срок — giveUp; повтор в срок не считается', () => {
        const rows = [
            call({
                CRM_ENTITY_ID: '1',
                CALL_START_DATE: '2026-08-03T10:00:00+03:00',
            }),
            call({
                CRM_ENTITY_ID: '2',
                CALL_START_DATE: '2026-08-03T10:00:00+03:00',
            }),
            call({
                CRM_ENTITY_ID: '2',
                CALL_START_DATE: '2026-08-04T10:00:00+03:00',
            }),
            talk({
                CRM_ENTITY_ID: '3',
                CALL_START_DATE: '2026-08-03T10:00:00+03:00',
            }),
        ];

        // Лид 3 дозвонился с первой попытки — событием не является.
        expect(giveUpCounts(rows, WORKDAYS, STYLE_CRM_THRESHOLDS)).toEqual({
            events: 2,
            giveUps: 1,
        });
    });

    it('сущность с входящим до первого исходящего событием не является', () => {
        const rows = [
            call({
                CALL_TYPE: '2',
                CALL_START_DATE: '2026-08-03T09:00:00+03:00',
            }),
            call({ CALL_START_DATE: '2026-08-03T10:00:00+03:00' }),
        ];

        // Знаменатель тот же, что у attemptsPerLead: входящее обращение
        // из оси «повторные касания» исключено (документ §2.1, ось 4).
        expect(
            attemptsPerLead(rows, STYLE_CRM_THRESHOLDS.conversationMinSec),
        ).toEqual([]);
        expect(giveUpCounts(rows, WORKDAYS, STYLE_CRM_THRESHOLDS)).toEqual({
            events: 0,
            giveUps: 0,
        });
    });
});

describe('callsPerWorkday, dispersionIndex, rhythmContributions', () => {
    const daily = [4, 0, 8, 4];

    it('дни без звонков дают ноль, короткие звонки не считаются', () => {
        const rows = [
            call({
                CALL_DURATION: '90',
                CALL_START_DATE: '2026-08-03T10:00:00+03:00',
            }),
            call({
                CALL_DURATION: '30',
                CALL_START_DATE: '2026-08-03T11:00:00+03:00',
            }),
            call({
                CALL_TYPE: '2',
                CALL_DURATION: '300',
                CALL_START_DATE: '2026-08-04T11:00:00+03:00',
            }),
        ];

        expect(
            callsPerWorkday(rows, WORKDAYS, STYLE_CRM_THRESHOLDS.tempoMinSec),
        ).toEqual([1, 0, 0, 0]);
    });

    it('индекс дисперсии — Var/mean − 1 по выборочной дисперсии', () => {
        const mean = 4;
        const variance = (0 + 16 + 16 + 0) / 3;
        expect(dispersionIndex(daily, 4)).toBeCloseTo(variance / mean - 1, 12);
        expect(dispersionIndex(daily, 15)).toBeNull();
    });

    it('среднее вкладов дня равно −Var/mean (декомпозиция индекса)', () => {
        const contributions = rhythmContributions(daily);
        const mean =
            contributions.reduce((sum, value) => sum + value, 0) /
            contributions.length;
        const index = dispersionIndex(daily, 4);

        expect(index).not.toBeNull();
        expect(mean).toBeCloseTo(-((index as number) + 1), 12);
    });
});

describe('promiseCounts', () => {
    it('выполнено — звонок той же сущности в ±2 дня от обещанной даты', () => {
        const rows = [
            call({
                CRM_ENTITY_ID: '1',
                CALL_START_DATE: '2026-08-06T10:00:00+03:00',
            }),
            call({
                CRM_ENTITY_ID: '9',
                CALL_START_DATE: '2026-08-04T10:00:00+03:00',
            }),
        ];
        const promises = [
            { managerId: '7', entityKey: 'LEAD:1', date: '2026-08-04' },
            { managerId: '7', entityKey: 'LEAD:2', date: '2026-08-04' },
        ];

        expect(
            promiseCounts(
                promises,
                rows,
                STYLE_CRM_THRESHOLDS.promiseWindowDays,
            ),
        ).toEqual({ promises: 2, kept: 1 });
    });
});

describe('leadResponseMinutes / workingMinutesBetween', () => {
    it('нерабочие сутки между лидом и звонком вычитаются целиком', () => {
        // 07.08 (пт) 18:00 → 10.08 (пн) 10:00 = 64 ч, минус суббота и
        // воскресенье целиком = 16 ч = 960 минут.
        expect(
            workingMinutesBetween(
                '2026-08-07T18:00:00+03:00',
                '2026-08-10T10:00:00+03:00',
                ['2026-08-07', '2026-08-10'],
            ),
        ).toBe(960);
    });

    it('лид без исходящего звонка в ряд не попадает', () => {
        const leads = [
            { id: '1', managerId: '7', createdAt: '2026-08-03T09:00:00+03:00' },
            { id: '5', managerId: '7', createdAt: '2026-08-03T09:00:00+03:00' },
        ];
        const rows = [
            call({
                CRM_ENTITY_ID: '1',
                CALL_START_DATE: '2026-08-03T09:30:00+03:00',
            }),
        ];

        expect(leadResponseMinutes(leads, rows, WORKDAYS)).toEqual([30]);
    });
});

describe('daysRange', () => {
    it('включает обе границы, перевёрнутый интервал — пусто', () => {
        expect(daysRange('2026-08-30', '2026-09-01')).toEqual([
            '2026-08-30',
            '2026-08-31',
            '2026-09-01',
        ]);
        expect(daysRange('2026-09-01', '2026-08-30')).toEqual([]);
    });
});

describe('medianDurationByType — медиана разговоров по типам телефонии (§7.2 п. 1)', () => {
    it('порог дисперсии — дефолт реестра style_dispersion_min_days', () => {
        expect(STYLE_CRM_THRESHOLDS.dispersionMinDays).toBe(
            AI_ANALYTICS_PARAM_DEFAULTS.style_dispersion_min_days,
        );
        expect(STYLE_CRM_THRESHOLDS.dispersionMinDays).toBe(15);
    });

    it('имена типов — ровно ключи BX_VOX_CALL_TYPES библиотеки', () => {
        expect([...STYLE_CRM_CALL_TYPE_KEYS].sort()).toEqual(
            Object.keys(BX_VOX_CALL_TYPES).sort(),
        );
        expect(voxCallTypeKey(call({ CALL_TYPE: '1' }))).toBe('outgoing');
        expect(voxCallTypeKey(call({ CALL_TYPE: '2' }))).toBe('incoming');
        expect(voxCallTypeKey(call({ CALL_TYPE: 3 }))).toBe('incomingRedirect');
        expect(voxCallTypeKey(call({ CALL_TYPE: '4' }))).toBe('callback');
        expect(voxCallTypeKey(call({ CALL_TYPE: '9' }))).toBeNull();
    });

    it('в ряды идут только состоявшиеся разговоры не короче порога, по своему типу', () => {
        const rows = [
            talk({ CALL_DURATION: '120' }),
            talk({ CALL_DURATION: '300' }),
            talk({ CALL_DURATION: '12' }),
            call({ CALL_DURATION: '500', CALL_FAILED_CODE: '486' }),
            talk({ CALL_TYPE: '2', CALL_DURATION: '90' }),
            talk({ CALL_TYPE: '2', CALL_DURATION: '30' }),
            talk({ CALL_TYPE: '4', CALL_DURATION: '45' }),
        ];

        const durations = conversationDurationsByType(
            rows,
            STYLE_CRM_THRESHOLDS.conversationMinSec,
        );

        expect(durations).toEqual({
            outgoing: [120, 300],
            incoming: [90, 30],
            incomingRedirect: [],
            callback: [45],
        });
    });

    it('медианы по типам и общая — по формуле медианы, пустой тип → null', () => {
        const result = medianDurationByType({
            outgoing: [120, 300],
            incoming: [90, 30],
            incomingRedirect: [],
            callback: [45],
        });

        expect(result.byType).toEqual({
            outgoing: (120 + 300) / 2,
            incoming: (90 + 30) / 2,
            incomingRedirect: null,
            callback: 45,
        });
        // Общая — медиана объединённой выборки [30, 45, 90, 120, 300].
        expect(result.all).toBe(90);
        expect(
            medianDurationByType({
                outgoing: [],
                incoming: [],
                incomingRedirect: [],
                callback: [],
            }).all,
        ).toBeNull();
    });
});
