/**
 * Сцепка звонка с эпизодом сделки (план `ai-sales-analytics`, §4.1 «Сцепка»).
 *
 * Основной путь детерминированный: звонок → сущность → эпизод → исход.
 * Лид сцепляется через конверсию в сделку (`to_sale_deal`/`lead_converted`),
 * xo-сделка — через `relatedDeals.mainDealId`.
 *
 * **Запасной путь** для звонков по контакту и компании (частая настройка
 * телефонии): открытая сделка компании на дату звонка — одна открытая даёт
 * `high`, несколько → ближайшая по активности с `low`, ни одной → не сцеплен
 * (`none`). Доля сцепки `chainSharePct` — вход гистерезиса `edge-estimand.ts`.
 *
 * Двойного счёта нет по построению: три звонка одного эпизода ссылаются на
 * один `episodeKey`, и продажа считается по уникальным эпизодам
 * (`linkedEpisodes` / `countLinkedSales`), а не по звонкам.
 *
 * Чистый слой: время только параметром (`call.at`), `new Date()` запрещён.
 */
import {
    type DealEpisode,
    type EpisodesByEntity,
    episodeAt,
    parseInstant,
} from './episode';
import {
    type AiCallLinkConfidence,
    type AiCallLinkPath,
    type AiCallLinkReason,
    type CallForLink,
    type CallLink,
    type EpisodeLinkHints,
    type OpenDealRef,
} from './episode-link.types';

export * from './episode-link.types';

interface DealResolution {
    readonly dealId: string | null;
    readonly path: AiCallLinkPath;
    readonly confidence: AiCallLinkConfidence;
    readonly reason: AiCallLinkReason;
}

/** Точность доли сцепки: 6 знаков — гистерезис сравнивает целые проценты. */
const PCT_PRECISION = 1e6;

/** Процентных пунктов в единице доли. */
const PCT_IN_UNIT = 100;

/** Сделки компании/контакта, открытые на момент звонка. */
function openOnDate(
    deals: readonly OpenDealRef[],
    atMs: number,
): OpenDealRef[] {
    return deals.filter(deal => {
        const opened = parseInstant(deal.openedAt);
        if (opened === null || opened > atMs) {
            return false;
        }
        const closed =
            deal.closedAt === null ? null : parseInstant(deal.closedAt);

        return closed === null || closed >= atMs;
    });
}

/**
 * Ближайшая по активности сделка: минимум |момент звонка − последняя
 * активность| (без активности — дата открытия). Ничьи разводятся по `dealId`,
 * чтобы пересчёт на той же фикстуре давал тот же ответ.
 */
function nearestByActivity(
    deals: readonly OpenDealRef[],
    atMs: number,
): OpenDealRef {
    const distance = (deal: OpenDealRef): number => {
        const marker = parseInstant(deal.lastActivityAt ?? deal.openedAt);

        return marker === null
            ? Number.POSITIVE_INFINITY
            : Math.abs(atMs - marker);
    };

    return [...deals].sort(
        (a, b) => distance(a) - distance(b) || a.dealId.localeCompare(b.dealId),
    )[0];
}

/** Запасной путь: открытые сделки компании или контакта на дату звонка. */
function resolveByOpenDeals(
    deals: readonly OpenDealRef[],
    atMs: number,
    path: AiCallLinkPath,
): DealResolution {
    const open = openOnDate(deals, atMs);
    if (open.length === 1) {
        return {
            dealId: open[0].dealId,
            path,
            confidence: 'high',
            reason: 'single-open-deal',
        };
    }
    if (open.length > 1) {
        return {
            dealId: nearestByActivity(open, atMs).dealId,
            path,
            confidence: 'low',
            reason: 'many-open-deals',
        };
    }

    return {
        dealId: null,
        path: 'none',
        confidence: 'none',
        reason: 'no-open-deal',
    };
}

/** Звонок → сделка: прямой путь, конверсия лида и запасной путь. */
function resolveDeal(
    call: CallForLink,
    hints: EpisodeLinkHints,
    atMs: number,
): DealResolution {
    if (call.entityType === 'deal') {
        const main = hints.relatedToMainDeal?.[call.entityId];

        return {
            dealId: main ?? call.entityId,
            path: main ? 'related' : 'deal',
            confidence: 'high',
            reason: main ? 'related-deal' : 'direct-deal',
        };
    }
    if (call.entityType === 'lead') {
        const dealId = hints.leadToDeal?.[call.entityId] ?? null;

        return dealId === null
            ? {
                  dealId: null,
                  path: 'none',
                  confidence: 'none',
                  reason: 'lead-not-converted',
              }
            : {
                  dealId,
                  path: 'lead',
                  confidence: 'high',
                  reason: 'lead-converted',
              };
    }
    const source =
        call.entityType === 'company'
            ? hints.openDealsByCompany
            : hints.openDealsByContact;

    return resolveByOpenDeals(
        source?.[call.entityId] ?? [],
        atMs,
        call.entityType,
    );
}

const notLinked = (
    call: CallForLink,
    resolution: DealResolution,
    reason: AiCallLinkReason,
): CallLink => ({
    callId: call.callId,
    dealId: resolution.dealId,
    episodeKey: null,
    episodeIndex: null,
    stageCode: null,
    confidence: 'none',
    path: resolution.path,
    reason,
});

/**
 * Сцепка звонков с эпизодами (план §4.1). Звонок без сделки или попавший
 * в промежуток вне жизни сделки не сцеплен: `confidence: 'none'` с причиной.
 */
export function linkCallsToEpisodes(
    calls: readonly CallForLink[],
    episodesByEntity: EpisodesByEntity,
    hints: EpisodeLinkHints = {},
): CallLink[] {
    return calls.map(call => {
        const atMs = parseInstant(call.at);
        if (atMs === null) {
            return notLinked(
                call,
                {
                    dealId: null,
                    path: 'none',
                    confidence: 'none',
                    reason: 'no-episode',
                },
                'no-episode',
            );
        }
        const resolution = resolveDeal(call, hints, atMs);
        if (resolution.dealId === null) {
            return notLinked(call, resolution, resolution.reason);
        }
        const episode = episodeAt(
            episodesByEntity[resolution.dealId] ?? [],
            call.at,
        );
        if (episode === null) {
            return notLinked(call, resolution, 'no-episode');
        }

        return {
            callId: call.callId,
            dealId: resolution.dealId,
            episodeKey: episode.key,
            episodeIndex: episode.index,
            stageCode: episode.stageCode,
            confidence: resolution.confidence,
            path: resolution.path,
            reason: resolution.reason,
        };
    });
}

/**
 * Доля сцепленных звонков в процентах — вход гистерезиса `rate ↔ prob`.
 * Сцеплёнными считаются и `high`, и `low`: они дают эпизод, различаясь
 * только уверенностью выбора сделки. Пустой список → 0 %.
 */
export function chainSharePct(links: readonly CallLink[]): number {
    if (links.length === 0) {
        return 0;
    }
    const linked = links.filter(
        link => link.confidence !== 'none' && link.episodeKey !== null,
    ).length;

    return (
        Math.round((linked / links.length) * PCT_IN_UNIT * PCT_PRECISION) /
        PCT_PRECISION
    );
}

/**
 * Уникальные эпизоды, на которые ссылаются сцепленные звонки. Три звонка
 * одного эпизода дают один эпизод — отсюда «одна продажа», а не три.
 */
export function linkedEpisodes(
    links: readonly CallLink[],
    episodesByEntity: EpisodesByEntity,
): DealEpisode[] {
    const byKey = new Map<string, DealEpisode>();
    Object.values(episodesByEntity).forEach(list =>
        list.forEach(episode => byKey.set(episode.key, episode)),
    );
    const seen = new Set<string>();
    const result: DealEpisode[] = [];
    links.forEach(link => {
        if (link.episodeKey === null || seen.has(link.episodeKey)) {
            return;
        }
        seen.add(link.episodeKey);
        const episode = byKey.get(link.episodeKey);
        if (episode) {
            result.push(episode);
        }
    });

    return result;
}

/** Продажи по сцепленным звонкам — счёт по уникальным эпизодам. */
export function countLinkedSales(
    links: readonly CallLink[],
    episodesByEntity: EpisodesByEntity,
): number {
    return linkedEpisodes(links, episodesByEntity).filter(
        episode => episode.success,
    ).length;
}
