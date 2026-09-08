/**
 * Подбор трёх звонков недели для слепой проверки руководителем (план
 * `ai-sales-analytics-plan.md` §12 «три звонка в неделю — единственный
 * человеческий бюджет» и §4.11 «калибровочный контур»; Фаза 2, поток 15).
 *
 * Три звонка недели подбираются по трём разным причинам:
 * `uncertain_type` — классификатор не уверен в типе (проверяем алфавит
 * типов), `best_score` — лучший балл недели (это и есть проверка на
 * подыгрывание метрике: если лучший по мнению модели звонок руководителю
 * не нравится, метрика начала жить своей жизнью), `random` — случайный
 * (защита от того, что мы смотрим только на края распределения).
 *
 * ⚠ Чистая функция: без DI, Bitrix и `new Date()`. Случайность —
 * детерминированный `mulberry32` от зерна `seedOf(domain, weekKey)`,
 * поэтому повтор подбора за ту же неделю даёт тот же набор, а пересчёт
 * воспроизводит его через год. Порядок входных строк на результат не
 * влияет: кандидаты сначала приводятся к каноническому порядку.
 */
import {
    CALL_REPORT_CALL_TYPE_CODES,
    CallReportCallTypeCode,
} from '@lib/portal-lib/pbx/pbx-aicall-smart/type/pbx-aicall-smart.type';
import { mulberry32, seedOf } from './prng';

/** Причина попадания звонка в подбор недели (порядок значим — он же план). */
export const ROP_MARK_REASONS = [
    'uncertain_type',
    'best_score',
    'random',
] as const;
export type RopMarkReason = (typeof ROP_MARK_REASONS)[number];

export function isRopMarkReason(value: unknown): value is RopMarkReason {
    return (
        typeof value === 'string' &&
        (ROP_MARK_REASONS as readonly string[]).includes(value)
    );
}

/** Человеческий бюджет недели: три звонка, больше не просим (§12). */
export const ROP_MARK_WEEK_LIMIT = 3;

/**
 * Типы, при которых классификатор фактически расписался в неуверенности:
 * «другое» и «не наш разговор». Неизвестный код и пустой тип — тоже
 * неуверенность (разбор не проставил тип).
 */
export const ROP_MARK_UNCERTAIN_TYPES = [
    'other',
    'irrelevant',
] as const satisfies readonly CallReportCallTypeCode[];

export function isUncertainCallType(
    callType: string | null | undefined,
): boolean {
    if (typeof callType !== 'string' || callType === '') return true;
    if (!(CALL_REPORT_CALL_TYPE_CODES as readonly string[]).includes(callType))
        return true;
    return (ROP_MARK_UNCERTAIN_TYPES as readonly string[]).includes(callType);
}

/** Кандидат подбора: звонок недели в объёме, нужном для выбора. */
export interface RopMarkCandidate {
    /** Id транскрипции (ключ звонка). */
    transcriptionId: string;
    /** Bitrix-id менеджера строкой; звонки без менеджера не участвуют. */
    managerId: string;
    /** Тип звонка по классификатору; null — тип не определён. */
    callType: string | null;
    /** Оценка разбора в шкале 0–100; null — разбора нет. */
    score: number | null;
}

/** Подобранный звонок: кандидат плюс причина, по которой он выбран. */
export interface RopMarkPick extends RopMarkCandidate {
    reason: RopMarkReason;
}

export interface RopMarkPickOptions {
    /** Зерно потока случайности: `ropMarkSeed(domain, weekKey)`. */
    seed: number;
    /** Сколько звонков подобрать; по умолчанию три (бюджет недели). */
    limit?: number;
}

/** Зерно подбора: домен и ключ недели — больше в него ничего не входит. */
export function ropMarkSeed(domain: string, weekKey: string): number {
    return seedOf(domain, weekKey);
}

/** Сравнение id: числовые — по числу, прочие — лексикографически. */
function compareIds(left: string, right: string): number {
    const a = Number(left);
    const b = Number(right);
    if (Number.isFinite(a) && Number.isFinite(b) && a !== b) return a - b;
    if (left === right) return 0;
    return left < right ? -1 : 1;
}

/**
 * Канонический порядок кандидатов: без пустых ключей, без дублей по
 * транскрипции, по возрастанию id. Без этого набор зависел бы от порядка
 * выдачи источника, и повтор подбора давал бы другие звонки.
 */
function normalizeCandidates(
    candidates: readonly RopMarkCandidate[],
): RopMarkCandidate[] {
    const byId = new Map<string, RopMarkCandidate>();
    for (const candidate of candidates) {
        const id = String(candidate.transcriptionId ?? '');
        const managerId = String(candidate.managerId ?? '');
        if (!id || !managerId || byId.has(id)) continue;
        byId.set(id, {
            transcriptionId: id,
            managerId,
            callType: candidate.callType ?? null,
            score:
                typeof candidate.score === 'number' &&
                Number.isFinite(candidate.score)
                    ? candidate.score
                    : null,
        });
    }
    return [...byId.values()].sort((left, right) =>
        compareIds(left.transcriptionId, right.transcriptionId),
    );
}

/** Подходит ли кандидат причине подбора. */
function matchesReason(
    reason: RopMarkReason,
    candidate: RopMarkCandidate,
): boolean {
    if (reason === 'uncertain_type') {
        return isUncertainCallType(candidate.callType);
    }
    if (reason === 'best_score') return candidate.score !== null;
    return true;
}

/** Лучший балл; при равенстве — меньший id (устойчиво к порядку входа). */
function bestScored(pool: readonly RopMarkCandidate[]): RopMarkCandidate {
    return pool.reduce((best, candidate) => {
        const score = candidate.score ?? Number.NEGATIVE_INFINITY;
        const bestScore = best.score ?? Number.NEGATIVE_INFINITY;
        if (score > bestScore) return candidate;
        if (score < bestScore) return best;
        return compareIds(candidate.transcriptionId, best.transcriptionId) < 0
            ? candidate
            : best;
    });
}

/**
 * Выбор одного звонка под причину. Пока у других менеджеров есть
 * подходящие кандидаты, второй звонок того же менеджера не берём —
 * иначе неделя уходит в одного человека, а проверка теряет смысл.
 */
function chooseOne(
    reason: RopMarkReason,
    pool: readonly RopMarkCandidate[],
    usedCalls: ReadonlySet<string>,
    usedManagers: ReadonlySet<string>,
    random: () => number,
): RopMarkCandidate | null {
    const available = pool.filter(
        candidate =>
            !usedCalls.has(candidate.transcriptionId) &&
            matchesReason(reason, candidate),
    );
    if (!available.length) return null;
    const fresh = available.filter(
        candidate => !usedManagers.has(candidate.managerId),
    );
    const from = fresh.length ? fresh : available;
    if (reason === 'best_score') return bestScored(from);
    const index = Math.min(from.length - 1, Math.floor(random() * from.length));
    return from[index];
}

/** Порядок причин под запрошенный размер: сверх трёх добираем случайными. */
function reasonPlan(limit: number): RopMarkReason[] {
    return Array.from(
        { length: limit },
        (_, index) => ROP_MARK_REASONS[index] ?? 'random',
    );
}

/**
 * Подбор звонков недели: по одному на причину, не более одного на
 * менеджера, пока есть кандидаты у других. Кандидатов меньше трёх —
 * возвращается столько, сколько есть (это не ошибка: на маленьком
 * портале неделя может дать один звонок).
 */
export function pickRopMarkCalls(
    candidates: readonly RopMarkCandidate[],
    options: RopMarkPickOptions,
): RopMarkPick[] {
    const pool = normalizeCandidates(candidates);
    const limit = Math.max(0, Math.floor(options.limit ?? ROP_MARK_WEEK_LIMIT));
    const random = mulberry32(options.seed);
    const usedCalls = new Set<string>();
    const usedManagers = new Set<string>();
    const picks: RopMarkPick[] = [];
    for (const reason of reasonPlan(limit)) {
        const chosen = chooseOne(reason, pool, usedCalls, usedManagers, random);
        if (!chosen) continue;
        picks.push({ ...chosen, reason });
        usedCalls.add(chosen.transcriptionId);
        usedManagers.add(chosen.managerId);
    }
    return picks;
}
