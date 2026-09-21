import type { AnalyticsCallLiteRow, AnalyticsCallRow } from '@lib/call-lib';
import { mapLiteAnalysis } from '@lib/call-lib/call-report-analytics/lib/analytics-lite.mapper';

/**
 * Фикстура контрактной спеки обзора (аудит M18): один набор «сырых»
 * звонков с `user_result` разбора, из которого строятся И полная строка
 * легаси-аналитики (`AnalyticsCallRow`), И лёгкая строка витрины
 * (`AnalyticsCallLiteRow`) — той же проекцией `mapLiteAnalysis`, что и
 * `loadLite` в call-lib. Обе ручки считают одни и те же звонки.
 */
export const CONTRACT_DOMAIN = 'april.bitrix24.ru';
export const CONTRACT_FROM = '2026-08-01';
export const CONTRACT_TO = '2026-08-31';
/** Понедельник 07.09.2026 12:00 МСК — август закрыт. */
export const CONTRACT_NOW = new Date('2026-09-07T09:00:00Z');
export const CONTRACT_ROSTER = [10, 20, 30] as const;

/** Звонок с разбором в том виде, в каком его хранит БД приложения. */
export interface ContractCall {
    transcriptionId: string;
    managerId: string | null;
    callStartedAt: string;
    durationSec: number | null;
    /** `user_result` глубокого разбора; null — разбора нет. */
    analysis: Record<string, unknown> | null;
}

/** Ожидаемые средние взвешенные оценки менеджеров по фикстуре. */
export const CONTRACT_EXPECTED_AVG: Readonly<Record<string, number>> = {
    '10': 75,
    '20': 70,
    '30': 70,
};

const analysisOf = (
    callType: string,
    weightedScore: number,
): Record<string, unknown> => ({
    callType,
    weightedScore,
    score: weightedScore / 10,
    productive: true,
    nextStep: { set: true, date: '2026-08-20' },
    sections: [],
    objections: [],
    versions: { prompt: 'p1', rubric: 'r1' },
});

function callsOf(
    managerId: string,
    callType: string,
    scores: readonly number[],
    durationSec = 600,
): ContractCall[] {
    return scores.map((weightedScore, index) => ({
        transcriptionId: `${managerId}-${callType}-${index}`,
        managerId,
        callStartedAt: `2026-08-${String(3 + (index % 20)).padStart(2, '0')}T08:00:00.000Z`,
        durationSec,
        analysis: analysisOf(callType, weightedScore),
    }));
}

/**
 * Три менеджера: 10 — 14 разборов (среднее 75), 20 — 12 (среднее 70),
 * 30 — 2 презентации (среднее 70, ниже порога n_min_none). Все звонки
 * разобраны и длиннее порога 300 с — обе ручки видят одно и то же.
 */
export function contractCalls(): ContractCall[] {
    return [
        ...callsOf(
            '10',
            'presentation',
            [60, 65, 70, 75, 80, 85, 90, 70, 75, 80],
        ),
        ...callsOf('10', 'cold', [60, 70, 80, 90]),
        ...callsOf('20', 'presentation', [50, 55, 60, 65, 70, 75, 80, 85, 90]),
        ...callsOf('20', 'call', [70, 70, 70]),
        ...callsOf('30', 'presentation', [60, 80]),
    ];
}

/**
 * Граница семантик: короткий разобранный звонок (120 с) и звонок без
 * разбора у менеджера 10. Легаси считает короткий разбор в `analyzed`,
 * витрина режет его порогом `min_duration_sec`.
 */
export function contractEdgeCalls(): ContractCall[] {
    return [
        {
            transcriptionId: '10-short',
            managerId: '10',
            callStartedAt: '2026-08-25T08:00:00.000Z',
            durationSec: 120,
            analysis: analysisOf('cold', 50),
        },
        {
            transcriptionId: '10-no-analysis',
            managerId: '10',
            callStartedAt: '2026-08-26T08:00:00.000Z',
            durationSec: 600,
            analysis: null,
        },
    ];
}

/** Полная строка легаси-аналитики (как её собирает `load` в call-lib). */
export function toLegacyRow(call: ContractCall): AnalyticsCallRow {
    return {
        transcriptionId: call.transcriptionId,
        callStartedAt: new Date(call.callStartedAt),
        durationSec: call.durationSec,
        managerId: call.managerId,
        callType:
            typeof call.analysis?.callType === 'string'
                ? call.analysis.callType
                : null,
        analysis: call.analysis,
        classification: null,
    };
}

/** Лёгкая строка витрины (как её собирает `loadLite` в call-lib). */
export function toLiteRow(call: ContractCall): AnalyticsCallLiteRow {
    const legacy = toLegacyRow(call);
    return {
        transcriptionId: legacy.transcriptionId,
        callStartedAt: legacy.callStartedAt,
        durationSec: legacy.durationSec,
        managerId: legacy.managerId,
        callType: legacy.callType,
        ...mapLiteAnalysis(call.analysis),
    };
}
