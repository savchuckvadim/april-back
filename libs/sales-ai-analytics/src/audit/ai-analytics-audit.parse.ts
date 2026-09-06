/**
 * Разбор сырых значений БД (ais.user_result, ais.result,
 * transcriptions.duration) в плоские факты для аудита. Только чистые функции.
 */
import {
    asRecord,
    asString,
} from '@lib/call-lib/call-report-analytics/lib/json-value.util';
import { AuditAnalysisFields } from './ai-analytics-audit.calc';

/** Ключи объекта versions в user_result разбора (контракт AnalysisVersions). */
export const ANALYSIS_VERSION_KEYS = [
    'prompt',
    'rubric',
    'registry',
    'attribution',
    'classifier',
] as const;

export interface AnalysisFacts {
    callType: string | null;
    versionKey: string | null;
    fields: AuditAnalysisFields;
}

function asRecordArray(value: unknown): Record<string, unknown>[] {
    return Array.isArray(value)
        ? value
              .map(item => asRecord(item))
              .filter((item): item is Record<string, unknown> => item !== null)
        : [];
}

function hasNonEmptyStringArray(value: unknown): boolean {
    return (
        Array.isArray(value) &&
        value.some(item => typeof item === 'string' && item !== '')
    );
}

/**
 * Ключ версии разбора: объект versions (пять полей, отсутствующее — «?»),
 * иначе legacy-поле agentVersion, иначе null.
 */
export function versionKeyOf(record: Record<string, unknown>): string | null {
    const versions = asRecord(record.versions);
    if (versions) {
        return ANALYSIS_VERSION_KEYS.map(
            key => `${key}=${asString(versions[key]) ?? '?'}`,
        ).join(';');
    }
    const agentVersion = asString(record.agentVersion);
    return agentVersion ? `agentVersion=${agentVersion}` : null;
}

/** Факты из user_result записи agent-analysis; null — не объект. */
export function parseAnalysisFacts(userResult: unknown): AnalysisFacts | null {
    const record = asRecord(userResult);
    if (!record) return null;

    const nextStep = asRecord(record.nextStep);
    const sections = asRecordArray(record.sections);
    const objections = asRecordArray(record.objections);

    return {
        callType: asString(record.callType),
        versionKey: versionKeyOf(record),
        fields: {
            nextStepSet: nextStep?.set === true,
            nextStepDate: asString(nextStep?.date) !== null,
            sectionsTotal: sections.length,
            sectionsWithAlternatives: sections.filter(section =>
                hasNonEmptyStringArray(section.alternatives),
            ).length,
            objectionsTotal: objections.length,
            objectionsWithQuote: objections.filter(
                objection => asString(objection.quote) !== null,
            ).length,
        },
    };
}

/** Тип из записи call-classify: user_result.callType, иначе колонка result. */
export function parseClassifyCallType(
    userResult: unknown,
    result: string | null,
): string | null {
    return asString(asRecord(userResult)?.callType) ?? asString(result);
}

/** duration хранится строкой секунд; пусто/не число → null. */
export function parseDurationSec(value: string | null): number | null {
    if (value === null || value.trim() === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}
