import {
    AI_ANALYTICS_ROP_MARK_TYPE,
    AI_ANALYTICS_SETTINGS_AUDIT_TYPE,
    AI_ANALYTICS_SNAPSHOT_GRAINS,
    AI_ANALYTICS_SNAPSHOT_TYPE,
    AI_ANALYTICS_SNAPSHOT_TYPES,
    AI_ANALYTICS_SNAPSHOT_WINDOW_LIMIT,
    isAiAnalyticsSnapshotType,
    isManagerGrain,
} from '../contracts/snapshot-kinds.const';
import {
    AI_ANALYTICS_SNAPSHOT_DESCRIPTORS,
    snapshotGrain,
    snapshotRetention,
} from '../contracts/snapshot-descriptors.const';
import {
    isSnapshotMeta,
    parseSnapshotMeta,
    parseSnapshotPayload,
    parseSnapshotUserResult,
    SnapshotUserResult,
} from '../contracts/snapshot.parse';
import type { AiSnapshotMeta } from '../contracts/snapshot.types';
import * as publicApi from '../index';

interface WeekPayload {
    n: number;
}

const isWeekPayload = (value: unknown): value is WeekPayload =>
    typeof value === 'object' &&
    value !== null &&
    typeof (value as WeekPayload).n === 'number';

const META: AiSnapshotMeta = {
    calcVersion: 'sam-2.0.0',
    paramsVersion: 'params-3',
    comparableFrom: '2026-08-24',
    generatedAt: '2026-09-07T01:45:00.000Z',
    modelSnapshotId: '4242',
};

function userResult(
    overrides: Partial<SnapshotUserResult> = {},
): SnapshotUserResult<WeekPayload> {
    return {
        managerId: '10',
        paramsVersion: 'params-3',
        inputsHash: 'a1b2c3d4',
        generatedAt: '2026-09-07T01:45:00.000Z',
        payload: { n: 7 },
        ...overrides,
    } as SnapshotUserResult<WeekPayload>;
}

describe('реестр типов снапшотов (snapshot-kinds / descriptors)', () => {
    it('аудит настроек и подбор недели — в реестре, plan остаётся', () => {
        expect(AI_ANALYTICS_SNAPSHOT_TYPE.settingsAudit).toBe(
            'ai-analytics-settings-audit',
        );
        expect(AI_ANALYTICS_SNAPSHOT_TYPE.ropMark).toBe(
            'ai-analytics-rop-mark',
        );
        expect(AI_ANALYTICS_SNAPSHOT_TYPE.plan).toBe('ai-analytics-plan');
        expect(AI_ANALYTICS_SNAPSHOT_TYPES).toContain(
            AI_ANALYTICS_SETTINGS_AUDIT_TYPE,
        );
        expect(AI_ANALYTICS_SNAPSHOT_TYPES).toContain(
            AI_ANALYTICS_ROP_MARK_TYPE,
        );
        expect(isAiAnalyticsSnapshotType('ai-analytics-settings-audit')).toBe(
            true,
        );
        expect(isAiAnalyticsSnapshotType('ai-analytics-rop-mark')).toBe(true);
        expect(isAiAnalyticsSnapshotType('ai-analytics-unknown')).toBe(false);
        expect(new Set(AI_ANALYTICS_SNAPSHOT_TYPES).size).toBe(
            AI_ANALYTICS_SNAPSHOT_TYPES.length,
        );
    });

    it('у каждого типа реестра есть дескриптор с зерном из списка зёрен', () => {
        expect(Object.keys(AI_ANALYTICS_SNAPSHOT_DESCRIPTORS).sort()).toEqual(
            [...AI_ANALYTICS_SNAPSHOT_TYPES].sort(),
        );
        for (const type of AI_ANALYTICS_SNAPSHOT_TYPES) {
            expect(AI_ANALYTICS_SNAPSHOT_DESCRIPTORS[type].type).toBe(type);
            expect(AI_ANALYTICS_SNAPSHOT_GRAINS).toContain(snapshotGrain(type));
        }
    });

    it('подбор недели — портальное недельное зерно, аудит настроек — день; оба бессрочны', () => {
        expect(snapshotGrain(AI_ANALYTICS_SNAPSHOT_TYPE.ropMark)).toBe(
            'portal-week',
        );
        expect(isManagerGrain('portal-week')).toBe(false);
        expect(snapshotGrain(AI_ANALYTICS_SNAPSHOT_TYPE.settingsAudit)).toBe(
            'portal-day',
        );
        expect(snapshotRetention(AI_ANALYTICS_SNAPSHOT_TYPE.ropMark)).toEqual({
            unit: 'forever',
            value: null,
        });
        expect(
            snapshotRetention(AI_ANALYTICS_SNAPSHOT_TYPE.settingsAudit),
        ).toEqual({ unit: 'forever', value: null });
    });

    it('публичный API библиотеки отдаёт реестр, дескрипторы и разбор', () => {
        expect(publicApi.AI_ANALYTICS_SNAPSHOT_DESCRIPTORS).toBe(
            AI_ANALYTICS_SNAPSHOT_DESCRIPTORS,
        );
        expect(publicApi.snapshotGrain).toBe(snapshotGrain);
        expect(publicApi.parseSnapshotPayload).toBe(parseSnapshotPayload);
        expect(publicApi.parseSnapshotMeta).toBe(parseSnapshotMeta);
        expect(publicApi.AI_ANALYTICS_SNAPSHOT_WINDOW_LIMIT).toBe(
            AI_ANALYTICS_SNAPSHOT_WINDOW_LIMIT,
        );
        expect(Number.isInteger(AI_ANALYTICS_SNAPSHOT_WINDOW_LIMIT)).toBe(true);
        expect(AI_ANALYTICS_SNAPSHOT_WINDOW_LIMIT).toBeGreaterThan(0);
    });
});

describe('parseSnapshotUserResult (конверт в user_result)', () => {
    it('валидный user_result восстанавливается целиком', () => {
        expect(parseSnapshotUserResult(userResult())).toEqual(userResult());
        expect(
            parseSnapshotUserResult(userResult({ managerId: null })),
        ).toEqual(userResult({ managerId: null }));
        // Пустые версии допустимы (журнал сбоя контекста конвейера).
        expect(
            parseSnapshotUserResult(
                userResult({ paramsVersion: '', inputsHash: '' }),
            )?.paramsVersion,
        ).toBe('');
    });

    it('чужая форма → null, без исключений', () => {
        const broken: unknown[] = [
            null,
            'строка',
            42,
            [userResult()],
            { ...userResult(), paramsVersion: 3 },
            { ...userResult(), inputsHash: null },
            { ...userResult(), generatedAt: '' },
            { ...userResult(), payload: null },
            { kind: 'settings-audit', changed: [], author: '1' },
            { weekKey: '2026-W36', seed: 1, calls: [] },
        ];
        for (const value of broken) {
            expect(parseSnapshotUserResult(value)).toBeNull();
        }
        // Пустой managerId — не менеджер: он приводится к null.
        expect(parseSnapshotUserResult(userResult({ managerId: '' }))).toEqual(
            userResult({ managerId: null }),
        );
    });
});

describe('parseSnapshotPayload (единственный вход чтения записей ais)', () => {
    it('для каждого типа реестра чужая форма user_result → null', () => {
        for (const type of AI_ANALYTICS_SNAPSHOT_TYPES) {
            expect(
                parseSnapshotPayload(
                    {
                        type,
                        user_result: { kind: 'foreign', payload: { n: 1 } },
                    },
                    isWeekPayload,
                ),
            ).toBeNull();
            expect(
                parseSnapshotPayload(
                    { type, user_result: null },
                    isWeekPayload,
                ),
            ).toBeNull();
        }
    });

    it('валидная запись отдаёт нагрузку, прошедшую guard', () => {
        const record = {
            type: AI_ANALYTICS_SNAPSHOT_TYPE.managerWeek,
            user_result: userResult(),
        };
        expect(parseSnapshotPayload(record, isWeekPayload)).toEqual({ n: 7 });
        expect(
            parseSnapshotPayload(
                record,
                isWeekPayload,
                AI_ANALYTICS_SNAPSHOT_TYPE.managerWeek,
            ),
        ).toEqual({ n: 7 });
    });

    it('нагрузка не по guard, чужой или неожиданный тип → null', () => {
        const record = {
            type: AI_ANALYTICS_SNAPSHOT_TYPE.managerWeek,
            user_result: userResult(),
        };
        expect(
            parseSnapshotPayload(
                record,
                (value: unknown): value is { text: string } =>
                    typeof (value as { text?: unknown }).text === 'string',
            ),
        ).toBeNull();
        expect(
            parseSnapshotPayload(
                record,
                isWeekPayload,
                AI_ANALYTICS_SNAPSHOT_TYPE.managerMonth,
            ),
        ).toBeNull();
        expect(
            parseSnapshotPayload(
                { type: 'ai-analytics-unknown', user_result: userResult() },
                isWeekPayload,
            ),
        ).toBeNull();
        expect(
            parseSnapshotPayload({ user_result: userResult() }, isWeekPayload),
        ).toBeNull();
    });
});

describe('parseSnapshotMeta (версии расчёта с modelSnapshotId)', () => {
    it('meta с id модели и без неё восстанавливается', () => {
        expect(parseSnapshotMeta(META)).toEqual(META);
        expect(
            parseSnapshotMeta({
                ...META,
                modelSnapshotId: null,
                comparableFrom: null,
            }),
        ).toEqual({ ...META, modelSnapshotId: null, comparableFrom: null });
        // Лишние поля не мешают и в результат не попадают.
        expect(parseSnapshotMeta({ ...META, extra: 1 })).toEqual(META);
        expect(isSnapshotMeta(META)).toBe(true);
    });

    it('без modelSnapshotId / comparableFrom или с чужими типами → null', () => {
        const omit = (field: keyof AiSnapshotMeta): Record<string, unknown> => {
            const copy: Record<string, unknown> = { ...META };
            delete copy[field];
            return copy;
        };
        const broken: unknown[] = [
            null,
            omit('modelSnapshotId'),
            omit('comparableFrom'),
            { ...META, modelSnapshotId: 4242 },
            { ...META, comparableFrom: 20260824 },
            { ...META, calcVersion: null },
            { ...META, generatedAt: '' },
        ];
        for (const value of broken) {
            expect(parseSnapshotMeta(value)).toBeNull();
            expect(isSnapshotMeta(value)).toBe(false);
        }
    });
});
