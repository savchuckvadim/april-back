/**
 * Методика продаж в подсчёте переразбора (этап 6.5). Разбор текущей версии
 * промпта считался «свежим», даже если сделан до включения методики на
 * портале: такие звонки переразбор пропускал, а оценка расхода бралась по
 * разборам без прохода методики и выходила заниженной.
 *
 * Чистые функции: без DI, Bitrix и `new Date()`.
 */
import type { ResolvedMethodology } from '@lib/call-lib/call-report/methodology';
import type { ReanalysisCostEstimate } from '@lib/sales-ai-analytics';
import { buildMethodologyPassSchema } from '../contracts/methodology-pass.contract';
import { estimateReanalysisCost } from './call-report-reanalyze.record';

/** Методика портала в объёме отбора: метка версии и к каким звонкам применима. */
export interface ReanalysisMethodology {
    /** `код@версия` — метка в версиях разбора. */
    tag: string;
    /** Есть ли у методики проход для звонка такого типа. */
    appliesTo: (callType: string | null) => boolean;
}

/** Недавний разбор в объёме оценки расхода. */
export interface ReanalysisUsageRecord {
    tokens_count: number;
    price: number;
    user_result?: unknown;
}

type Json = Record<string, unknown>;

const isRecord = (value: unknown): value is Json =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const text = (value: unknown): string | null =>
    typeof value === 'string' && value !== '' ? value : null;

/** Метка методики, с которой сделан разбор (`versions.methodology`); нет — null. */
export function recordMethodologyTag(userResult: unknown): string | null {
    if (!isRecord(userResult) || !isRecord(userResult.versions)) return null;
    return text(userResult.versions.methodology);
}

/** Тип звонка из разбора; нет — null. */
export function recordCallType(userResult: unknown): string | null {
    return isRecord(userResult) ? text(userResult.callType) : null;
}

/** Методика портала → объём отбора: применимость — по тому же правилу, что у прохода. */
export function reanalysisMethodologyOf(
    resolved: ResolvedMethodology,
): ReanalysisMethodology {
    return {
        tag: resolved.versionTag,
        appliesTo: callType =>
            buildMethodologyPassSchema(resolved.methodology, callType) !== null,
    };
}

/**
 * Разбор нужно переделать из-за методики: на портале выбрана методика, она
 * применима к типу этого звонка, а разбор сделан без неё или с другой её
 * версией. Методики нет или звонок вне её — false.
 */
export function isMethodologyStale(
    userResult: unknown,
    methodology: ReanalysisMethodology | null | undefined,
): boolean {
    if (!methodology) return false;
    if (!methodology.appliesTo(recordCallType(userResult))) return false;
    return recordMethodologyTag(userResult) !== methodology.tag;
}

/**
 * Оценка расхода переразбора с учётом методики. Если методика выбрана,
 * средний расход берётся по недавним разборам с её проходом; таких ещё нет —
 * по всем недавним, с прямой пометкой, что проход методики в оценку не вошёл.
 */
export function estimateReanalysisCostWithMethodology(
    recent: readonly ReanalysisUsageRecord[],
    candidates: number,
    methodology: ReanalysisMethodology | null,
    methodologyOnly: number,
): ReanalysisCostEstimate {
    const withMethodology = methodology
        ? recent.filter(
              record =>
                  record.tokens_count > 0 &&
                  recordMethodologyTag(record.user_result) === methodology.tag,
          )
        : [];
    const estimate = estimateReanalysisCost(
        withMethodology.length > 0 ? withMethodology : recent,
        candidates,
    );
    const notes: string[] = [];
    if (methodology && withMethodology.length === 0) {
        notes.push(
            'На портале выбрана методика продаж, но разборов с её проходом ещё нет: проход методики в оценку не вошёл, фактический расход будет выше.',
        );
    }
    if (methodologyOnly > 0) {
        notes.push(
            `Из кандидатов ${methodologyOnly} — разборы текущей версии, сделанные без прохода методики.`,
        );
    }
    return notes.length === 0
        ? estimate
        : { ...estimate, message: [estimate.message, ...notes].join(' ') };
}
