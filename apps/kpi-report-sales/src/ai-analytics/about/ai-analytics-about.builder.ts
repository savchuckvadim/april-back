import {
    findParam,
    resolveNumberParam,
    resolveParam,
    type AiAnalyticsParamCode,
    type ParamContext,
    type ParamSource,
} from '@lib/sales-ai-analytics';
import type { PortalModelPayload } from '../domain/assembler/portal-model.types';
import type {
    AiAboutEstimateDto,
    AiAboutModelDto,
} from '../dto/ai-about-model.dto';
import type { AiAboutDto, AiAboutParamDto } from '../dto/ai-about.dto';
import type { ReadinessDto } from '../dto/readiness.dto';
import { AI_SANITY_DATA_QUALITY } from '../steps/sanity.types';
import {
    AI_ABOUT_ENDPOINT_TEXTS,
    AI_ABOUT_ESTIMATES,
    AI_ABOUT_MODEL_REASONS,
    type AiAboutEndpoint,
} from './ai-analytics-about.const';

/**
 * Билдер блока «Как считаем» (план Фазы 2 §6, долг 26): реестр параметров
 * + снапшот модели портала → готовый блок для ручки. Чистая функция без
 * DI: слова берутся из констант среза, числа — ТОЛЬКО из реестра
 * (`resolveParam` по контексту портала) и из нагрузки модели. Ни одного
 * значения, написанного руками: правится дефолт реестра — меняется текст.
 *
 * Без модели портала блок честно деградирует (§5.4): параметры остаются,
 * `model = null`, причина — в `modelReason`.
 */

/** Модель портала на входе: id записи и нагрузка (возможно, неполная). */
export interface AiAboutModelSource {
    readonly id: string;
    readonly payload: Partial<PortalModelPayload>;
}

export interface AiAboutBuildInput {
    readonly endpoint: AiAboutEndpoint;
    /** Слои реестра портала (`AiAnalyticsParamsLoader.load`). */
    readonly registry: ParamContext;
    readonly paramsVersion: string;
    /** Начало сравнимой истории по журналу; '' — ряд не рвался. */
    readonly comparableFrom: string;
    /** Последняя модель портала; null — модели нет. */
    readonly model: AiAboutModelSource | null;
    /** Почему модели нет; без него — «ещё не рассчитана». */
    readonly modelReason?: string;
    /** Запрос менеджера в self_view (B13); не задан — руководитель. */
    readonly selfView?: boolean;
}

const KLEINMAN_SOURCE = 'kleinman';
const ESTIMATED_SOURCE = 'estimated';

/** Параметр реестра с действующим значением на этом портале. */
function paramOf(
    code: AiAnalyticsParamCode,
    registry: ParamContext,
): AiAboutParamDto {
    const descriptor = findParam(code);
    const resolved = resolveParam(code, registry);
    return {
        code,
        title: descriptor?.title ?? code,
        unit: descriptor?.unit ?? '',
        value: resolved.value,
        layer: resolved.source,
        kind: descriptor?.source ?? 'configured',
        description: descriptor?.description ?? '',
        breaksSeries: descriptor?.breaksSeries === true,
        ...(resolved.reason === undefined ? {} : { reason: resolved.reason }),
    };
}

/**
 * Класс источника оценки: по данным — `estimated`; настройка любого слоя
 * портала — `configured`; иначе класс дескриптора реестра (для κ и φ —
 * `hybrid`: прайор до гейта, для λ — `configured`).
 */
function sourceOf(
    estimated: boolean,
    code: AiAnalyticsParamCode,
    registry: ParamContext,
): ParamSource {
    if (estimated) return 'estimated';
    if (resolveParam(code, registry).source !== 'default') return 'configured';
    return findParam(code)?.source ?? 'configured';
}

function estimateOf(
    key: keyof typeof AI_ABOUT_ESTIMATES,
    value: number | null,
    estimated: boolean,
    registry: ParamContext,
    note: string,
): AiAboutEstimateDto {
    const { code, symbol, title } = AI_ABOUT_ESTIMATES[key];
    return {
        code,
        symbol,
        title,
        value,
        source: sourceOf(estimated, code, registry),
        note,
    };
}

const numberOrNull = (value: unknown): number | null =>
    typeof value === 'number' && Number.isFinite(value) ? value : null;

/** Готовность из модели в форме DTO витрины; чужая форма — пустой режим. */
function readinessOf(payload: Partial<PortalModelPayload>): ReadinessDto {
    const readiness = payload.readiness;
    return {
        mode: (readiness?.mode ?? 'descriptive') as ReadinessDto['mode'],
        historyMonths: readiness?.historyMonths ?? 0,
        presentations: readiness?.presentations ?? 0,
        sales: readiness?.sales ?? 0,
        comparableFrom: readiness?.comparableFrom ?? '',
        reasons: [...(readiness?.reasons ?? [])],
        betaSource: payload.betaSource ?? 'none',
        betaCountdown: payload.betaCountdown ?? null,
    };
}

/** Модель портала → раздел блока с источниками κ, φ, λ. */
function modelOf(
    source: AiAboutModelSource,
    registry: ParamContext,
): AiAboutModelDto {
    const payload = source.payload;
    const edges = payload.edges ?? [];
    const kleinman = edges.filter(edge => edge.kappaSource === KLEINMAN_SOURCE);
    const phiEstimated = payload.overdispersion?.source === ESTIMATED_SOURCE;
    return {
        modelSnapshotId: source.id,
        monthKey: payload.monthKey ?? '',
        window: [...(payload.window ?? [])],
        observations: payload.observations ?? 0,
        managers: payload.managers ?? 0,
        reused: payload.reused === true,
        generatedAt: payload.meta?.generatedAt ?? '',
        paramsVersion: payload.meta?.paramsVersion ?? '',
        comparableFrom: payload.meta?.comparableFrom ?? null,
        readiness: readinessOf(payload),
        kappa: estimateOf(
            'kappa',
            numberOrNull(payload.kappa),
            kleinman.length > 0,
            registry,
            `гейт Клейнмана ${kleinman.length > 0 ? 'открыт' : 'закрыт'}: рёбер с оценкой по данным ${kleinman.length} из ${edges.length}`,
        ),
        phi: estimateOf(
            'phi',
            numberOrNull(payload.overdispersion?.value),
            phiEstimated,
            registry,
            phiEstimated
                ? 'оценено по темпам активностей портала'
                : 'собственной оценки в Фазе 2 нет — значение реестра',
        ),
        lambda: estimateOf(
            'lambda',
            resolveNumberParam(AI_ABOUT_ESTIMATES.lambda.code, registry) ??
                null,
            false,
            registry,
            'настройка реестра: оценки из данных нет',
        ),
        estimand: {
            kind: payload.edgeKind ?? 'rate',
            reason: payload.edgeKindReason ?? '',
            chainSharePct: payload.chainSharePct ?? 0,
        },
        sanity: payload.sanity
            ? {
                  day: payload.sanity.day,
                  dataQuality:
                      payload.sanity.readiness?.dataQuality ??
                      AI_SANITY_DATA_QUALITY.unknown,
                  warnings: [...payload.sanity.warnings],
                  warningRules: [
                      ...(payload.sanity.readiness?.warningRules ?? []),
                  ],
              }
            : null,
    };
}

/** Блок «Как считаем» ручки: тексты среза, параметры реестра, модель. */
export function buildAiAnalyticsAbout(input: AiAboutBuildInput): AiAboutDto {
    const text = AI_ABOUT_ENDPOINT_TEXTS[input.endpoint];
    return {
        endpoint: text.endpoint,
        title: text.title,
        purpose: text.purpose,
        sources: [...text.sources],
        howToRead: [...text.howToRead],
        notDoing: [...text.notDoing],
        params: text.params.map(code => paramOf(code, input.registry)),
        paramsVersion: input.paramsVersion,
        comparableFrom: input.comparableFrom,
        model:
            input.model === null ? null : modelOf(input.model, input.registry),
        modelReason:
            input.model === null
                ? (input.modelReason ?? AI_ABOUT_MODEL_REASONS.missing)
                : null,
        selfView: input.selfView === true,
    };
}
