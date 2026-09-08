import type { QualityLink } from '../contracts/quality-link.types';
import type { AiEvidenceLevel, EvidenceInput } from './evidence';

/**
 * Рычаги рекомендаций и их входы (план §4.10). Вынесены из
 * `model/recommend.ts`, чтобы файл модели оставался в пределах 300 строк.
 */
export const AI_LEVERS = [
    'volume',
    'quality',
    'checklist',
    'pipeline',
    'objection',
] as const;

/** Рычаг рекомендации. */
export type AiLever = (typeof AI_LEVERS)[number];

/** Выборка исхода: переходы s из знаменателя n. */
export interface OutcomeSample {
    readonly s: number;
    readonly n: number;
}

/** Рычаг объёма: добавить активностей при текущем темпе конверсии. */
export interface VolumeLeverInput {
    readonly callType: string;
    /** Добавляемых активностей за остаток периода. */
    readonly addedUnits: number;
    /** Продаж на единицу активности `c_mk·F̄`. */
    readonly salesPerUnit: number;
    /** 80 %-интервал `c_mk·F̄`; без него рычаг не выдаётся. */
    readonly salesPerUnitCi80?: readonly [number, number];
    /** Стоимость — минуты `activity_duration_min`. */
    readonly costMinutes: number;
}

/** Рычаг качества — только при `betaSource: data`. */
export interface QualityLeverInput {
    readonly section?: string;
    readonly callType?: string;
    /** Текущая оценка Ŝ_m. */
    readonly score: number;
    /** Прирост качества δ (обычно 1 балл). */
    readonly delta: number;
    /** Объём ребра N_k. */
    readonly volume: number;
    /** Π θ ниже по пути. */
    readonly downstream: number;
    /** Разборов раздела (гейт `lever_min_section_calls`). */
    readonly sectionCalls: number;
    /** Стоимость — часы `coaching_hours_section`. */
    readonly coachingHours: number;
    /** Относительная неопределённость эффекта для интервала, доля. */
    readonly relativeSpread?: number;
}

/** Рычаг чек-листа: пункт выполнен против невыполненного. */
export interface ChecklistLeverInput {
    readonly code: string;
    readonly withItem: OutcomeSample;
    readonly withoutItem: OutcomeSample;
    /** Эпизодов ребра N_k. */
    readonly episodes: number;
    /** Доля эпизодов, где пункт уже выполнен, `share_c`. */
    readonly shareDone: number;
    readonly downstream?: number;
    readonly costHours?: number;
}

/** Рычаг работы с воронкой: подтянуть открытые сделки до «горячих». */
export interface PipelineLeverInput {
    readonly openDeals: number;
    readonly hot: OutcomeSample;
    readonly stage: OutcomeSample;
    readonly costHours?: number;
}

/** Рычаг возражений: исход эпизода берётся из CRM, не из метки LLM. */
export interface ObjectionLeverInput {
    readonly category: string;
    /** Исход эпизода по CRM (`stagehistory`): продвижение/отказ. */
    readonly crm: {
        readonly handled: OutcomeSample;
        readonly unhandled: OutcomeSample;
    };
    /**
     * Метка исхода того же прохода LLM (`objections[].outcome`) — только
     * для карточки; в `deltaSales` не входит никогда.
     */
    readonly llmLabel?: {
        readonly handled: OutcomeSample;
        readonly unhandled: OutcomeSample;
    };
    readonly episodes: number;
    readonly downstream?: number;
    readonly costHours?: number;
}

/** Кандидат в рекомендации. */
export interface LeverCandidate {
    readonly lever: AiLever;
    readonly ruleCode: string;
    readonly callType?: string;
    readonly section?: string;
    readonly category?: string;
    /** Ожидаемый прирост продаж; null — уровень E0 (до сцепки). */
    readonly deltaSales: number | null;
    /** 80 %-интервал эффекта. */
    readonly ci80: readonly [number, number] | null;
    readonly cost: number;
    readonly evidence: AiEvidenceLevel;
    /** Совет «что менять» разрешён (уровень не ниже гейта). */
    readonly adviceAllowed: boolean;
    readonly basis: readonly string[];
}

/** Вход построения рычагов. */
export interface BuildLeversInput {
    readonly link: QualityLink;
    /** Сцепка звонков со сделкой выполнена (`deal_chain_min_pct`). */
    readonly chainLinked: boolean;
    readonly volume?: VolumeLeverInput;
    readonly quality?: QualityLeverInput;
    readonly checklist?: readonly ChecklistLeverInput[];
    readonly pipeline?: PipelineLeverInput;
    readonly objections?: readonly ObjectionLeverInput[];
    /** Общий дизайн оценки — определяет уровень доказательности. */
    readonly evidence?: EvidenceInput;
    /** `lever_max`. */
    readonly max?: number;
    /** `lever_min_section_calls`. */
    readonly minSectionCalls?: number;
    /** `n_min_none` — порог знаменателя для уровня E1. */
    readonly minN?: number;
    /** `evidence_gate` — с какого уровня разрешён совет «что менять». */
    readonly gate?: AiEvidenceLevel;
}
