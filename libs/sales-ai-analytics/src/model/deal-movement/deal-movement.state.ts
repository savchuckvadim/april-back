/**
 * План ночи «движения сделок»: новое состояние каждой сделки, смены
 * статуса за ночь и кому из сделок писать в ленту. Чистые функции без
 * Битрикса и хранилищ — запись в ленту подключается режимом `notify`
 * без переделки плана.
 *
 * `notifiedStatus` — последний статус, о котором сделке «сказали».
 * Расхождение `status ≠ notifiedStatus` и есть повод для записи; не
 * записали (лимит ночи, защита от метаний, сбой Битрикса) — расхождение
 * остаётся до следующей ночи. Сделка, увиденная впервые, получает базовую
 * линию: о текущем статусе ей не пишем (решение 17.11.2026).
 */
import { DAY_MS, timeOf } from './deal-movement.timeline';
import {
    DEAL_MOVEMENT_STATUSES,
    type DealMovementReason,
    type DealMovementStatus,
    type DealMovementVerdict,
} from './deal-movement.types';

/**
 * Режим плана: `silent` — ночной счёт, `notifiedStatus` сдвигается молча
 * (в ленту не пишем); `notify` — расхождения уходят в список на запись.
 */
export const DEAL_MOVEMENT_PLAN_MODES = ['silent', 'notify'] as const;
export type DealMovementPlanMode = (typeof DEAL_MOVEMENT_PLAN_MODES)[number];

/** Состояние сделки между ночами (поле хранилища — id сделки). */
export interface DealMovementStateEntry {
    status: DealMovementStatus;
    notifiedStatus: DealMovementStatus;
    reasons: DealMovementReason[];
    stageCode: string | null;
    amount: number | null;
    assignedById: number | null;
    lastActivityAt: string | null;
    /** Когда статус сменился последний раз; null — не менялся при нас. */
    changedAt: string | null;
    /** Когда последний раз писали в ленту сделки; null — ни разу. */
    notifiedAt: string | null;
    checkedAt: string;
}

/** Сделка ночи: вердикт кода и то, что запоминается рядом с ним. */
export interface DealMovementNightDeal {
    verdict: DealMovementVerdict;
    title: string;
    stageCode: string | null;
    amount: number | null;
    assignedById: number | null;
    lastActivityAt: string | null;
}

export interface DealMovementNightLimits {
    /** Сколько записей в ленту сделок за ночь; 0 — ни одной. */
    notify: number;
    /** Не чаще одной записи по сделке за столько суток (защита от метаний). */
    minDaysBetween: number;
}

export const DEAL_MOVEMENT_NIGHT_DEFAULTS: DealMovementNightLimits = {
    notify: 0,
    minDaysBetween: 3,
};

/** Смена статуса за ночь (относительно прошлой ночи). */
export interface DealMovementNightChange {
    dealId: string;
    title: string;
    assignedById: number | null;
    amount: number | null;
    from: DealMovementStatus;
    to: DealMovementStatus;
    reasons: DealMovementReason[];
}

export interface DealMovementNightInput {
    /** Состояние прошлой ночи; null — базовая линия заново. */
    previous: ReadonlyMap<string, DealMovementStateEntry> | null;
    deals: readonly DealMovementNightDeal[];
    /** Открытые сделки сверх потолка ночи: их прошлое состояние сохраняется. */
    carryOver?: readonly string[];
    mode: DealMovementPlanMode;
    limits: DealMovementNightLimits;
    /** Момент расчёта, ISO 8601. */
    now: string;
}

export interface DealMovementNightPlan {
    state: Map<string, DealMovementStateEntry>;
    changes: DealMovementNightChange[];
    /** Кому пишем в ленту этой ночью (режим `notify`), важные первыми. */
    toNotify: string[];
    /** Расхождения, отложенные защитой от метаний или лимитом ночи. */
    deferred: number;
    /** Сколько сделок увидели впервые (базовая линия). */
    firstSeen: number;
    byStatus: Record<DealMovementStatus, number>;
}

export const emptyDealMovementCounts = (): Record<DealMovementStatus, number> =>
    Object.fromEntries(
        DEAL_MOVEMENT_STATUSES.map(status => [status, 0]),
    ) as Record<DealMovementStatus, number>;

/** Запись в ленту удалась: о текущем статусе сделке «сказали». */
export function markDealMovementNotified(
    entry: DealMovementStateEntry,
    now: string,
): DealMovementStateEntry {
    return { ...entry, notifiedStatus: entry.status, notifiedAt: now };
}

/** Можно ли писать по сделке: после прошлой записи прошло достаточно суток. */
function isQuietEnough(
    entry: DealMovementStateEntry,
    nowMs: number,
    minDaysBetween: number,
): boolean {
    if (entry.notifiedAt === null) return true;
    const lastMs = timeOf(entry.notifiedAt);
    return lastMs === null || nowMs - lastMs >= minDaysBetween * DAY_MS;
}

/** Важнее — тревожные статусы (по порядку правил), затем крупные сделки. */
function byImportance(
    a: [string, DealMovementStateEntry],
    b: [string, DealMovementStateEntry],
): number {
    const severity =
        DEAL_MOVEMENT_STATUSES.indexOf(a[1].status) -
        DEAL_MOVEMENT_STATUSES.indexOf(b[1].status);
    if (severity !== 0) return severity;
    const amount = (b[1].amount ?? 0) - (a[1].amount ?? 0);
    return amount !== 0 ? amount : Number(a[0]) - Number(b[0]);
}

function nextEntry(
    deal: DealMovementNightDeal,
    previous: DealMovementStateEntry | undefined,
    mode: DealMovementPlanMode,
    now: string,
): DealMovementStateEntry {
    const status = deal.verdict.status;
    const changed = previous !== undefined && previous.status !== status;
    return {
        status,
        // Базовая линия и молчаливый режим: о статусе «сказано».
        notifiedStatus:
            previous === undefined || mode === 'silent'
                ? status
                : previous.notifiedStatus,
        reasons: [...deal.verdict.reasons],
        stageCode: deal.stageCode,
        amount: deal.amount,
        assignedById: deal.assignedById,
        lastActivityAt: deal.lastActivityAt,
        changedAt: changed ? now : (previous?.changedAt ?? null),
        notifiedAt: previous?.notifiedAt ?? null,
        checkedAt: now,
    };
}

export function planDealMovementNight(
    input: DealMovementNightInput,
): DealMovementNightPlan {
    const state = new Map<string, DealMovementStateEntry>();
    const changes: DealMovementNightChange[] = [];
    const byStatus = emptyDealMovementCounts();
    let firstSeen = 0;

    for (const deal of input.deals) {
        const dealId = deal.verdict.dealId;
        const previous = input.previous?.get(dealId);
        if (previous === undefined) firstSeen += 1;
        const entry = nextEntry(deal, previous, input.mode, input.now);
        state.set(dealId, entry);
        byStatus[entry.status] += 1;
        if (previous !== undefined && previous.status !== entry.status) {
            changes.push({
                dealId,
                title: deal.title,
                assignedById: deal.assignedById,
                amount: deal.amount,
                from: previous.status,
                to: entry.status,
                reasons: entry.reasons,
            });
        }
    }
    for (const dealId of input.carryOver ?? []) {
        const previous = input.previous?.get(dealId);
        if (previous !== undefined && !state.has(dealId)) {
            state.set(dealId, previous);
        }
    }

    const { toNotify, deferred } = selectToNotify(state, input);
    return { state, changes, toNotify, deferred, firstSeen, byStatus };
}

/** Расхождения ночи → кому пишем (по важности, в пределах лимита). */
function selectToNotify(
    state: ReadonlyMap<string, DealMovementStateEntry>,
    input: DealMovementNightInput,
): { toNotify: string[]; deferred: number } {
    const diverged = [...state.entries()].filter(
        ([, entry]) => entry.status !== entry.notifiedStatus,
    );
    if (input.mode === 'silent') return { toNotify: [], deferred: 0 };
    const nowMs = timeOf(input.now) ?? 0;
    const allowed = diverged
        .filter(([, entry]) =>
            isQuietEnough(entry, nowMs, input.limits.minDaysBetween),
        )
        .sort(byImportance);
    const toNotify = allowed
        .slice(0, Math.max(0, input.limits.notify))
        .map(([dealId]) => dealId);
    return { toNotify, deferred: diverged.length - toNotify.length };
}
