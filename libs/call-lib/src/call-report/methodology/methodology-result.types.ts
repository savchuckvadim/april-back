import type { CallReportSectionCode } from '@lib/portal-lib/pbx/pbx-aicall-smart';
import type {
    CheckpointStatus,
    Methodology,
    MethodologyCap,
    MethodologyCapTarget,
} from './methodology.types';
import type { MethodologyNorms } from './methodology-condition';

/**
 * Результаты методики в разборе звонка и срез разбора, по которому они
 * считаются. Типы независимы от DTO приложения: конвейер и Agent API
 * приводят свой разбор к `MethodologyAnalysisView`.
 */

/** Откуда статус пункта: ответ модели или правило кода по фактам. */
export const CHECKPOINT_SOURCES = ['model', 'rule'] as const;
export type CheckpointSource = (typeof CHECKPOINT_SOURCES)[number];

/** Итог пункта методики в разборе. */
export interface CheckpointResult {
    code: string;
    /** Формулировка пункта — менеджер видит её дословно. */
    title: string;
    status: CheckpointStatus;
    mandatory: boolean;
    source: CheckpointSource;
    quote: string | null;
    startSec: number | null;
    endSec: number | null;
}

/** Виток спирали презентации: потребность → свойство → связка → выгода → вопрос. */
export interface SpiralResult {
    need: string | null;
    feature: string | null;
    link: string | null;
    benefit: string | null;
    question: string | null;
    clientAnswer: string | null;
    /** Все пять звеньев заполнены — считает код, не модель. */
    full: boolean;
}

/** Шкала продвижения сделки по звонку (раздел 7.1 материалов). */
export const DEAL_PROGRESS_MIN = 1;
export const DEAL_PROGRESS_MAX = 5;

export interface DealProgressResult {
    score: number;
    before: string;
    after: string;
    why: string;
    whyNotHigher: string;
}

/** Сработавший ограничитель: условие выполнено; applied — оценка срезана. */
export interface CapTriggered {
    code: string;
    title: string;
    target: MethodologyCapTarget;
    max: number;
    /** Оценка до среза; null — оценивать было нечего (раздел без оценки). */
    before: number | null;
    after: number | null;
    applied: boolean;
}

export interface MethodologyOutcome {
    code: string;
    version: string;
    title: string;
    checkpoints: CheckpointResult[];
    /** Обязательные выполненные / обязательные применимые. */
    checkpointsDone: number;
    checkpointsTotal: number;
    /** null — спирали для этого типа не считались. */
    spirals: SpiralResult[] | null;
    spiralsFull: number | null;
    /** Минимум полных витков по методике для этого типа; null — спирали не считались. */
    spiralsMinFull: number | null;
}

export interface MethodologySectionView {
    section: CallReportSectionCode;
    relevance: number;
    score?: number;
}

export interface MethodologyNextStepView {
    set: boolean;
    date?: string | null;
    time?: string | null;
    goal?: string | null;
    clientAction?: string | null;
    managerAction?: string | null;
}

export interface MethodologyHvostView {
    desire?: boolean | null;
    offered?: boolean | null;
    priceReaction?: boolean | null;
    decisionProcess?: boolean | null;
    decisionWay?: boolean | null;
}

/** Срез разбора для методики: только поля, нужные фактам и ограничителям. */
export interface MethodologyAnalysisView {
    callType: string | null;
    sections: MethodologySectionView[];
    score?: number;
    needsFound?: boolean;
    needs?: string[];
    presentationDone?: boolean;
    priceDiscussed?: boolean;
    productive?: boolean;
    nextStep?: MethodologyNextStepView | null;
    talkRatioPct?: number | null;
    questionsCount?: number | null;
    interlocutorRole?: string | null;
    specialist?: string | null;
    hvostSteps?: MethodologyHvostView | null;
    dealProgress?: DealProgressResult | null;
}

/** Сырой ответ прохода «методика» после разбора JSON модели. */
export interface MethodologyPassRaw {
    checkpoints: {
        code: string;
        status: CheckpointStatus;
        quote: string | null;
        startSec: number | null;
        endSec: number | null;
    }[];
    /** null — спирали не запрашивались. */
    spirals: SpiralResult[] | null;
}

export interface MethodologyEvaluationInput {
    view: MethodologyAnalysisView;
    /** Методика портала; null — разбор одним ядром (ограничители ядра всё равно считаются). */
    methodology: Methodology | null;
    pass: MethodologyPassRaw | null;
    coreCaps: readonly MethodologyCap[];
    norms: MethodologyNorms;
}

export interface MethodologyEvaluation {
    /** Разделы с оценками после ограничителей. */
    sections: MethodologySectionView[];
    /** Итоговая оценка после ограничителей. */
    score: number | undefined;
    capsTriggered: CapTriggered[];
    methodology: MethodologyOutcome | null;
}
