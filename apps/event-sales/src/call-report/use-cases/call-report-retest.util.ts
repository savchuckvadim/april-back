/**
 * Чистые помощники test-retest оценщика (план Фазы 3 AI-аналитики, П7
 * `p3-llm-agreement`): разбор из `user_result` записи ais → прогон
 * согласия (`AgreementRun`), отбор последней записи на транскрипцию,
 * ключ отчёта по версии промпта и хэш пар.
 *
 * Читается структурно: нагрузка записи — чужая форма (внешний агент или
 * внутренний фокус-разбор), незнакомое поле даёт «не заполнено», а не
 * падение прогона.
 *
 * Без DI, Bitrix и `new Date()`.
 */
import { createHash } from 'crypto';
import type { AgreementPair, AgreementRun } from '@lib/sales-ai-analytics';

/** Код шкалы общего балла — по ней измеряется σ_llm (шкала 1–10). */
export const RETEST_SIGMA_SCALE = 'score' as const;
/** Префикс шкал разделов рубрики в прогоне согласия. */
export const RETEST_SECTION_SCALE_PREFIX = 'section_' as const;

/** Коды категориальных полей прогона согласия. */
export const RETEST_CATEGORY_CODES = {
    callType: 'callType',
    productive: 'productive',
    refusalCategory: 'refusalCategory',
    coachingPriority: 'coachingPriority',
    nextStepSet: 'nextStepSet',
} as const;

/** Длина ключа отчёта — короткий sha1 версии промпта (как в DTO админки). */
const PROMPT_KEY_LENGTH = 16;

type Unknown = Record<string, unknown>;

const isObject = (value: unknown): value is Unknown =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const asString = (value: unknown): string | null =>
    typeof value === 'string' && value !== '' ? value : null;

const asNumber = (value: unknown): number | null =>
    typeof value === 'number' && Number.isFinite(value) ? value : null;

const yesNo = (value: unknown): string | null =>
    typeof value === 'boolean' ? (value ? 'yes' : 'no') : null;

/** Версия промпта разбора из `user_result.versions.prompt`; нет — null. */
export function promptVersionOf(value: unknown): string | null {
    if (!isObject(value) || !isObject(value.versions)) return null;

    return asString(value.versions.prompt);
}

/**
 * Общий балл разбора в шкале 1–10: `weightedScore` (0–100) / 10, иначе
 * `score` (1–10); нет ни того, ни другого — null.
 */
export function scoreOf(value: Unknown): number | null {
    const weighted = asNumber(value.weightedScore);
    if (weighted !== null) return weighted / 10;

    return asNumber(value.score);
}

/** Шкалы разделов рубрики: только разделы с relevance > 0 и оценкой. */
function sectionScalesOf(value: Unknown): Record<string, number | null> {
    const scales: Record<string, number | null> = {};
    const list = Array.isArray(value.sections) ? value.sections : [];
    for (const item of list) {
        if (!isObject(item)) continue;
        const code = asString(item.section);
        const relevance = asNumber(item.relevance) ?? 0;
        const score = asNumber(item.score);
        if (code === null || relevance <= 0 || score === null) continue;
        scales[`${RETEST_SECTION_SCALE_PREFIX}${code}`] = score;
    }

    return scales;
}

/** Коды возражений разбора без повторов, по алфавиту. */
function objectionCodesOf(value: Unknown): string[] {
    const list = Array.isArray(value.objections) ? value.objections : [];
    const codes = new Set<string>();
    for (const item of list) {
        if (!isObject(item)) continue;
        const code = asString(item.category);
        if (code !== null) codes.add(code);
    }

    return [...codes].sort((a, b) => a.localeCompare(b));
}

/** Разбор из `user_result` → прогон согласия; не объект — null. */
export function toAgreementRun(value: unknown): AgreementRun | null {
    if (!isObject(value)) return null;
    const nextStep = isObject(value.nextStep) ? value.nextStep : {};

    return {
        categories: {
            [RETEST_CATEGORY_CODES.callType]: asString(value.callType),
            [RETEST_CATEGORY_CODES.productive]: yesNo(value.productive),
            [RETEST_CATEGORY_CODES.refusalCategory]: asString(
                value.refusalCategory,
            ),
            [RETEST_CATEGORY_CODES.coachingPriority]: asString(
                value.coachingPriority,
            ),
            [RETEST_CATEGORY_CODES.nextStepSet]: yesNo(nextStep.set),
        },
        scales: {
            [RETEST_SIGMA_SCALE]: scoreOf(value),
            ...sectionScalesOf(value),
        },
        objections: objectionCodesOf(value),
    };
}

/** Запись ais в объёме, нужном отбору выборки. */
export interface RetestRecordView {
    id: string;
    transcription_id: string | null;
    user_result: unknown;
}

/**
 * Последняя запись на транскрипцию (максимальный id — актуальная версия
 * разбора); записи без транскрипции пропускаются.
 */
export function latestPerTranscription<T extends RetestRecordView>(
    records: readonly T[],
): Map<string, T> {
    const byTranscription = new Map<string, T>();
    for (const record of records) {
        const key = asString(record.transcription_id);
        if (key === null) continue;
        const current = byTranscription.get(key);
        if (current === undefined || Number(record.id) > Number(current.id)) {
            byTranscription.set(key, record);
        }
    }

    return byTranscription;
}

/** Ключ записи отчёта — короткий sha1 версии промпта. */
export function promptKeyOf(promptVersion: string): string {
    return createHash('sha1')
        .update(promptVersion)
        .digest('hex')
        .slice(0, PROMPT_KEY_LENGTH);
}

/** Хэш входов отчёта — ключи пар по возрастанию (inputsHash конверта). */
export function pairsHashOf(pairs: readonly AgreementPair[]): string {
    return createHash('sha1')
        .update(
            pairs
                .map(pair => pair.key)
                .sort((a, b) => a.localeCompare(b))
                .join(','),
        )
        .digest('hex')
        .slice(0, PROMPT_KEY_LENGTH);
}

/** Пара согласия из двух разборов; любой из них не разбор — пары нет. */
export function toAgreementPair(
    key: string,
    first: unknown,
    second: unknown,
): AgreementPair | null {
    const firstRun = toAgreementRun(first);
    const secondRun = toAgreementRun(second);

    return firstRun === null || secondRun === null
        ? null
        : { key, first: firstRun, second: secondRun };
}
