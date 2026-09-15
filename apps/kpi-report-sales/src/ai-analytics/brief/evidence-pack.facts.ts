/**
 * Факты пакета AI-резюме по таблице состава (план Фазы 2, поток 18):
 * чистые функции «источник → факт или ничего». Первый источник — кэш
 * витрины, второй — снапшот; промах обоих означает пропуск факта.
 *
 * Здесь нет ни DI, ни Bitrix, ни времени: числа приходят готовыми, а
 * форматирует их `buildFactText` / `formatFactValue` библиотеки — той же
 * функцией, которой факт-чек разбирает числа буллетов. Формы источников и
 * конструктор факта — в `evidence-pack.types.ts`, чтение источников — в
 * `evidence-pack.builder.ts` (лимит 300 строк на файл, ai/rules).
 */
import { formatFactValue, type AiBriefFact } from '@lib/sales-ai-analytics';
import {
    AI_BRIEF_ATTENTION_LEAKS_TITLE,
    AI_BRIEF_FACT_CODES,
    AI_BRIEF_FACT_SPECS,
    AI_BRIEF_FORECAST_MODES,
} from '../constants/ai-brief.const';
import type { ManagerMonthPayload } from '../domain/assembler/manager-snapshot.types';
import type { PortalModelPayload } from '../domain/assembler/portal-model.types';
import type { AiOverviewDto } from '../dto/ai-overview.dto';
import {
    briefFact,
    type BriefManagerRow,
    type BriefPackSources,
} from './evidence-pack.types';

const sum = (values: readonly number[]): number =>
    values.reduce((acc, value) => acc + value, 0);

/** Менеджеры строки обзора в периметре пакета (пусто — все). */
function inScope(managerId: string, managerIds: readonly string[]): boolean {
    return managerIds.length === 0 || managerIds.includes(managerId);
}

/**
 * 1. `alerts` — алерты пульса; при промахе кэша считаются флаги разборов
 * недельных снапшотов (эквивалент: алерт витрины — тот же риск-флаг).
 */
export function alertsFact(
    sources: BriefPackSources,
    managerIds: readonly string[],
): AiBriefFact | null {
    const { pulse, weeks } = sources;
    if (pulse) {
        const alerts = pulse.alerts.filter(
            alert =>
                alert.managerId !== null &&
                inScope(alert.managerId, managerIds),
        );

        return briefFact(AI_BRIEF_FACT_CODES.alerts, alerts.length, {
            n: alerts.length,
        });
    }
    if (weeks.length === 0) return null;
    const flags = sum(weeks.map(week => week.payload.flags.length));

    return briefFact(AI_BRIEF_FACT_CODES.alerts, flags, { n: weeks.length });
}

/**
 * 2. `attention` — «Внимание» РОПу. Отдельного кэша у среза нет: он
 * считается синхронно над обзором, а в строке лежит только СТАРШАЯ
 * карточка менеджера (`AiManagerRowDto.signal`, `topSignalByManager`),
 * поэтому по кэшу обзора считаются менеджеры с сигналом, а не карточки
 * (их на менеджера бывает до трёх, на отдел — до семи). Подпись факта
 * названа по тому, что реально посчитано: иначе число резюме расходилось
 * бы с вкладкой «Внимание». Второй источник — утечки рёбер из снапшота
 * прогноза, у него по той же причине своя подпись.
 */
export function attentionFact(sources: BriefPackSources): AiBriefFact | null {
    const { overview, forecasts } = sources;
    if (overview) {
        const flagged = overview.managers.filter(row => row.signal !== null);

        return briefFact(AI_BRIEF_FACT_CODES.attention, flagged.length, {
            n: overview.managers.length,
        });
    }
    if (forecasts.length === 0) return null;
    const leaks = sum(forecasts.map(row => row.payload.leaks.length));

    return briefFact(AI_BRIEF_FACT_CODES.attention, leaks, {
        title: AI_BRIEF_ATTENTION_LEAKS_TITLE,
        n: forecasts.length,
    });
}

/** Наибольший разрыв ниже нормы: минимальный Δ и его ребро. */
interface WorstGap {
    gap: number;
    edge: string;
    managerId: string;
}

function worstOverviewGap(overview: AiOverviewDto): WorstGap | null {
    let worst: WorstGap | null = null;
    for (const row of overview.managers) {
        for (const edge of row.funnel) {
            if (edge.gap === undefined) continue;
            if (worst === null || edge.gap < worst.gap) {
                worst = {
                    gap: edge.gap,
                    edge: edge.title,
                    managerId: row.managerId,
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
            if (mu === undefined || edge.n <= 0) continue;
            const gap = edge.s / edge.n - mu;
            if (worst === null || gap < worst.gap) {
                worst = { gap, edge: edge.edge, managerId: row.managerId };
            }
        }
    }

    return worst;
}

/** 3. `funnel_gap` — худший разрыв к норме: кэш обзора, затем снапшоты. */
export function funnelGapFact(sources: BriefPackSources): AiBriefFact | null {
    const { overview, months, model } = sources;
    const worst = overview
        ? worstOverviewGap(overview)
        : model
          ? worstSnapshotGap(months, model)
          : null;
    if (worst === null) return null;
    const spec = AI_BRIEF_FACT_SPECS[AI_BRIEF_FACT_CODES.funnelGap];

    return briefFact(AI_BRIEF_FACT_CODES.funnelGap, worst.gap, {
        title: `${spec.title}: ${worst.edge}`,
        managerId: worst.managerId,
    });
}

/**
 * 4. `plan_vs_fact_sales` — закрытые продажи периода; при промахе кэша
 * берётся финансовый хвост месячных снапшотов вместе со снимком плана
 * руководителя (тогда план попадает в фразу факта).
 */
export function planVsFactSalesFact(
    sources: BriefPackSources,
): AiBriefFact | null {
    const { overview, months } = sources;
    if (overview) {
        const sales = sum(overview.managers.map(row => row.finance.salesCount));

        return briefFact(AI_BRIEF_FACT_CODES.planVsFactSales, sales, {
            n: overview.managers.length,
        });
    }
    if (months.length === 0) return null;
    const sales = sum(months.map(row => row.payload.finance.salesCount));
    const plan = sum(months.map(row => row.payload.planSnapshot?.sales ?? 0));
    const spec = AI_BRIEF_FACT_SPECS[AI_BRIEF_FACT_CODES.planVsFactSales];
    const text =
        plan > 0
            ? `${spec.title}: ${formatFactValue(sales, spec.unit)} из ` +
              `${formatFactValue(plan, spec.unit)}`
            : undefined;

    return briefFact(AI_BRIEF_FACT_CODES.planVsFactSales, sales, {
        n: months.length,
        ...(text === undefined ? {} : { text }),
    });
}

/** 5. `pipeline_from_stage` — λ_pipe снапшота прогноза; null — истории стадий нет. */
export function pipelineFact(sources: BriefPackSources): AiBriefFact | null {
    const values = sources.forecasts
        .map(row => row.payload.pipelineExpected)
        .filter((value): value is number => value !== null);
    if (values.length === 0) return null;

    return briefFact(AI_BRIEF_FACT_CODES.pipelineFromStage, sum(values), {
        n: values.length,
    });
}

/**
 * 6. `discipline_next_step` — доля «шаг с датой»: пульс, при промахе —
 * чек-листы недельных снапшотов (взвешенное по объёму среднее, проценты
 * переводятся в долю).
 */
export function disciplineFact(sources: BriefPackSources): AiBriefFact | null {
    const { pulse, weeks } = sources;
    if (pulse) {
        const rate = pulse.nextStepDateRate;

        return briefFact(AI_BRIEF_FACT_CODES.disciplineNextStep, rate.value, {
            n: rate.n,
        });
    }
    let weighted = 0;
    let total = 0;
    for (const week of weeks) {
        for (const cell of week.payload.byType) {
            const metric = cell.checklists.nextStepDateRatePct;
            if (metric.value === null || metric.n <= 0) continue;
            weighted += metric.value * metric.n;
            total += metric.n;
        }
    }
    if (total === 0) return null;

    return briefFact(
        AI_BRIEF_FACT_CODES.disciplineNextStep,
        weighted / total / 100,
        { n: total },
    );
}

/**
 * 7. `calls_over_threshold` — разобранные звонки длиннее порога из
 * месячных снапшотов (эквивалент вкладки calling-statistic: она живёт в
 * другом приложении и в пакет не входит).
 */
export function callsFact(sources: BriefPackSources): AiBriefFact | null {
    const { months } = sources;
    if (months.length === 0) return null;
    const calls = sum(
        months.map(row => sum(row.payload.byType.map(type => type.n))),
    );

    return briefFact(AI_BRIEF_FACT_CODES.callsOverThreshold, calls, {
        n: months.length,
    });
}

/** 8. `airtime` — эфирное время отдела из кэша модуля airtime. */
export function airtimeFact(sources: BriefPackSources): AiBriefFact | null {
    const { airtime } = sources;
    if (airtime === null || airtime.cells === 0) return null;

    return briefFact(AI_BRIEF_FACT_CODES.airtime, airtime.totalSeconds, {
        n: airtime.cells,
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
 */
export function dataQualityFact(sources: BriefPackSources): AiBriefFact | null {
    const { model, overview } = sources;
    const reasons = model
        ? model.readiness.reasons
        : (overview?.readiness.reasons ?? null);
    if (reasons === null) return null;
    const warnings = model?.sanity?.warnings.length ?? 0;

    return briefFact(
        AI_BRIEF_FACT_CODES.dataQuality,
        reasons.length + warnings,
        { n: reasons.length + warnings },
    );
}
