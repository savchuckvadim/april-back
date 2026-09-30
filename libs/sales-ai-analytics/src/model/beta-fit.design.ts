/**
 * Выбор формы модели по правилу EPV и матрица дизайна оценки β
 * (план `ai-sales-analytics`, §4.4 «правило усложнения»). Вынесено из
 * `beta-fit.ts`, чтобы рабочий файл оставался в пределах 300 строк.
 */
import { registryDefault } from '../params/registry.access';
import {
    AI_BETA_FIT_FORMS,
    type AiBetaFitForm,
    type AiBetaFitSpec,
    type BetaFormDesign,
} from './beta-fit.types';
import type { LogisticDesign } from './beta-irls';
import type { BetaSample } from './beta-sample.types';

/** Имена столбцов дизайна — ключи `coefficients`. */
export const BETA_COLUMN = {
    within: 'beta_w',
    between: 'beta_b',
    pooled: 'beta_pooled',
    gamma: 'gamma',
    alpha: 'alpha',
    alphaPrefix: 'alpha:',
    managerPrefix: 'u:',
} as const;

/** `beta_min_epv` — событий на оцениваемый параметр. */
export const BETA_MIN_EPV_DEFAULT = registryDefault('beta_min_epv');

const FORM_CHAIN = AI_BETA_FIT_FORMS.filter(form => form !== 'insufficient');

/** Состав модели при данной форме и число фиксированных параметров. */
export function betaFormDesign(
    form: AiBetaFitForm,
    spec: AiBetaFitSpec,
    strataCount: number,
): BetaFormDesign {
    const gamma = form === 'full';
    const strata = form === 'full' || form === 'no-gamma';
    const between = spec === 'mundlak' && form !== 'slope-only';
    const fixedParams =
        form === 'insufficient'
            ? 0
            : (strata ? Math.max(1, strataCount) : 1) +
              1 +
              (between ? 1 : 0) +
              (gamma ? 1 : 0);

    return { form, gamma, strata, between, fixedParams };
}

/**
 * События правила EPV — меньшая из групп исходов `min(events, n − events)`
 * (Педуцци и др.): при доле исхода выше половины информацию ограничивают
 * «не-события», а при `events = n` или `events = 0` модель вырождается —
 * это полное разделение, оценивать нечего.
 */
export const epvEventsOf = (events: number, n: number): number =>
    Math.max(0, Math.min(events, n - events));

/**
 * Первая форма цепочки `full → no-gamma → single-intercept → slope-only`,
 * укладывающаяся в `fixedParams ≤ events/EPV`; у pooled шаг `slope-only`
 * пропускается (β_b там нет). Если `log(1 + calls)` не меняется по
 * строкам (`gammaInformative: false`), γ неоцениваем и `full` пропускается
 * — иначе матрица Гессе вырождалась бы нулевым столбцом; так же при одном
 * менеджере `S̄_m − S̄_p ≡ 0` (`betweenInformative: false`) пропускаются
 * формы с β_b. Иначе — `insufficient`.
 */
export function selectBetaForm(input: {
    /** События правила EPV — см. `epvEventsOf`. */
    readonly events: number;
    readonly strataCount: number;
    readonly spec: AiBetaFitSpec;
    readonly minEpv?: number;
    readonly gammaInformative?: boolean;
    readonly betweenInformative?: boolean;
}): BetaFormDesign {
    const minEpv = input.minEpv ?? BETA_MIN_EPV_DEFAULT;
    const budget = input.events / Math.max(1, minEpv);
    for (const form of FORM_CHAIN) {
        if (input.spec === 'pooled' && form === 'slope-only') {
            continue;
        }
        if (input.gammaInformative === false && form === 'full') {
            continue;
        }
        const design = betaFormDesign(form, input.spec, input.strataCount);
        if (input.betweenInformative === false && design.between) {
            continue;
        }
        if (design.fixedParams <= budget) {
            return design;
        }
    }

    return betaFormDesign('insufficient', input.spec, input.strataCount);
}

/**
 * Матрица дизайна: свободные члены страт (или один), наклоны
 * спецификации, γ и индикаторы менеджеров с ridge-штрафом `1/σ_u²`.
 * Менеджеры — в порядке идентификаторов, столбцы — в фиксированном порядке.
 */
export function buildBetaDesign(
    sample: BetaSample,
    spec: AiBetaFitSpec,
    design: BetaFormDesign,
    sigmaU: number,
): LogisticDesign {
    const { rows } = sample;
    const names: string[] = [];
    const columns: number[][] = [];
    const penalties: number[] = [];
    const add = (name: string, column: number[], penalty: number): void => {
        names.push(name);
        columns.push(column);
        penalties.push(penalty);
    };
    if (design.strata) {
        sample.strata.forEach(stratum =>
            add(
                `${BETA_COLUMN.alphaPrefix}${stratum}`,
                rows.map(row => (row.stratum === stratum ? 1 : 0)),
                0,
            ),
        );
    } else {
        add(
            BETA_COLUMN.alpha,
            rows.map(() => 1),
            0,
        );
    }
    if (spec === 'mundlak') {
        add(
            BETA_COLUMN.within,
            rows.map(row => row.sWithin),
            0,
        );
        if (design.between) {
            add(
                BETA_COLUMN.between,
                rows.map(row => row.sBetween),
                0,
            );
        }
    } else {
        add(
            BETA_COLUMN.pooled,
            rows.map(row => row.sCentered),
            0,
        );
    }
    if (design.gamma) {
        add(
            BETA_COLUMN.gamma,
            rows.map(row => row.logCalls),
            0,
        );
    }
    const managerIds = Object.keys(sample.sBarByManager).sort((a, b) =>
        a.localeCompare(b),
    );
    managerIds.forEach(managerId =>
        add(
            `${BETA_COLUMN.managerPrefix}${managerId}`,
            rows.map(row => (row.managerId === managerId ? 1 : 0)),
            1 / (sigmaU * sigmaU),
        ),
    );

    return {
        y: rows.map(row => row.outcome),
        columns,
        names,
        penalties,
        offset: rows.map(row => row.offset),
    };
}
