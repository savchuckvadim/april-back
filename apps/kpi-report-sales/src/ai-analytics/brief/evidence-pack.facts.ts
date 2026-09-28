/**
 * Факты пакета AI-резюме, у которых есть прошлый период (версия 2 «что
 * изменилось»): сигналы риска, «Внимание», продажи, дисциплина, звонки.
 * Чистые функции «источник → факт или ничего». Первый источник — кэш
 * обзора периода (у него же и прошлый период — из `prevFacts`), второй —
 * пульс и снапшоты; промах всех означает пропуск факта.
 *
 * Сравнение одно — период против прошлого периода той же длины, и только
 * когда обе стороны посчитаны одинаково (по обзору своего окна). Факты
 * запасных источников (пульс, недельные и месячные снапшоты) несут число
 * за другое окно, поэтому с прошлым периодом не сравниваются.
 *
 * Здесь нет ни DI, ни Bitrix, ни времени: числа приходят готовыми, а
 * форматирует их `briefFact` библиотечным правилом — тем же, которым
 * факт-чек разбирает числа буллетов. Остальные факты — в
 * `evidence-pack.facts.extra.ts` и `evidence-pack.focus.ts`.
 */
import { formatFactValue, type AiBriefFact } from '@lib/sales-ai-analytics';
import {
    AI_BRIEF_ATTENTION_LEAKS_TITLE,
    AI_BRIEF_BASIS_TEXTS,
    AI_BRIEF_FACT_CODES,
    AI_BRIEF_FACT_SPECS,
    AI_BRIEF_FALLBACK_TITLES,
} from '../constants/ai-brief.const';
import type { ManagerMonthPayload } from '../domain/assembler/manager-snapshot.types';
import type { AiManagerRowDto } from '../dto/ai-manager-row.dto';
import {
    countSignals,
    inScope,
    nextStepShare,
    rowsInScope,
    sumAnalyzed,
    sumRiskCalls,
    sumSales,
    weightedRate,
} from './evidence-pack.overview';
import type { BriefPrevFacts } from './evidence-pack.prev';
import {
    briefFact,
    type BriefFactOptions,
    type BriefManagerRow,
    type BriefPackSources,
} from './evidence-pack.types';

const sum = (values: readonly number[]): number =>
    values.reduce((acc, value) => acc + value, 0);

const PERCENT = 100;

/**
 * Сравнение с прошлым периодом: число из `prevFacts`, снятое, если
 * прошлый период раньше сравнимой истории.
 */
function periodPrev(
    sources: BriefPackSources,
    pick: (prev: BriefPrevFacts) => number | null,
): BriefFactOptions {
    const prev = sources.prevFacts ? pick(sources.prevFacts) : null;

    return {
        prev,
        comparable: prev !== null && !sources.beforeComparable,
        basis: AI_BRIEF_BASIS_TEXTS.period,
    };
}

/**
 * Сравнение факта, который считается по разборам звонков: если за период
 * не разобрано ни одного звонка, ноль значит «не разбирали», а не «не
 * было», и сравнение снимается.
 */
function analysisPrev(
    sources: BriefPackSources,
    rows: readonly AiManagerRowDto[],
    pick: (prev: BriefPrevFacts) => number | null,
): BriefFactOptions {
    const options = periodPrev(sources, pick);

    return sumAnalyzed(rows) > 0
        ? options
        : { ...options, prev: null, comparable: false };
}

/**
 * 1. `alerts` — риск-звонки периода по кэшу обзора (с прошлым периодом);
 * при промахе — алерты пульса за последние рабочие дни, затем флаги
 * разборов недельных снапшотов (оба — со своей подписью и без сравнения).
 */
export function alertsFact(
    sources: BriefPackSources,
    managerIds: readonly string[],
): AiBriefFact | null {
    const { overview, pulse, weeks } = sources;
    if (overview) {
        const rows = rowsInScope(overview, managerIds);

        return briefFact(AI_BRIEF_FACT_CODES.alerts, sumRiskCalls(rows), {
            n: rows.length,
            ...analysisPrev(sources, rows, prev => prev.alerts),
        });
    }
    if (pulse) {
        const alerts = pulse.alerts.filter(
            alert =>
                alert.managerId !== null &&
                inScope(alert.managerId, managerIds),
        );

        return briefFact(AI_BRIEF_FACT_CODES.alerts, alerts.length, {
            title: AI_BRIEF_FALLBACK_TITLES.alertsPulse,
            n: alerts.length,
        });
    }
    if (weeks.length === 0) return null;
    const flags = sum(weeks.map(week => week.payload.flags.length));

    return briefFact(AI_BRIEF_FACT_CODES.alerts, flags, {
        title: AI_BRIEF_FALLBACK_TITLES.alertsWeek,
        n: weeks.length,
    });
}

/**
 * 2. `attention` — «Внимание» РОПу. Отдельного кэша у среза нет: он
 * считается синхронно над обзором, а в строке лежит только СТАРШАЯ
 * карточка менеджера (`AiManagerRowDto.signal`, `topSignalByManager`),
 * поэтому по кэшу обзора считаются менеджеры с сигналом, а не карточки.
 * Второй источник — утечки рёбер из снапшота прогноза со своей подписью.
 */
export function attentionFact(
    sources: BriefPackSources,
    managerIds: readonly string[],
): AiBriefFact | null {
    const { overview, forecasts } = sources;
    if (overview) {
        const rows = rowsInScope(overview, managerIds);

        return briefFact(AI_BRIEF_FACT_CODES.attention, countSignals(rows), {
            n: rows.length,
            ...analysisPrev(sources, rows, prev => prev.attention),
        });
    }
    if (forecasts.length === 0) return null;
    const leaks = sum(forecasts.map(row => row.payload.leaks.length));

    return briefFact(AI_BRIEF_FACT_CODES.attention, leaks, {
        title: AI_BRIEF_ATTENTION_LEAKS_TITLE,
        n: forecasts.length,
    });
}

/**
 * 3. `plan_vs_fact_sales` — закрытые продажи периода (с прошлым периодом);
 * при промахе кэша — финансовый хвост месячных снапшотов «за месяц»
 * вместе со снимком плана руководителя (план попадает в фразу факта).
 */
export function planVsFactSalesFact(
    sources: BriefPackSources,
    managerIds: readonly string[],
): AiBriefFact | null {
    const { overview, months } = sources;
    if (overview) {
        const rows = rowsInScope(overview, managerIds);

        return briefFact(AI_BRIEF_FACT_CODES.planVsFactSales, sumSales(rows), {
            n: rows.length,
            ...periodPrev(sources, prev => prev.sales),
        });
    }
    if (months.length === 0) return null;
    const sales = sum(months.map(row => row.payload.finance.salesCount));
    const plan = sum(months.map(row => row.payload.planSnapshot?.sales ?? 0));
    const spec = AI_BRIEF_FACT_SPECS[AI_BRIEF_FACT_CODES.planVsFactSales];
    const title = AI_BRIEF_FALLBACK_TITLES.planVsFactSales;

    return briefFact(AI_BRIEF_FACT_CODES.planVsFactSales, sales, {
        title,
        n: months.length,
        ...(plan > 0
            ? {
                  plan,
                  text:
                      `${title}: ${formatFactValue(sales, spec.unit)} из ` +
                      formatFactValue(plan, spec.unit),
              }
            : {}),
    });
}

/**
 * 4. `discipline_next_step` — доля «шаг с датой» за весь период по
 * ячейкам обзора (с прошлым периодом, посчитанным так же); при промахе —
 * пульс, затем чек-листы недельных снапшотов (проценты переводятся в
 * долю), оба без сравнения.
 */
export function disciplineFact(
    sources: BriefPackSources,
    managerIds: readonly string[],
): AiBriefFact | null {
    const { overview, pulse, weeks } = sources;
    if (overview) {
        const share = nextStepShare(rowsInScope(overview, managerIds));
        if (share !== null) {
            return briefFact(
                AI_BRIEF_FACT_CODES.disciplineNextStep,
                share.value,
                {
                    n: share.n,
                    ...periodPrev(sources, prev => prev.nextStep),
                },
            );
        }
    }
    if (pulse) {
        const rate = pulse.nextStepDateRate;

        return briefFact(AI_BRIEF_FACT_CODES.disciplineNextStep, rate.value, {
            n: rate.n,
        });
    }
    const rate = weightedRate(
        weeks.flatMap(week =>
            week.payload.byType.map(
                cell => cell.checklists.nextStepDateRatePct,
            ),
        ),
    );
    if (rate === null) return null;

    return briefFact(
        AI_BRIEF_FACT_CODES.disciplineNextStep,
        rate.value / PERCENT,
        { n: rate.n },
    );
}

/**
 * 5. `calls_over_threshold` — разобранные звонки периода по кэшу обзора
 * (с прошлым периодом); при промахе — звонки длиннее порога из месячных
 * снапшотов «за месяц» (эквивалент вкладки calling-statistic).
 */
export function callsFact(
    sources: BriefPackSources,
    managerIds: readonly string[],
): AiBriefFact | null {
    const { overview, months } = sources;
    if (overview) {
        const rows = rowsInScope(overview, managerIds);

        return briefFact(
            AI_BRIEF_FACT_CODES.callsOverThreshold,
            sumAnalyzed(rows),
            {
                n: rows.length,
                ...periodPrev(sources, prev => prev.analyzedCalls),
            },
        );
    }
    if (months.length === 0) return null;
    const callsOf = (row: BriefManagerRow<ManagerMonthPayload>): number =>
        sum(row.payload.byType.map(type => type.n));

    return briefFact(
        AI_BRIEF_FACT_CODES.callsOverThreshold,
        sum(months.map(callsOf)),
        {
            title: AI_BRIEF_FALLBACK_TITLES.callsOverThreshold,
            n: months.length,
        },
    );
}
