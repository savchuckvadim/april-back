/**
 * Плацебо (1) оценки β (план `ai-sales-analytics`, §4.4 «плацебо»,
 * §4.10 E1): в модель одновременно входят текущее качество `S_i` и лид
 * `S̄_{m,w+k}` — среднее качество менеджера через `beta_placebo_lead_weeks`
 * недель. Проверка пройдена, если 90 %-интервал коэффициента при лиде
 * накрывает 0 при ненулевом текущем; без лида результата нет (null — ни
 * pass, ни fail).
 *
 * Лид — величина уровня менеджера (внутри менеджера почти постоянна),
 * поэтому подгонка идёт на том же дизайне, что и pooled-модель: страты,
 * `γ·log(1 + calls)`, случайный эффект менеджера как ridge `1/σ_u²`,
 * оффсет портал×месяц. Без `u_m` наивная SE коэффициента при лиде занижена
 * в разы (кластеров ≈ 15 при строках ≈ 3000), и верная модель со стойким
 * навыком менеджера проваливала бы проверку. Один фиксированный параметр
 * (лид) резервируется в бюджете EPV.
 */
import {
    BETA_COLUMN,
    buildBetaDesign,
    epvEventsOf,
    selectBetaForm,
} from './beta-fit.design';
import { BETA_FIT_DEFAULTS } from './beta-fit';
import type { AiBetaFitForm, BetaEstimate } from './beta-fit.types';
import { fitLogisticRidge } from './beta-irls';
import {
    AI_BETA_LEAD_KINDS,
    type BetaSample,
    type BetaSampleRow,
} from './beta-sample.types';

/** Имя столбца лида в дизайне плацебо. */
export const PLACEBO_LEAD_COLUMN = 'lead';

export interface PlaceboLeadOptions {
    /** Квантиль 90 %-интервала; по умолчанию `z_compare`. */
    readonly z?: number;
    /** `n_min_none` — ниже плацебо не считается. */
    readonly minN?: number;
    /** σ_u случайного эффекта менеджера; по умолчанию `beta_manager_effect_sd`. */
    readonly managerEffectSd?: number;
    /** `beta_min_epv`. */
    readonly minEpv?: number;
    /** `d_eff` — тот же множитель SE, что и у оценки β. */
    readonly designEffect?: number;
    readonly maxIterations?: number;
    readonly tolerance?: number;
}

/** Плацебо (1): коэффициент при лиде рядом с текущим S. */
export interface PlaceboLeadResult {
    readonly lead: BetaEstimate;
    readonly current: BetaEstimate;
    /** Строк с лидом и событий среди них. */
    readonly n: number;
    readonly events: number;
    /** Форма pooled-дизайна, на которой подогнано плацебо. */
    readonly form: AiBetaFitForm;
    readonly passed: boolean;
}

type LeadRow = BetaSampleRow & { readonly sBarLead: number };

const hasLead = (row: BetaSampleRow): row is LeadRow =>
    row.sBarLead !== null && Number.isFinite(row.sBarLead);

/** Подвыборка строк с лидом в форме `BetaSample` для `buildBetaDesign`. */
function subsetWithLead(
    sample: BetaSample,
    rows: readonly LeadRow[],
): BetaSample {
    const managerIds = new Set(rows.map(row => row.managerId));
    const sBarByManager: Record<string, number> = {};
    Object.keys(sample.sBarByManager)
        .sort((a, b) => a.localeCompare(b))
        .forEach(managerId => {
            if (managerIds.has(managerId)) {
                sBarByManager[managerId] = sample.sBarByManager[managerId];
            }
        });
    const present = new Set(rows.map(row => row.stratum));

    return {
        ...sample,
        rows,
        n: rows.length,
        events: rows.filter(row => row.outcome === 1).length,
        managers: managerIds.size,
        strata: AI_BETA_LEAD_KINDS.filter(kind => present.has(kind)),
        sBarByManager,
    };
}

/**
 * Плацебо (1): pooled-дизайн (форма по EPV с резервом на лид) плюс
 * центрированный лид без штрафа. null — лида нет, строк меньше
 * `n_min_none`, событий не хватает даже на α + β + лид, либо подгонка
 * вырождена или не сошлась.
 */
export function placeboLead(
    sample: BetaSample,
    options: PlaceboLeadOptions = {},
): PlaceboLeadResult | null {
    const rows = sample.rows.filter(hasLead);
    const subset = subsetWithLead(sample, rows);
    const minN = options.minN ?? BETA_FIT_DEFAULTS.minN;
    const minEpv = options.minEpv ?? BETA_FIT_DEFAULTS.minEpv;
    const z = options.z ?? BETA_FIT_DEFAULTS.z90;
    const sigmaU = options.managerEffectSd ?? BETA_FIT_DEFAULTS.managerEffectSd;
    const dEff = options.designEffect ?? BETA_FIT_DEFAULTS.designEffect;
    if (subset.n < minN) {
        return null;
    }
    const design = selectBetaForm({
        events: epvEventsOf(subset.events, subset.n) - minEpv,
        strataCount: subset.strata.length,
        spec: 'pooled',
        minEpv,
        gammaInformative: subset.rows.some(
            row => row.logCalls !== subset.rows[0].logCalls,
        ),
    });
    if (design.form === 'insufficient') {
        return null;
    }
    const base = buildBetaDesign(subset, 'pooled', design, sigmaU);
    const leads = rows.map(row => row.sBarLead);
    const leadMean =
        leads.reduce((acc, value) => acc + value, 0) / leads.length;
    const names = [...base.names, PLACEBO_LEAD_COLUMN];
    const fit = fitLogisticRidge(
        {
            ...base,
            columns: [...base.columns, leads.map(value => value - leadMean)],
            names,
            penalties: [...base.penalties, 0],
        },
        { maxIterations: options.maxIterations, tolerance: options.tolerance },
    );
    if (fit.singular || !fit.converged) {
        return null;
    }
    const estimate = (name: string): BetaEstimate => {
        const at = names.indexOf(name);
        const value = fit.coefficients[at];
        const se = fit.standardErrors[at] / Math.sqrt(dEff);

        return { value, se, ci90: [value - z * se, value + z * se] };
    };
    const lead = estimate(PLACEBO_LEAD_COLUMN);

    return {
        lead,
        current: estimate(BETA_COLUMN.pooled),
        n: subset.n,
        events: subset.events,
        form: design.form,
        passed: lead.ci90[0] <= 0 && lead.ci90[1] >= 0,
    };
}
