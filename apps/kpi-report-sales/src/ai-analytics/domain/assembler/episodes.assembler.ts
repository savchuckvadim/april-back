/**
 * Сборка эпизодов сделок и всего, что из них следует (план Фазы 2, поток 13;
 * план ai-sales-analytics §4.1 «Три единицы анализа», §4.2, §4.4, §4.8).
 *
 * Ассемблер НИЧЕГО не считает сам — он оркеструет готовые чистые функции
 * библиотеки: эпизоды (`buildEpisodes`), сцепку звонков
 * (`linkCallsToEpisodes`, `chainSharePct`), стадийные θ (`stageTheta`),
 * факты сроков (`stageSlaFacts`), лаги продаж (`saleLags`), трактовку ребра
 * с гистерезисом 80/70 (`resolveEdgeEstimand`) и плацебо-тест меток времени
 * (`timestampLeakShare`). Здесь только склейка и порядок вызовов.
 *
 * Время — параметром (`now`), `new Date()` внутри нет: пересчёт на той же
 * фикстуре обязан давать тот же ответ.
 */
import {
    PBX_DEAL_SALES_BASE_STAGE_CODE,
    type PbxDealSalesBaseStageCode,
} from '@lib/portal-lib/pbx-domain/portal-deal/sales/base/const/pbx-deal-sales-base-stages.const';
import {
    type AiEdgeEstimand,
    type CallForLink,
    type CallLink,
    type DealEpisode,
    type EpisodeLinkHints,
    type EpisodesByEntity,
    type ResolveEdgeEstimandResult,
    type SaleLagFact,
    type SaleTimestampFact,
    type ShrinkPrior,
    type StageSlaFact,
    type StageTheta,
    type StageTransition,
    type TimestampLeakResult,
    buildEpisodes,
    chainSharePct,
    countLinkedSales,
    groupEpisodesByEntity,
    linkCallsToEpisodes,
    parseInstant,
    resolveEdgeEstimand,
    saleLags,
    stageQuantileOf,
    stageSlaFacts,
    stageTheta,
    timestampLeakShare,
} from '@lib/sales-ai-analytics';

/** Средняя длина месяца в днях — только для глубины истории в месяцах. */
const AVG_MONTH_DAYS = 30.44;

/** Миллисекунд в сутках. */
const MS_PER_DAY = 86_400_000;

/** Точность глубины истории и медианы цикла: два знака. */
const PRECISION = 100;

/** Стадия презентации и стадия отправленного счёта — метки плацебо-теста. */
const PRESENTATION_STAGE: PbxDealSalesBaseStageCode =
    PBX_DEAL_SALES_BASE_STAGE_CODE.presentation;
const INVOICE_STAGE: PbxDealSalesBaseStageCode =
    PBX_DEAL_SALES_BASE_STAGE_CODE.documentSend;

/** Вход сборки: переходы, звонки и настройки расчёта из реестра. */
export interface EpisodesAssemblyInput {
    /** Нормализованные переходы стадий (маппер шага истории). */
    readonly transitions: readonly StageTransition[];
    /** Звонки со ссылкой на сущность CRM; пусто — сцепки нет. */
    readonly calls?: readonly CallForLink[];
    /** Подсказки сцепки: лид → сделка, xo → основная, открытые сделки. */
    readonly hints?: EpisodeLinkHints;
    /** Момент расчёта, ISO 8601 (цензура открытых эпизодов). */
    readonly now: string;
    /** Трактовка ребра на прошлом пересчёте (гистерезис только вперёд). */
    readonly currentEstimand?: AiEdgeEstimand;
    /** `deal_chain_min_pct` — вход в режим вероятностей. */
    readonly enterPct?: number;
    /** `deal_chain_exit_pct` — выход из режима вероятностей. */
    readonly exitPct?: number;
    /** Норма слоя μ и сила усадки κ стадийных θ. */
    readonly prior?: ShrinkPrior;
    /** Медиана цикла из реестра — запасное значение до гейта. */
    readonly cycleMedianDefault?: number;
    /** Минимум продаж, с которого медиана цикла считается по фактам. */
    readonly minSales?: number;
    /** Порог доли протечки меток времени (`dq.timestamp_leak_max`). */
    readonly timestampLeakMax?: number;
    /** Готовые метки продаж; без них берутся метки из истории стадий. */
    readonly saleTimestamps?: readonly SaleTimestampFact[];
}

/**
 * Сцепка звонков с эпизодами: доля, связи и трактовка ребра.
 *
 * Это и есть форма ключа шины `chain` (шаг истории стадий кладёт объект
 * целиком): финансы и модель портала читают долю из `sharePct`
 * (`readChainSharePct`), прогноз — `links`, модель — `estimand`. Полей-дублей
 * под читателей здесь нет — контракт закреплён `bus-contract.spec.ts`.
 */
export interface EpisodesChain {
    /** Доля сцепленных звонков, % (вход гистерезиса `rate ↔ prob`). */
    readonly sharePct: number;
    /** Сцепка каждого звонка (в том числе несцепленного, с причиной). */
    readonly links: readonly CallLink[];
    /** Звонков со сцепкой (`high` или `low`). */
    readonly linked: number;
    /** Продаж по уникальным эпизодам — без двойного счёта звонков. */
    readonly sales: number;
    /** Трактовка ребра и почему она такая. */
    readonly estimand: ResolveEdgeEstimandResult;
}

/** Результат сборки: то, что шаг раскладывает по шине конвейера. */
export interface EpisodesAssembly {
    /** Эпизоды по сущностям — вход сцепки и прогноза. */
    readonly episodesByEntity: EpisodesByEntity;
    /** Те же эпизоды плоским списком, в порядке сущность → индекс. */
    readonly episodes: readonly DealEpisode[];
    /** Открытые (цензурированные) эпизоды — пайплайн на дату расчёта. */
    readonly openEpisodes: readonly DealEpisode[];
    /** Вероятность продажи из стадии с усадкой к норме слоя. */
    readonly stageThetas: readonly StageTheta[];
    /** Факты сроков стадий: p25/p50/p90 закрытых эпизодов. */
    readonly slaFacts: Record<string, StageSlaFact>;
    /** Лаги продаж под оценку `F(d)`. */
    readonly saleLags: readonly SaleLagFact[];
    /** Доля сцепки, % (дубль `chain.sharePct` — им пользуется гистерезис). */
    readonly chainSharePct: number;
    /** Сцепка звонков с эпизодами. */
    readonly chain: EpisodesChain;
    /** Сцепка каждого звонка (дубль `chain.links` по контракту потока). */
    readonly links: readonly CallLink[];
    /** Плацебо-тест меток времени: доля продаж «закрыто до активности». */
    readonly leak: TimestampLeakResult;
    /** Медиана цикла продажи, дней (факт либо значение реестра). */
    readonly cycleMedianDays: number;
    /** Глубина истории стадий в месяцах — гейт «≥ 3 мес.». */
    readonly historyMonths: number;
}

const round = (value: number): number =>
    Math.round(value * PRECISION) / PRECISION;

/**
 * Глубина истории в месяцах: размах меток времени переходов. Меньше двух
 * разобранных меток — 0: судить о глубине не по чему.
 */
export function historyDepthMonths(
    transitions: readonly StageTransition[],
): number {
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    let known = 0;
    for (const transition of transitions) {
        const at = parseInstant(transition.at);
        if (at === null) continue;
        known += 1;
        min = Math.min(min, at);
        max = Math.max(max, at);
    }

    return known < 2 ? 0 : round((max - min) / MS_PER_DAY / AVG_MONTH_DAYS);
}

/** Последняя метка сущности на стадии; null — стадии не было. */
function lastStageAt(
    transitions: readonly StageTransition[],
    stageCode: string,
): string | null {
    let bestAt: string | null = null;
    let bestMs = Number.NEGATIVE_INFINITY;
    for (const transition of transitions) {
        if (transition.stageCode !== stageCode) continue;
        const at = parseInstant(transition.at);
        if (at === null || at <= bestMs) continue;
        bestMs = at;
        bestAt = transition.at;
    }

    return bestAt;
}

/**
 * Метки продаж для плацебо-теста из самой истории стадий: дата продажи —
 * конец успешного эпизода, метки активности — последние заходы сделки на
 * стадии презентации и отправленного счёта. Возврат сделки на презентацию
 * ПОСЛЕ продажи и есть та самая протечка «оформлено задним числом».
 */
export function saleTimestampFacts(
    episodesByEntity: EpisodesByEntity,
    transitions: readonly StageTransition[],
): SaleTimestampFact[] {
    const byEntity = new Map<string, StageTransition[]>();
    for (const transition of transitions) {
        const list = byEntity.get(transition.entityId) ?? [];
        list.push(transition);
        byEntity.set(transition.entityId, list);
    }
    const facts: SaleTimestampFact[] = [];
    for (const [entityId, episodes] of Object.entries(episodesByEntity)) {
        const sale = episodes.find(
            episode => episode.success && episode.endedAt !== null,
        );
        if (!sale?.endedAt) continue;
        const entityTransitions = byEntity.get(entityId) ?? [];
        facts.push({
            episodeKey: sale.key,
            closedAt: sale.endedAt,
            lastPresentationAt: lastStageAt(
                entityTransitions,
                PRESENTATION_STAGE,
            ),
            lastInvoiceAt: lastStageAt(entityTransitions, INVOICE_STAGE),
        });
    }

    return facts;
}

/**
 * Медиана цикла: p50 лагов состоявшихся продаж, если их не меньше гейта,
 * иначе значение реестра (`cycle_median_days`). Ноль продаж не превращается
 * в «цикл нулевой».
 */
export function medianCycleDays(
    lags: readonly SaleLagFact[],
    minSales: number,
    fallback: number,
): number {
    const closed = lags
        .filter(lag => !lag.censored)
        .map(lag => lag.lagDays)
        .filter(days => Number.isFinite(days));
    if (closed.length < Math.max(1, minSales)) {
        return fallback;
    }

    return round(stageQuantileOf(closed, 0.5));
}

/**
 * Сборка эпизодов по нормализованным переходам: эпизоды → сцепка звонков →
 * стадийные θ, факты сроков, лаги продаж, трактовка ребра и плацебо-тест
 * меток времени.
 */
export function assembleEpisodes(
    input: EpisodesAssemblyInput,
): EpisodesAssembly {
    const episodes = buildEpisodes(input.transitions, { now: input.now });
    const episodesByEntity = groupEpisodesByEntity(episodes);
    const links = linkCallsToEpisodes(
        input.calls ?? [],
        episodesByEntity,
        input.hints ?? {},
    );
    const sharePct = chainSharePct(links);
    const estimand = resolveEdgeEstimand({
        chainSharePct: sharePct,
        ...(input.currentEstimand ? { current: input.currentEstimand } : {}),
        ...(input.enterPct === undefined ? {} : { enterPct: input.enterPct }),
        ...(input.exitPct === undefined ? {} : { exitPct: input.exitPct }),
    });
    const lags = saleLags(episodes, { includeOpen: true });

    return {
        episodesByEntity,
        episodes,
        openEpisodes: episodes.filter(episode => episode.end === 'censored'),
        stageThetas: stageTheta(
            episodes,
            input.prior ? { prior: input.prior } : {},
        ),
        slaFacts: stageSlaFacts(episodes),
        saleLags: lags,
        chainSharePct: sharePct,
        chain: {
            sharePct,
            links,
            linked: links.filter(link => link.episodeKey !== null).length,
            sales: countLinkedSales(links, episodesByEntity),
            estimand,
        },
        links,
        leak: timestampLeakShare(
            input.saleTimestamps ??
                saleTimestampFacts(episodesByEntity, input.transitions),
            input.timestampLeakMax,
        ),
        cycleMedianDays: medianCycleDays(
            lags,
            input.minSales ?? 1,
            input.cycleMedianDefault ?? 0,
        ),
        historyMonths: historyDepthMonths(input.transitions),
    };
}
