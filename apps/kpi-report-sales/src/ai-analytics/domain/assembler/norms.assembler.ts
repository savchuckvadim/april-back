/**
 * Нормы менеджера для витрины (план §4.2, поток 16b): чтение готовых
 * leave-one-out норм из снапшота `ai-analytics-portal-model`.
 *
 * Витрина НИЧЕГО не пересчитывает: LOO по 6–12 месяцам × менеджеры ×
 * рёбра считает месячный шаг конвейера и кладёт результат в снапшот
 * (`managerNorms`), иначе каждый запрос обзора превращался бы в
 * квадратичный пересчёт. Здесь — только разбор чужой нагрузки,
 * сопоставление с нормой портала и флаг «норма полосы занижена составом».
 *
 * Нагрузка снапшота читается структурно: чужая или неполная форма
 * деградирует до «норм нет» и возвращает витрину к поведению Фазы 1b
 * (`priorSource: 'none'`, штатная деградация §5.4).
 *
 * Чистые функции: без DI, Bitrix и `new Date()`.
 */
import type { NormLayer } from '@lib/sales-ai-analytics';
import {
    AI_ANALYTICS_NORM_LIMITS,
    AiAnalyticsNormFlag,
} from '../../constants/ai-norms.const';
import type { AiAnalyticsPriorSource } from '../../constants/ai-overview.const';
import type { PortalModelView } from './overview-model.types';
import type {
    PortalEdgeNormFacts,
    PortalManagerEdgeNorm,
    PortalManagerNorms,
} from './portal-model.types';

/** Слой нормы как источник приора витрины (совпадает с `NormLayer`). */
export type NormLayerSource = AiAnalyticsPriorSource & NormLayer;

/** Норма одного ребра для строки менеджера. */
export interface ManagerEdgeNorm {
    edge: string;
    /** μ слоя без собственных данных менеджера (leave-one-out). */
    mu: number;
    /** Слой, с которого взята норма: полоса стажа, портал, дефолт дампа. */
    layer: NormLayerSource;
    /** Знаменатель слоя. */
    n: number;
    /** Доля данных слоя в норме. */
    w: number;
    /** Сила усадки κ ребра. */
    kappa: number;
    /** Норма портала целиком; null — норма и так портальная. */
    portalMu: number | null;
    /** Флаг нормы; null — норма вопросов не вызывает. */
    flag: AiAnalyticsNormFlag | null;
}

/** Нормы менеджера по всем рёбрам воронки. */
export interface ManagerNorms {
    managerId: string;
    /** Полоса, по которой взята норма слоя; null — сразу портал. */
    tenureBand: string | null;
    edges: ManagerEdgeNorm[];
}

export type { PortalModelView };

const isFiniteNumber = (value: unknown): value is number =>
    typeof value === 'number' && Number.isFinite(value);

/**
 * Слой без знаменателя — не норма: сравнивать не с чем, а усадка к нему
 * увела бы долю менеджера к нулю (единственный менеджер с данными по
 * ребру получает пустой leave-one-out пул: μ = 0, n = 0, w = 0). Такое
 * ребро остаётся в поведении Фазы 1b (§5.4). Когда появится слой дампа
 * (`kappa_portal_to_global > 0`, Фазы 3–4), у него будет собственный вес
 * и правило придётся ослабить до «нет ни знаменателя, ни веса».
 */
const hasLayerData = (n: unknown): boolean => isFiniteNumber(n) && n > 0;

/** Нормы портала по рёбрам; чужая форма записи отбрасывается. */
function portalEdges(model: PortalModelView): Map<string, PortalEdgeNormFacts> {
    const edges = Array.isArray(model.edges) ? model.edges : [];
    return new Map(
        edges
            .filter(
                edge =>
                    typeof edge?.edge === 'string' &&
                    isFiniteNumber(edge.mu) &&
                    hasLayerData(edge.n),
            )
            .map(edge => [edge.edge, edge] as const),
    );
}

/** Слой нормы; неизвестное значение читается как «портал». */
function layerOf(value: unknown): NormLayerSource {
    return value === 'tenure' || value === 'global' ? value : 'portal';
}

/**
 * Норма портала как вторая норма ребра: она нужна фронту, когда норма
 * взята с полосы (стажа или уровня) — тогда видно оба разрыва. Норма и
 * так портальная — второй нормы нет.
 */
function portalMuOf(
    layer: NormLayerSource,
    portal: PortalEdgeNormFacts | undefined,
): number | null {
    return layer === 'portal' || portal === undefined ? null : portal.mu;
}

/**
 * Флаг «норма полосы занижена составом»: μ_lk < 0,7·μ_pk — полоса
 * отличается от портала не мастерством, а составом, и сравнивать
 * менеджера только с ней нечестно.
 */
function flagOf(
    mu: number,
    portalMu: number | null,
): AiAnalyticsNormFlag | null {
    if (portalMu === null || portalMu <= 0) {
        return null;
    }
    return mu < AI_ANALYTICS_NORM_LIMITS.levelUnderstatedRatio * portalMu
        ? 'level_norm_understated'
        : null;
}

/** Ребро снапшота → норма ребра витрины; чужая форма отбрасывается. */
function toEdgeNorm(
    norm: PortalManagerEdgeNorm,
    portal: PortalEdgeNormFacts | undefined,
    fallbackKappa: number,
): ManagerEdgeNorm[] {
    if (
        typeof norm?.edge !== 'string' ||
        !isFiniteNumber(norm.mu) ||
        !hasLayerData(norm.n)
    ) {
        return [];
    }
    const layer = layerOf(norm.layer);
    const portalMu = portalMuOf(layer, portal);
    return [
        {
            edge: norm.edge,
            mu: norm.mu,
            layer,
            n: isFiniteNumber(norm.n) ? norm.n : 0,
            w: isFiniteNumber(norm.w) ? norm.w : 0,
            kappa: isFiniteNumber(norm.kappa)
                ? norm.kappa
                : (portal?.kappa ?? fallbackKappa),
            portalMu,
            flag: flagOf(norm.mu, portalMu),
        },
    ];
}

/** Менеджер без месяцев в окне: норма портала — для него уже LOO. */
function fromPortal(
    edges: Map<string, PortalEdgeNormFacts>,
    fallbackKappa: number,
): ManagerEdgeNorm[] {
    return [...edges.values()].map(edge => ({
        edge: edge.edge,
        mu: edge.mu,
        layer: layerOf(edge.layer),
        n: isFiniteNumber(edge.n) ? edge.n : 0,
        w: 0,
        kappa: isFiniteNumber(edge.kappa) ? edge.kappa : fallbackKappa,
        portalMu: null,
        flag: null,
    }));
}

/**
 * Нормы менеджера из модели портала. Норм нет (модели нет, в ней нет
 * менеджерских норм либо рёбер) — `null`, и витрина остаётся в поведении
 * Фазы 1b. Менеджер есть в модели, но своих норм у него нет (в окне не
 * было месяцев) — берётся норма портала: его данных в ней всё равно нет.
 */
export function buildManagerNorms(
    model: PortalModelView | null | undefined,
    managerId: string,
    band: string | null = null,
): ManagerNorms | null {
    if (!model) {
        return null;
    }
    const managerNorms = Array.isArray(model.managerNorms)
        ? model.managerNorms
        : [];
    if (managerNorms.length === 0) {
        return null;
    }
    const edges = portalEdges(model);
    const fallbackKappa = isFiniteNumber(model.kappa) ? model.kappa : 0;
    const own: PortalManagerNorms | undefined = managerNorms.find(
        item => item?.managerId === managerId,
    );
    const list = own
        ? (own.edges ?? []).flatMap(norm =>
              toEdgeNorm(norm, edges.get(norm?.edge), fallbackKappa),
          )
        : fromPortal(edges, fallbackKappa);

    return list.length === 0
        ? null
        : {
              managerId,
              tenureBand: own?.tenureBand ?? band,
              edges: list,
          };
}
