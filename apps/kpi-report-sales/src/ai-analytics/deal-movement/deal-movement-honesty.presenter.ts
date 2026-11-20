/**
 * Честность оценок продвижения (п. 4 постановки §7): доля звонков с
 * продвижением 4–5, после которых стадия сделки не сдвинулась вперёд за N
 * дней. Итог проверки каждого звонка отмечает ночной счёт движения сделок
 * (снимки `progressChecks`, из истории стадий открытых сделок — без
 * Битрикса); витрина сцепляет отметки со своими звонками периода по
 * расшифровке. Мало проверенных — число и пометка. Чистые функции.
 */
import {
    DEAL_MOVEMENT_DEFAULTS,
    DEAL_MOVEMENT_PROGRESS_CHECK_MIN,
    type DealMovementProgressOutcome,
    type DealMovementSnapshotView,
} from '@lib/sales-ai-analytics';
import { callsByManager } from './deal-movement-matrix.presenter';
import type { DealMovementScope } from './deal-movement-scope';
import {
    DEAL_MOVEMENT_FEW_CALLS,
    DEAL_MOVEMENT_TEXTS,
} from './deal-movement-vitrina.const';
import type {
    DealMovementCallPoint,
    DealMovementPeriodSource,
} from './deal-movement-vitrina.types';
import type {
    DealMovementHonestyBlockDto,
    DealMovementHonestyDto,
} from './dto/deal-movement-honesty.dto';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Итог проверки по расшифровке из всех ночей: «сдвинулась» хоть одной
 * ночью — сдвинулась (отметка окончательная), иначе — «не сдвинулась».
 */
export function progressOutcomesOf(
    nights: readonly DealMovementSnapshotView[],
): Map<string, DealMovementProgressOutcome> {
    const outcomes = new Map<string, DealMovementProgressOutcome>();
    for (const night of nights) {
        for (const check of night.progressChecks) {
            if (outcomes.get(check.transcriptionId) === 'moved') continue;
            outcomes.set(check.transcriptionId, check.outcome);
        }
    }
    return outcomes;
}

/** Срок проверки — из последней ночи, где он записан; иначе настройка по умолчанию. */
export function checkDaysOf(
    nights: readonly DealMovementSnapshotView[],
): number {
    for (let index = nights.length - 1; index >= 0; index--) {
        const days = nights[index].progressCheckDays;
        if (days !== null) return days;
    }
    return DEAL_MOVEMENT_DEFAULTS.agreedStillDays;
}

const round1 = (value: number): number => Math.round(value * 10) / 10;

/** Честность по набору звонков с продвижением 4–5. */
export function buildDealMovementHonesty(input: {
    calls: readonly DealMovementCallPoint[];
    outcomes: ReadonlyMap<string, DealMovementProgressOutcome>;
    checkDays: number;
    /** Момент расчёта, мс: от него — «N дней ещё не прошли». */
    nowMs: number;
}): DealMovementHonestyDto {
    let still = 0;
    let moved = 0;
    let pending = 0;
    let unchecked = 0;
    for (const call of input.calls) {
        const outcome = input.outcomes.get(call.transcriptionId);
        if (outcome === 'moved') moved += 1;
        else if (outcome === 'still') still += 1;
        else if (Date.parse(call.at) + input.checkDays * DAY_MS > input.nowMs) {
            pending += 1;
        } else unchecked += 1;
    }
    const checked = still + moved;
    const fewCalls = checked < DEAL_MOVEMENT_FEW_CALLS.honesty;
    return {
        highProgress: input.calls.length,
        checked,
        still,
        moved,
        pending,
        unchecked,
        stillPct: checked > 0 ? round1((still / checked) * 100) : null,
        fewCalls,
        note: fewCalls ? DEAL_MOVEMENT_TEXTS.fewCalls : null,
    };
}

/** Блок честности: видимые звонки 4–5 периода по отделу и менеджерам. */
export function presentDealMovementHonesty(input: {
    source: DealMovementPeriodSource;
    scope: DealMovementScope;
    names: Readonly<Record<string, string>>;
}): DealMovementHonestyBlockDto {
    const { source, scope } = input;
    const outcomes = progressOutcomesOf(source.nights);
    const checkDays = checkDaysOf(source.nights);
    const nowMs = Date.parse(source.builtAt);
    const high = source.calls.filter(
        call =>
            call.progress >= DEAL_MOVEMENT_PROGRESS_CHECK_MIN &&
            scope.visible(call.managerId),
    );
    const honestyOf = (
        calls: readonly DealMovementCallPoint[],
    ): DealMovementHonestyDto =>
        buildDealMovementHonesty({ calls, outcomes, checkDays, nowMs });
    return {
        checkDays,
        progressMin: DEAL_MOVEMENT_PROGRESS_CHECK_MIN,
        department: honestyOf(high),
        managers: [...callsByManager(high).entries()]
            .map(([managerId, calls]) => ({
                managerId,
                managerName: input.names[managerId] ?? null,
                ...honestyOf(calls),
            }))
            .sort(
                (a, b) =>
                    b.highProgress - a.highProgress ||
                    Number(a.managerId) - Number(b.managerId),
            ),
    };
}
