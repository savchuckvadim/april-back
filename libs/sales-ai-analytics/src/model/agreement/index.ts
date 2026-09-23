/**
 * Барель согласия оценщика (Фаза 3, П7 «test-retest языковой модели»):
 * каппа Коэна (номинальная, взвешенная, PABAK), ICC по двухфакторной
 * ANOVA, TOST на эквивалентность средних, F1 по множествам возражений и
 * сводка пар разборов → GoldenReport. Наружу из библиотеки подключается
 * именованными экспортами в `src/index.ts`.
 */
export { AGREEMENT_DEFAULTS, KAPPA_WEIGHTINGS } from './agreement.types';
export type {
    CategoryPair,
    CohenKappaOptions,
    CohenKappaResult,
    DifferenceStats,
    F1CodeResult,
    F1Counts,
    F1Result,
    IccAnovaResult,
    KappaWeighting,
    ScalePair,
    SetPair,
    TostOptions,
    TostResult,
} from './agreement.types';
export {
    cohenKappa,
    confusionTable,
    disagreementWeight,
    kappaLevels,
    pabakOf,
} from './kappa';
export type { ConfusionTable } from './kappa';
export { iccOfPairs, iccTwoWay, isBalancedMatrix } from './icc';
export { differenceStats, pairDifferences, tost, tostOfPairs } from './tost';
export { f1FromCounts, setCounts, setF1, setF1ByCode, sumCounts } from './f1';
export {
    buildGoldenReport,
    categoryPairsOf,
    scalePairsOf,
    sigmaOfPairs,
} from './agreement-report';
export type {
    AgreementPair,
    AgreementReportInput,
    AgreementRun,
} from './agreement-report';
