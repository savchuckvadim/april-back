/**
 * Куда идёт находка поиска повторной заявки — ЧИСТАЯ логика без I/O
 * (решения владельца 28.09 и 01.10.2026). Вход — решения резолвера по
 * лидам пачки, выход — что присоединять и о чём только написать в лид.
 */
import { IRepeatDealInfo, IRepeatResolution } from './repeat-work.resolver';

/** Режим настройки `lead_intake_repeat_join_mode`. */
export const REPEAT_JOIN_MODES = ['off', 'dry_run', 'on'] as const;
export type RepeatJoinMode = (typeof REPEAT_JOIN_MODES)[number];

/** Комментарий холостого хода в таймлайн лида после записи. */
export interface IRepeatLeadNote {
    leadId: number;
    resolution: IRepeatResolution;
    mode: RepeatJoinMode;
}

/** Маршрут находок пачки. */
export interface IRepeatRouting<T> {
    /** leadId → присоединение (только mode='on'). */
    joins: Map<number, T>;
    /** Холостой ход: только комментарий «присоединил бы…» в лид. */
    notes: IRepeatLeadNote[];
    /** Владельцы выбранных сделок — проверить, работают ли они сейчас. */
    ownerIds: number[];
}

/**
 * Есть сделка, к которой присоединять: единственная открытая (join) либо
 * самая свежая из нескольких открытых (ambiguous).
 */
export const isJoinable = (
    resolution: IRepeatResolution,
): resolution is IRepeatResolution & { mainDeal: IRepeatDealInfo } =>
    (resolution.kind === 'join' || resolution.kind === 'ambiguous') &&
    !!resolution.mainDeal;

/**
 * Ответственный присоединения — владелец выбранной сделки, если он
 * работает сейчас. Иначе null: заявку распределяет круг, а сделка после
 * записи передаётся новому ответственному.
 */
export function activeRepeatOwner(
    join: { resolution: IRepeatResolution } | undefined,
    activeIds: ReadonlySet<number>,
): number | null {
    const ownerId = join?.resolution.mainDeal?.responsibleId ?? null;
    return ownerId && activeIds.has(ownerId) ? ownerId : null;
}

/**
 * Маршрут по режиму:
 *  - on — одна открытая и несколько открытых присоединяются ОДИНАКОВО:
 *    ответственный — владелец выбранной сделки, не работает — круг и
 *    передача сделки (это решает use-case по ownerIds);
 *  - dry_run — ни одной записи, только комментарий в лид;
 *  - off — ничего (поиск в этом режиме и не запускается).
 */
export function routeRepeatOutcomes<
    T extends { resolution: IRepeatResolution },
>(outcomes: ReadonlyMap<number, T>, mode: RepeatJoinMode): IRepeatRouting<T> {
    const routing: IRepeatRouting<T> = {
        joins: new Map(),
        notes: [],
        ownerIds: [],
    };
    if (mode === 'off') return routing;

    for (const [leadId, outcome] of outcomes) {
        const { resolution } = outcome;
        if (!isJoinable(resolution)) continue;
        if (mode === 'dry_run') {
            routing.notes.push({ leadId, resolution, mode });
            continue;
        }
        routing.joins.set(leadId, outcome);
        const ownerId = resolution.mainDeal.responsibleId;
        if (ownerId && !routing.ownerIds.includes(ownerId)) {
            routing.ownerIds.push(ownerId);
        }
    }
    return routing;
}
