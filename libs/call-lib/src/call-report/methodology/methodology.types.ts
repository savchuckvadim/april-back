import {
    CALL_REPORT_SECTION_CODES,
    type CallReportCallTypeCode,
    type CallReportSectionCode,
} from '@lib/portal-lib/pbx/pbx-aicall-smart';
import { AI_METHODOLOGY_CODE_PATTERN } from '@lib/portal-lib/store/ai-settings/portal-ai-settings.types';

/**
 * Методика продаж как КОНФИГ (решения владельца 27.10 и 01.11.2026): набор
 * чек-пунктов, ограничителей оценки, якорей шкалы и справочников поверх
 * общего ядра разбора (7 разделов, факты, хвост/5К, продвижение сделки,
 * расширенный шаг). На портале выбирается одна методика или ни одной.
 * Только типы и константы — без DI и без обращений к модели.
 */

/** Слои хранения: общий слой April или своя методика портала. */
export const METHODOLOGY_SCOPES = ['common', 'portal'] as const;
export type MethodologyScope = (typeof METHODOLOGY_SCOPES)[number];

/** Откуда взята методика: встроенный конфиг кода или строка таблицы. */
export const METHODOLOGY_SOURCES = ['builtin', 'table'] as const;
export type MethodologySource = (typeof METHODOLOGY_SOURCES)[number];

/** Код методики: латиница, цифры, дефис; 2–64 знака — тот же шаблон, что у настройки портала. */
export const METHODOLOGY_CODE_PATTERN = AI_METHODOLOGY_CODE_PATTERN;
/** Код пункта или ограничителя: `pres.needs_confirmed`, `cold-no-price`. */
export const CHECKPOINT_CODE_PATTERN = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/;
/** Версия конфига `major.minor.patch`; меняется при правке пунктов. */
export const METHODOLOGY_VERSION_PATTERN = /^\d+\.\d+\.\d+$/;

/**
 * Чем подтверждается пункт у модели: quote — дословная цитата из разговора
 * с таймкодом; fact — факт разговора без цитаты (например, «не обсуждал
 * цену»). Пункт с `rule` у модели не спрашивается — считается кодом.
 */
export const CHECKPOINT_EVIDENCE_KINDS = ['quote', 'fact'] as const;
export type CheckpointEvidenceKind = (typeof CHECKPOINT_EVIDENCE_KINDS)[number];

/** Статус пункта в разборе. */
export const CHECKPOINT_STATUSES = [
    'done',
    'missed',
    'not_applicable',
] as const;
export type CheckpointStatus = (typeof CHECKPOINT_STATUSES)[number];

/**
 * Факты разбора, по которым код считает условия ограничителей и пунктов
 * с правилом. Значения собирает ядро из разбора (`MethodologyFacts`);
 * отсутствующий факт — «неизвестно», условие на нём не срабатывает
 * (кроме `empty`).
 */
export const METHODOLOGY_FACT_FIELDS = [
    'needsFound',
    'needsCount',
    'presentationDone',
    'priceDiscussed',
    'productive',
    'nextStepSet',
    'nextStepDate',
    'nextStepTime',
    'nextStepGoal',
    'nextStepClientAction',
    'nextStepManagerAction',
    /** Дата, время и цель следующего шага заполнены все три. */
    'nextStepComplete',
    'talkRatioPct',
    'questionsCount',
    'interlocutorRole',
    'specialist',
    'hvostDesire',
    'hvostOffered',
    'hvostPriceReaction',
    'hvostDecisionProcess',
    'hvostDecisionWay',
    'spiralsFull',
    'spiralsWithoutNeed',
    'spiralsWithoutQuestion',
    'dealProgressScore',
] as const;
export type MethodologyFactField = (typeof METHODOLOGY_FACT_FIELDS)[number];

/**
 * Операции условий: is / not — равенство значению; empty / not_empty —
 * null, пустая строка или 0; lt / lte / gt / gte — числовое сравнение;
 * above_norm / within_norm — факт против нормы типа звонка (доля речи);
 * checkpoint_missed / checkpoint_done — статус другого пункта.
 */
export const METHODOLOGY_CONDITION_OPS = [
    'is',
    'not',
    'empty',
    'not_empty',
    'lt',
    'lte',
    'gt',
    'gte',
    'above_norm',
    'within_norm',
    'checkpoint_missed',
    'checkpoint_done',
] as const;
export type MethodologyConditionOp = (typeof METHODOLOGY_CONDITION_OPS)[number];

export type MethodologyFactValue = boolean | number | string | null;

export interface MethodologyCondition {
    op: MethodologyConditionOp;
    /** Поле факта — для всех операций, кроме checkpoint_*. */
    field?: MethodologyFactField;
    /** Значение сравнения для is / not / lt / lte / gt / gte. */
    value?: MethodologyFactValue;
    /** Код пункта — для checkpoint_missed / checkpoint_done. */
    checkpoint?: string;
}

export interface MethodologyCheckpoint {
    code: string;
    /** Формулировка, которую менеджер увидит в разборе дословно. */
    title: string;
    types: CallReportCallTypeCode[];
    evidence: CheckpointEvidenceKind;
    /** Обязательный пункт считается в долю выполнения; необязательный — только показывается. */
    mandatory: boolean;
    /** Подсказка модели, что именно искать (менеджеру не показывается). */
    hint?: string;
    /** Продукт, к которому привязан пункт (например, garant). */
    product?: string;
    /** Правило кода (все условия — И): пункт считается по фактам, у модели не спрашивается. */
    rule?: MethodologyCondition[];
}

/** Цель ограничителя: раздел или итоговая оценка. */
export const CAP_TARGET_TOTAL = 'total' as const;
export const METHODOLOGY_CAP_TARGETS = [
    ...CALL_REPORT_SECTION_CODES,
    CAP_TARGET_TOTAL,
] as const;
export type MethodologyCapTarget = (typeof METHODOLOGY_CAP_TARGETS)[number];

/** Потолок оценки — по шкале разделов 1–10 (для итога тоже 1–10). */
export const CAP_MAX_MIN = 1;
export const CAP_MAX_MAX = 10;

export interface MethodologyCap {
    code: string;
    /** Формулировка для карточки: «оценка ограничена: …». */
    title: string;
    /** Типы звонков, где действует; нет — все типы методики. */
    types?: CallReportCallTypeCode[];
    /** Условия срабатывания (все — И). */
    when: MethodologyCondition[];
    target: MethodologyCapTarget;
    max: number;
}

/** Полосы шкалы для якорей раздела. */
export const ANCHOR_BANDS = ['1-2', '3-4', '5-6', '7-8', '9-10'] as const;
export type AnchorBand = (typeof ANCHOR_BANDS)[number];
export type MethodologyAnchors = Partial<
    Record<CallReportSectionCode, Partial<Record<AnchorBand, string>>>
>;

/** Приоры актуальности разделов по типам звонков, 0–100. */
export type MethodologyRelevance = Partial<
    Record<
        CallReportCallTypeCode,
        Partial<Record<CallReportSectionCode, number>>
    >
>;

export interface MethodologySpirals {
    enabled: boolean;
    /** Минимум полных витков «потребность → свойство → связка → выгода → вопрос». */
    minFull: number;
    types: CallReportCallTypeCode[];
}

/** Слой справочника базы знаний: общий документ или документы методики. */
export const KNOWLEDGE_LAYER_SHARED = 'shared' as const;

export interface Methodology {
    code: string;
    title: string;
    version: string;
    /** Типы звонков, к которым методика применяется. */
    types: CallReportCallTypeCode[];
    /** Короткие правила методики для промпта («цену в холодном не обсуждаем»). */
    principles: string[];
    checkpoints: MethodologyCheckpoint[];
    caps: MethodologyCap[];
    spirals: MethodologySpirals;
    sectionAnchors?: MethodologyAnchors;
    relevance?: MethodologyRelevance;
    /** kind базы знаний → слой: `shared` или код методики. */
    knowledge?: Record<string, string>;
}

/** Методика, выбранная для портала, с происхождением. */
export interface ResolvedMethodology {
    methodology: Methodology;
    scope: MethodologyScope;
    source: MethodologySource;
    /** `code@version` — метка в версиях разбора. */
    versionTag: string;
}

/** Метка методики в версиях разбора. */
export const methodologyVersionTag = (
    methodology: Pick<Methodology, 'code' | 'version'>,
): string => `${methodology.code}@${methodology.version}`;

/** Пункты методики, применимые к типу звонка. */
export const checkpointsForType = (
    methodology: Methodology,
    callType: string | null,
): MethodologyCheckpoint[] =>
    callType === null
        ? []
        : methodology.checkpoints.filter(checkpoint =>
              (checkpoint.types as readonly string[]).includes(callType),
          );

/** Ограничители, применимые к типу звонка (без `types` — все типы). */
export const capsForType = (
    caps: readonly MethodologyCap[],
    callType: string | null,
): MethodologyCap[] =>
    caps.filter(
        cap =>
            cap.types === undefined ||
            (callType !== null &&
                (cap.types as readonly string[]).includes(callType)),
    );
