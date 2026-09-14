import {
    AI_ANALYTICS_SNAPSHOT_APP,
    AI_ANALYTICS_SNAPSHOT_PROVIDER,
    AI_ANALYTICS_SNAPSHOT_STATUS,
    AI_ANALYTICS_SNAPSHOT_TYPE,
    AI_ANALYTICS_SNAPSHOT_TYPES,
    AiAnalyticsSnapshotGrain,
    isManagerGrain,
    ManagerMonthSnapshot,
    SnapshotEnvelope,
    snapshotGrain,
} from '@lib/sales-ai-analytics';
import {
    AiSnapshotAisRecord,
    AiSnapshotRawRecord,
    fromAisRecord,
    isSnapshotPeriodKey,
    periodKeyOf,
    snapshotHashKey,
    snapshotManagerId,
    toAisRecord,
    toManagerUserId,
} from '../store/snapshot-serialize.util';

/** Ключ периода, валидный для каждого зерна. */
const KEY_SAMPLE: Record<AiAnalyticsSnapshotGrain, string> = {
    'manager-week': '2026-W36',
    'manager-month': '2026-09',
    'portal-week': '2026-W36',
    'portal-month': '2026-09',
    'manager-day': '2026-09-04',
    'portal-day': '2026-09-04',
    'portal-hash': snapshotHashKey(['d.bitrix24.ru', '2026-09']),
};

/** Колонки ais → запись в том виде, в каком её отдаёт AiEntityDto. */
function toRow(record: AiSnapshotAisRecord): AiSnapshotRawRecord {
    return {
        type: record.type,
        activity_id: record.activity_id,
        model: record.model,
        status: record.status,
        domain: record.domain,
        user_id: record.user_id ?? 0,
        user_result: JSON.parse(JSON.stringify(record.user_result)) as unknown,
    };
}

function envelopeOf(
    type: (typeof AI_ANALYTICS_SNAPSHOT_TYPES)[number],
): SnapshotEnvelope<{ n: number }> {
    const grain = snapshotGrain(type);
    return {
        domain: 'd.bitrix24.ru',
        type,
        periodKey: KEY_SAMPLE[grain],
        managerId: isManagerGrain(grain) ? '10' : null,
        calcVersion: 'sam-1.0.0',
        paramsVersion: 'params-1',
        inputsHash: 'a1b2c3d4',
        generatedAt: '2026-09-07T01:45:00.000Z',
        payload: { n: 7 },
    };
}

describe('snapshot-serialize.util (ais ↔ конверт снапшота)', () => {
    it('сериализация туда-обратно для каждого типа и зерна', () => {
        for (const type of AI_ANALYTICS_SNAPSHOT_TYPES) {
            const envelope = envelopeOf(type);
            const restored = fromAisRecord(toRow(toAisRecord(envelope)));
            expect(restored).toEqual(envelope);
        }
    });

    it('toAisRecord раскладывает конверт по колонкам ais', () => {
        const envelope = envelopeOf(AI_ANALYTICS_SNAPSHOT_TYPE.managerMonth);
        expect(toAisRecord(envelope)).toEqual({
            provider: AI_ANALYTICS_SNAPSHOT_PROVIDER,
            app: AI_ANALYTICS_SNAPSHOT_APP,
            type: AI_ANALYTICS_SNAPSHOT_TYPE.managerMonth,
            user_id: 10,
            activity_id: '2026-09',
            model: 'sam-1.0.0',
            status: AI_ANALYTICS_SNAPSHOT_STATUS.done,
            domain: 'd.bitrix24.ru',
            user_result: {
                managerId: '10',
                paramsVersion: 'params-1',
                inputsHash: 'a1b2c3d4',
                generatedAt: '2026-09-07T01:45:00.000Z',
                payload: { n: 7 },
            },
        });
    });

    it('портальное зерно теряет менеджера, нечисловой id не едет в user_id', () => {
        const portal = toAisRecord({
            ...envelopeOf(AI_ANALYTICS_SNAPSHOT_TYPE.portalModel),
            managerId: '10',
        });
        expect(portal.user_id).toBeNull();
        expect(portal.user_result.managerId).toBeNull();

        const manager = toAisRecord({
            ...envelopeOf(AI_ANALYTICS_SNAPSHOT_TYPE.managerWeek),
            managerId: 'bx-10',
        });
        expect(manager.user_id).toBeNull();
        expect(manager.user_result.managerId).toBe('bx-10');
    });

    it('менеджер восстанавливается из user_id, если его нет в user_result', () => {
        const record = toAisRecord(
            envelopeOf(AI_ANALYTICS_SNAPSHOT_TYPE.managerWeek),
        );
        const row = toRow(record);
        const userResult = row.user_result as Record<string, unknown>;
        delete userResult.managerId;
        expect(fromAisRecord(row)?.managerId).toBe('10');
    });

    it('битая запись → null, без исключений', () => {
        const record = toAisRecord(
            envelopeOf(AI_ANALYTICS_SNAPSHOT_TYPE.managerMonth),
        );
        const broken: AiSnapshotRawRecord[] = [
            { ...toRow(record), type: 'ai-analytics-unknown' },
            { ...toRow(record), domain: '' },
            { ...toRow(record), activity_id: '2026-W36' },
            { ...toRow(record), activity_id: '' },
            { ...toRow(record), status: 'processing' },
            { ...toRow(record), model: null },
            { ...toRow(record), user_result: null },
            { ...toRow(record), user_result: 'строка' },
            { ...toRow(record), user_result: { payload: { n: 1 } } },
            {
                ...toRow(record),
                user_result: {
                    managerId: '10',
                    paramsVersion: 'p',
                    inputsHash: 'h',
                    generatedAt: '2026-09-07T01:45:00.000Z',
                },
            },
            {
                ...toRow(record),
                user_id: 0,
                user_result: {
                    managerId: null,
                    paramsVersion: 'p',
                    inputsHash: 'h',
                    generatedAt: '2026-09-07T01:45:00.000Z',
                    payload: { n: 1 },
                },
            },
        ];
        for (const row of broken) expect(fromAisRecord(row)).toBeNull();
    });

    it('ключи периодов строятся по зерну и проверяются по нему же', () => {
        expect(periodKeyOf('manager-week', '2026-09-04')).toBe('2026-W36');
        expect(periodKeyOf('portal-week', '2026-09-04')).toBe('2026-W36');
        expect(periodKeyOf('manager-month', '2026-09-04')).toBe('2026-09');
        expect(periodKeyOf('portal-month', '2026-09-04')).toBe('2026-09');
        expect(periodKeyOf('manager-day', '2026-09-04')).toBe('2026-09-04');
        expect(periodKeyOf('portal-day', '2026-09-04')).toBe('2026-09-04');
        // Стык года: 2026 начинается с четверга, в нём 53 ISO-недели, и
        // пятница 1 января 2027 относится ещё к 2026-W53.
        expect(periodKeyOf('portal-week', '2027-01-01')).toBe('2026-W53');
        expect(periodKeyOf('manager-week', '2027-01-04')).toBe('2027-W01');

        expect(isSnapshotPeriodKey('manager-week', '2026-W36')).toBe(true);
        expect(isSnapshotPeriodKey('portal-week', '2026-W53')).toBe(true);
        expect(isSnapshotPeriodKey('portal-week', '2026-09-04')).toBe(false);
        expect(isSnapshotPeriodKey('manager-week', '2026-09')).toBe(false);
        expect(isSnapshotPeriodKey('portal-month', '2026-09-04')).toBe(false);
        expect(isSnapshotPeriodKey('portal-day', '2026-09-4')).toBe(false);
        expect(isSnapshotPeriodKey('portal-hash', 'levels')).toBe(true);
        expect(isSnapshotPeriodKey('portal-hash', 'ключ с пробелом')).toBe(
            false,
        );
    });

    it('snapshotHashKey детерминирован и зависит от всех частей', () => {
        const key = snapshotHashKey(['d', '2026-09', 'v1']);
        expect(key).toHaveLength(16);
        expect(key).toMatch(/^[0-9a-f]{16}$/);
        expect(snapshotHashKey(['d', '2026-09', 'v1'])).toBe(key);
        expect(snapshotHashKey(['d', '2026-09', 'v2'])).not.toBe(key);
    });

    it('snapshotManagerId: менеджер только у менеджерских зёрен', () => {
        expect(
            snapshotManagerId(AI_ANALYTICS_SNAPSHOT_TYPE.managerMonth, '10'),
        ).toBe('10');
        expect(
            snapshotManagerId(AI_ANALYTICS_SNAPSHOT_TYPE.portalModel, '10'),
        ).toBeNull();
        expect(
            snapshotManagerId(AI_ANALYTICS_SNAPSHOT_TYPE.ropMark, '10'),
        ).toBeNull();
        expect(
            snapshotManagerId(AI_ANALYTICS_SNAPSHOT_TYPE.settingsAudit, '10'),
        ).toBeNull();
    });

    it('новые типы реестра раскладываются по своим зёрнам', () => {
        const ropMark = toAisRecord({
            ...envelopeOf(AI_ANALYTICS_SNAPSHOT_TYPE.ropMark),
            periodKey: '2026-W53',
        });
        expect(ropMark.activity_id).toBe('2026-W53');
        expect(ropMark.user_id).toBeNull();
        expect(fromAisRecord(toRow(ropMark))?.type).toBe(
            AI_ANALYTICS_SNAPSHOT_TYPE.ropMark,
        );
        expect(
            fromAisRecord({ ...toRow(ropMark), activity_id: '2026-09' }),
        ).toBeNull();

        const audit = toAisRecord(
            envelopeOf(AI_ANALYTICS_SNAPSHOT_TYPE.settingsAudit),
        );
        expect(audit.activity_id).toBe('2026-09-04');
        expect(
            fromAisRecord({ ...toRow(audit), activity_id: '2026-W36' }),
        ).toBeNull();
    });

    it('toManagerUserId: только целый положительный id', () => {
        expect(toManagerUserId('10')).toBe(10);
        expect(toManagerUserId('0')).toBeNull();
        expect(toManagerUserId('-1')).toBeNull();
        expect(toManagerUserId('10.5')).toBeNull();
        expect(toManagerUserId('bx-10')).toBeNull();
        expect(toManagerUserId('')).toBeNull();
        expect(toManagerUserId(null)).toBeNull();
    });

    it('типизированная нагрузка месяца переживает раскладку по колонкам', () => {
        const payload: ManagerMonthSnapshot = {
            kpi: { call_done: 120, presentation_uniq_done: 18 },
            byType: [
                {
                    callType: 'presentation',
                    n: 18,
                    score: {
                        value: 7.4,
                        n: 18,
                        confidence: { level: 'low', reason: 'few-data' },
                    },
                },
            ],
            workdays: { calendar: 22, worked: 20, absences: 2 },
            finance: {
                salesSum: 480_000,
                salesCount: 4,
                invoicesSum: 900_000,
                invoicesCount: 9,
                averageCheck: 120_000,
            },
            edges: [{ edge: 'call_to_presentation', n: 120, s: 18 }],
            level: 'middle',
            levelSource: 'manual',
            frozen: false,
        };
        const envelope: SnapshotEnvelope<ManagerMonthSnapshot> = {
            ...envelopeOf(AI_ANALYTICS_SNAPSHOT_TYPE.managerMonth),
            payload,
        };
        expect(fromAisRecord(toRow(toAisRecord(envelope)))?.payload).toEqual(
            payload,
        );
    });
});
