/**
 * Пакет фактов AI-резюме (план §8): сборка, приоритетная обрезка и хэш.
 *
 * В модель уходит не отчёт, а короткий пакет: ≤ 10 фактов и ≤ 4 КБ.
 * Приоритет при обрезке — алерты → отклонения → финансы против плана →
 * дисциплина → телефония → качество данных. Хэш пакета детерминирован и не
 * зависит от порядка ключей в объектах фактов (канонический JSON), поэтому
 * годится как ключ кэша и `activity_id` снапшота `ai-analytics-brief`.
 */
import { createHash } from 'node:crypto';
import {
    AI_BRIEF_FACT_PRIORITY,
    AI_BRIEF_LIMITS,
    type AiBriefFact,
    type AiEvidencePack,
} from '../contracts/ai-brief.contract';
import { canonicalJson, type JsonObject } from '../params/params-version';
import { formatFactValue } from './brief-numbers';

/** Ограничения обрезки пакета; по умолчанию — `AI_BRIEF_LIMITS`. */
export interface EvidencePackOptions {
    /** Максимум фактов в пакете. */
    maxFacts?: number;
    /** Максимум байт канонического JSON пакета. */
    maxBytes?: number;
}

/** Факт в каноническом JSON: поля в фиксированном составе, без undefined. */
export function factToJson(fact: AiBriefFact): JsonObject {
    return {
        code: fact.code,
        kind: fact.kind,
        title: fact.title,
        value: fact.value,
        unit: fact.unit,
        text: fact.text,
        n: fact.n ?? null,
        managerId: fact.managerId ?? null,
        callType: fact.callType ?? null,
    };
}

/** Канонический JSON пакета — вход хэша и меры размера. */
export function packJson(facts: readonly AiBriefFact[]): string {
    return canonicalJson(facts.map(factToJson));
}

/** Размер пакета в байтах UTF-8. */
export function packBytes(facts: readonly AiBriefFact[]): number {
    return Buffer.byteLength(packJson(facts), 'utf8');
}

/**
 * `packHash`: sha256 канонического JSON фактов. Перестановка ключей внутри
 * факта хэш не меняет — иначе кэш резюме промахивался бы на ровном месте.
 */
export function packHash(facts: readonly AiBriefFact[]): string {
    return createHash('sha256').update(packJson(facts), 'utf8').digest('hex');
}

/** Готовая фраза факта: подпись и число, отформатированное общим правилом. */
export function buildFactText(fact: Omit<AiBriefFact, 'text'>): string {
    return `${fact.title}: ${formatFactValue(fact.value, fact.unit)}`;
}

const priorityOf = (fact: AiBriefFact): number => {
    const index = AI_BRIEF_FACT_PRIORITY.indexOf(fact.kind);

    return index === -1 ? AI_BRIEF_FACT_PRIORITY.length : index;
};

/** Сортировка по приоритету вида; внутри вида порядок входа сохраняется. */
function byPriority(facts: readonly AiBriefFact[]): AiBriefFact[] {
    return facts
        .map((fact, index) => ({ fact, index }))
        .sort(
            (a, b) =>
                priorityOf(a.fact) - priorityOf(b.fact) || a.index - b.index,
        )
        .map(item => item.fact);
}

/**
 * Пакет фактов под лимиты: сортировка по приоритету, обрезка по числу
 * фактов, затем по байтам (с хвоста). Коды выброшенных фактов возвращаются
 * — они попадают в снапшот резюме, чтобы было видно, что не поместилось.
 */
export function trimEvidencePack(
    facts: readonly AiBriefFact[],
    opts: EvidencePackOptions = {},
): AiEvidencePack {
    const maxFacts = opts.maxFacts ?? AI_BRIEF_LIMITS.packFacts;
    const maxBytes = opts.maxBytes ?? AI_BRIEF_LIMITS.packBytes;
    const ordered = byPriority(facts);
    const kept = ordered.slice(0, Math.max(maxFacts, 0));
    while (kept.length > 0 && packBytes(kept) > maxBytes) {
        kept.pop();
    }
    const keptCodes = new Set(kept.map(fact => fact.code));

    return {
        facts: kept,
        hash: packHash(kept),
        droppedCodes: ordered
            .filter(fact => !keptCodes.has(fact.code))
            .map(fact => fact.code),
    };
}

/** Факт пакета по коду; undefined — ссылки на такой факт быть не должно. */
export function findFact(
    pack: AiEvidencePack,
    code: string,
): AiBriefFact | undefined {
    return pack.facts.find(fact => fact.code === code);
}
