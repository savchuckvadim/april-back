/**
 * Контракт снапшота `goldenReport` (`ai-analytics-golden-report`, Фаза 3,
 * поток П7): отчёт согласия оценщика по test-retest разборов одной
 * версией промпта — каппа по категориям, ICC и TOST по шкалам, F1 по
 * возражениям и измеренная σ_llm. Одна запись на версию промпта
 * (зерно portal-hash, ключ — хэш версии), хранится бессрочно. Здесь
 * только форма данных — без DI, Bitrix и Prisma; считает
 * `model/agreement/agreement-report.ts`, пишет и читает приложение.
 */
import type {
    CohenKappaResult,
    F1CodeResult,
    F1Result,
    IccAnovaResult,
    TostResult,
} from '../model/agreement/agreement.types';
import type { ReliabilitySource } from '../model/reliability';

/** Согласие по категориальному полю разбора (тип звонка, исход…). */
export interface GoldenCategoryAgreement {
    /** Код поля разбора. */
    code: string;
    /** Пар, где поле заполнено обоими прогонами. */
    n: number;
    /** Номинальная каппа Коэна и PABAK. */
    nominal: CohenKappaResult;
    /** Взвешенная каппа для упорядоченных уровней; null — уровни не заданы. */
    weighted: CohenKappaResult | null;
}

/** Согласие по шкале разбора (общий балл, раздел рубрики). */
export interface GoldenScaleAgreement {
    code: string;
    /** Пар, где шкала оценена обоими прогонами. */
    n: number;
    /** ICC(2,1)/(3,1) по парам; null — меньше двух пар. */
    icc: IccAnovaResult | null;
    /** Эквивалентность средних двух прогонов при границе Δ; null — меньше двух пар. */
    tost: TostResult | null;
    /** Шум оценщика по шкале: sd разностей / √2; null — меньше двух пар. */
    sigma: number | null;
}

/** Согласие по множествам возражений. */
export interface GoldenObjectionsAgreement {
    /** Пар, где хотя бы один прогон нашёл возражения. */
    pairsWithObjections: number;
    /** Микро-усреднение по всем парам. */
    micro: F1Result;
    /** Разрез по кодам возражений, по коду. */
    byCode: F1CodeResult[];
}

/** σ_llm отчёта: измеренная по шкале балла или дефолт реестра. */
export interface GoldenSigmaLlm {
    /** Код шкалы, по которой измерена σ_llm (общий балл). */
    scale: string;
    /** sd разностей / √2; null — пар со шкалой меньше двух. */
    measured: number | null;
    /** Пар со шкалой в расчёте. */
    n: number;
    /** Ценз пар для статуса measured (`minN` кода `sigma_llm_default`). */
    minPairs: number;
    /** `sigma_llm_default` — дефолт до измерения. */
    configured: number;
    /** measured — ценз пройден, иначе configured. */
    source: ReliabilitySource;
    /** σ_llm к применению: измеренная при measured, иначе дефолт. */
    value: number;
}

/** Нагрузка снапшота `goldenReport`. */
export interface GoldenReport {
    /** Версия промпта/рубрики, для которой мерили согласие. */
    promptVersion: string;
    /** Пар разборов на входе (первый и второй прогон одного звонка). */
    pairs: number;
    /** Квота `retest_budget_calls` и укладывается ли выборка в неё. */
    budget: { quota: number; withinQuota: boolean };
    categories: GoldenCategoryAgreement[];
    scales: GoldenScaleAgreement[];
    objections: GoldenObjectionsAgreement;
    sigmaLlm: GoldenSigmaLlm;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Структурная проверка нагрузки при чтении из ais: версия, число пар,
 * массивы разрезов, объект возражений и σ_llm с источником. Глубже не
 * смотрим — отчёт пишет и читает один код библиотеки.
 */
export function isGoldenReportLike(value: unknown): value is GoldenReport {
    if (!isRecord(value)) return false;
    const { promptVersion, pairs, budget, categories, scales } = value;
    const { objections, sigmaLlm } = value;
    return (
        typeof promptVersion === 'string' &&
        typeof pairs === 'number' &&
        isRecord(budget) &&
        typeof budget.quota === 'number' &&
        Array.isArray(categories) &&
        Array.isArray(scales) &&
        isRecord(objections) &&
        isRecord(objections.micro) &&
        Array.isArray(objections.byCode) &&
        isRecord(sigmaLlm) &&
        typeof sigmaLlm.scale === 'string' &&
        typeof sigmaLlm.value === 'number' &&
        (sigmaLlm.source === 'measured' || sigmaLlm.source === 'configured')
    );
}
