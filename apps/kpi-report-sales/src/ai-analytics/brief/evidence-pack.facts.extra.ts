/**
 * Факты пакета AI-резюме без прошлого периода: разрыв к норме (сравнение
 * с нормой), ожидание из сделок в работе, эфирное время, прогноз месяца и
 * качество данных. Чистые функции «источник → факт или ничего»; правила
 * с прошлым периодом — в `evidence-pack.facts.ts`, фокус и действия — в
 * `evidence-pack.focus.ts` (лимит 300 строк на файл, ai/rules).
 */
import {
    AI_BRIEF_DATA_QUALITY_SIGNALS,
    confidenceFor,
    formatFactValue,
    lowerFirst,
    ruCount,
    type AiBriefFact,
    type RuPluralForms,
} from '@lib/sales-ai-analytics';
import {
    AI_BRIEF_BASIS_TEXTS,
    AI_BRIEF_DATE_QUALITY_CODES,
    AI_BRIEF_FACT_CODES,
    AI_BRIEF_FACT_SPECS,
    AI_BRIEF_FORECAST_MODES,
} from '../constants/ai-brief.const';
import { AI_ANALYTICS_FUNNEL_EDGES } from '../constants/ai-overview.const';
import type { ManagerMonthPayload } from '../domain/assembler/manager-snapshot.types';
import type { PortalModelPayload } from '../domain/assembler/portal-model.types';
import type { AiFunnelEdgeDto } from '../dto/ai-funnel-edge.dto';
import type { AiOverviewDto } from '../dto/ai-overview.dto';
import { rowsInScope } from './evidence-pack.overview';
import {
    briefFact,
    type BriefManagerRow,
    type BriefPackSources,
} from './evidence-pack.types';

const sum = (values: readonly number[]): number =>
    values.reduce((acc, value) => acc + value, 0);

/** Наибольший разрыв ниже нормы: минимальный Δ, его ребро и норма. */
interface WorstGap {
    gap: number;
    /** Название ребра словами («звонок → презентация»), не код. */
    edge: string;
    managerId: string;
    /** Норма ребра (доля 0..1); null — ребро без нормы. */
    norm: number | null;
}

/** Название ребра по коду снапшота; чужой код — как есть. */
function edgeTitleOf(code: string): string {
    return (
        AI_ANALYTICS_FUNNEL_EDGES.find(edge => edge.code === code)?.title ??
        code
    );
}

/**
 * Шаг отстаёт от нормы так, что об этом можно говорить: разрыв
 * отрицательный, обзор не пометил его «в пределах шума» (`none`), а шаг
 * — доля перехода, а не интенсивность (её разрыв в процентах не читается).
 */
function isBehindNorm(edge: AiFunnelEdgeDto): edge is AiFunnelEdgeDto & {
    gap: number;
} {
    return (
        edge.gap !== undefined &&
        edge.gap < 0 &&
        (edge.gapDirection === undefined || edge.gapDirection === 'below') &&
        edge.estimand !== 'rate'
    );
}

function worstOverviewGap(
    overview: AiOverviewDto,
    managerIds: readonly string[],
): WorstGap | null {
    let worst: WorstGap | null = null;
    for (const row of rowsInScope(overview, managerIds)) {
        for (const edge of row.funnel) {
            if (!isBehindNorm(edge)) continue;
            if (worst === null || edge.gap < worst.gap) {
                worst = {
                    gap: edge.gap,
                    edge: edge.title,
                    managerId: row.managerId,
                    norm: edge.levelNorm ?? edge.portalNorm ?? null,
                };
            }
        }
    }

    return worst;
}

function worstSnapshotGap(
    months: readonly BriefManagerRow<ManagerMonthPayload>[],
    model: PortalModelPayload,
): WorstGap | null {
    const norms = new Map(model.edges.map(edge => [edge.edge, edge.mu]));
    let worst: WorstGap | null = null;
    for (const row of months) {
        for (const edge of row.payload.edges) {
            const mu = norms.get(edge.edge);
            // Мало наблюдений — доля шумит, разрыв по ней не считается.
            if (
                mu === undefined ||
                confidenceFor(edge.n, 'rate').level === 'none'
            ) {
                continue;
            }
            const gap = edge.s / edge.n - mu;
            if (gap >= 0) continue;
            if (worst === null || gap < worst.gap) {
                worst = {
                    gap,
                    edge: edgeTitleOf(edge.edge),
                    managerId: row.managerId,
                    norm: mu,
                };
            }
        }
    }

    return worst;
}

/**
 * 6. `funnel_gap` — худшее отставание от нормы: кэш обзора, затем
 * снапшоты. Факта нет, если ни один шаг от нормы не отстаёт. Сравнивается
 * с нормой, а не с прошлым периодом; фраза словами и без знака минус:
 * «Сильнее всего отстаём от нормы на шаге «звонок → презентация»: на 6 %».
 */
export function funnelGapFact(
    sources: BriefPackSources,
    managerIds: readonly string[],
): AiBriefFact | null {
    const { overview, months, model } = sources;
    const worst = overview
        ? worstOverviewGap(overview, managerIds)
        : model
          ? worstSnapshotGap(months, model)
          : null;
    if (worst === null) return null;
    const spec = AI_BRIEF_FACT_SPECS[AI_BRIEF_FACT_CODES.funnelGap];
    const title = `${spec.title} «${lowerFirst(worst.edge)}»`;

    return briefFact(AI_BRIEF_FACT_CODES.funnelGap, worst.gap, {
        title,
        text: `${title}: на ${formatFactValue(Math.abs(worst.gap), spec.unit)}`,
        managerId: worst.managerId,
        norm: worst.norm,
        basis: AI_BRIEF_BASIS_TEXTS.norm,
    });
}

/** 7. `pipeline_from_stage` — ожидание из сделок в работе (снапшот прогноза); null — истории стадий нет. */
export function pipelineFact(sources: BriefPackSources): AiBriefFact | null {
    const values = sources.forecasts
        .map(row => row.payload.pipelineExpected)
        .filter((value): value is number => value !== null);
    if (values.length === 0) return null;

    return briefFact(AI_BRIEF_FACT_CODES.pipelineFromStage, sum(values), {
        n: values.length,
    });
}

const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;
const HOUR_FORMS: RuPluralForms = ['час', 'часа', 'часов'];
const MINUTE_FORMS: RuPluralForms = ['минута', 'минуты', 'минут'];

/** Длительность словами: «12 часов 30 минут», «45 минут», «3 часа». */
function durationText(totalSeconds: number): string {
    const minutes = Math.round(Math.max(totalSeconds, 0) / SECONDS_PER_MINUTE);
    const hours = Math.floor(minutes / MINUTES_PER_HOUR);
    const rest = minutes % MINUTES_PER_HOUR;
    const parts = [
        ...(hours > 0 ? [ruCount(hours, HOUR_FORMS)] : []),
        ...(rest > 0 || hours === 0 ? [ruCount(rest, MINUTE_FORMS)] : []),
    ];

    return parts.join(' ');
}

/**
 * 8. `airtime` — эфирное время отдела за месяц из кэша модуля airtime;
 * фраза — часами и минутами словами, значение факта — в секундах.
 */
export function airtimeFact(sources: BriefPackSources): AiBriefFact | null {
    const { airtime } = sources;
    if (airtime === null || airtime.cells === 0) return null;
    const spec = AI_BRIEF_FACT_SPECS[AI_BRIEF_FACT_CODES.airtime];

    return briefFact(AI_BRIEF_FACT_CODES.airtime, airtime.totalSeconds, {
        n: airtime.cells,
        text: `${spec.title}: ${durationText(airtime.totalSeconds)}`,
    });
}

/** 9. `forecast_p50` — прогноз месяца; только при готовности не ниже forecast. */
export function forecastFact(sources: BriefPackSources): AiBriefFact | null {
    const { forecasts, model } = sources;
    const mode = model?.readiness.mode;
    const ready = (AI_BRIEF_FORECAST_MODES as readonly string[]).includes(
        mode ?? '',
    );
    if (!ready || forecasts.length === 0) return null;

    return briefFact(
        AI_BRIEF_FACT_CODES.forecastP50,
        sum(forecasts.map(row => row.payload.p50)),
        { n: forecasts.length },
    );
}

/**
 * 10. `data_quality` — причины готовности плюс предупреждения недельной
 * санити-панели модели; при отсутствии модели берётся готовность обзора.
 * Сигнал факта говорит шаблону, про даты ли замечания.
 */
export function dataQualityFact(sources: BriefPackSources): AiBriefFact | null {
    const { model, overview } = sources;
    const reasons = model
        ? model.readiness.reasons
        : (overview?.readiness.reasons ?? null);
    if (reasons === null) return null;
    const rules = model?.sanity?.rules ?? [];
    const warningCodes = rules
        .filter(rule => rule.status === 'warning')
        .map(rule => String(rule.rule));
    const warnings = model?.sanity?.warnings.length ?? 0;
    const codes = [...reasons, ...warningCodes];
    const aboutDates = codes.some(code =>
        AI_BRIEF_DATE_QUALITY_CODES.includes(code),
    );

    return briefFact(
        AI_BRIEF_FACT_CODES.dataQuality,
        reasons.length + warnings,
        {
            n: reasons.length + warnings,
            signal: aboutDates
                ? AI_BRIEF_DATA_QUALITY_SIGNALS.dates
                : AI_BRIEF_DATA_QUALITY_SIGNALS.other,
        },
    );
}
