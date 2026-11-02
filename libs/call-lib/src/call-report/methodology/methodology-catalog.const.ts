import {
    CALL_REPORT_CALL_TYPE_ITEMS,
    CALL_REPORT_SECTIONS,
} from '@lib/portal-lib/pbx/pbx-aicall-smart';
import { CORE_CAPS } from './core-caps.const';
import { POLYANSKY_METHODOLOGY } from './polyansky.methodology';
import {
    ANCHOR_BANDS,
    CHECKPOINT_EVIDENCE_KINDS,
    CHECKPOINT_STATUSES,
    METHODOLOGY_CAP_TARGETS,
    METHODOLOGY_CONDITION_OPS,
    METHODOLOGY_FACT_FIELDS,
    type MethodologyCap,
    type MethodologyCapTarget,
    type MethodologyCheckpoint,
    type MethodologyConditionOp,
    type MethodologyFactField,
} from './methodology.types';

/**
 * Каталог для формы-брифа методики в админке: справочники с русскими
 * подписями (типы звонков, разделы, факты и операции условий, виды
 * подтверждения, цели ограничителей), пункты-кандидаты из встроенной
 * методики и ограничители ядра — чтобы свою методику портала собирать
 * галочками и выбором, а не вручную по кодам.
 */

export interface CatalogEntry<Code extends string = string> {
    code: Code;
    title: string;
    /** Пояснение для подсказки в форме. */
    hint?: string;
}

/** Факты разбора для условий — подписи для конструктора условий. */
export const METHODOLOGY_FACT_TITLES: Readonly<
    Record<MethodologyFactField, string>
> = {
    needsFound: 'Потребности выявлены (да/нет)',
    needsCount: 'Число выявленных потребностей',
    presentationDone: 'Презентация проведена (да/нет)',
    priceDiscussed: 'Цена обсуждалась (да/нет)',
    productive: 'Звонок результативный (да/нет)',
    nextStepSet: 'Следующий шаг назначен (да/нет)',
    nextStepDate: 'Дата следующего шага',
    nextStepTime: 'Время следующего шага',
    nextStepGoal: 'Цель следующего шага',
    nextStepClientAction: 'Действие клиента до следующего контакта',
    nextStepManagerAction: 'Действие менеджера до следующего контакта',
    nextStepComplete: 'Шаг полный: дата, время и цель (да/нет)',
    talkRatioPct: 'Доля речи менеджера, %',
    questionsCount: 'Число вопросов менеджера',
    interlocutorRole: 'Роль собеседника (ЛПР, пользователь, секретарь)',
    specialist: 'Специальность собеседника',
    hvostDesire: 'Хвост: желание работать (да/нет)',
    hvostOffered: 'Хвост: что предложили (да/нет)',
    hvostPriceReaction: 'Хвост: реакция на цену (да/нет)',
    hvostDecisionProcess: 'Хвост: процесс принятия решения (да/нет)',
    hvostDecisionWay: 'Хвост: выход на решение (да/нет)',
    spiralsFull: 'Полных спиралей презентации',
    spiralsWithoutNeed: 'Витков без связи с потребностью',
    spiralsWithoutQuestion: 'Витков без вопроса клиенту',
    dealProgressScore: 'Продвижение сделки по звонку (1–5)',
};

/** Операции условий — подписи. */
export const METHODOLOGY_OP_TITLES: Readonly<
    Record<MethodologyConditionOp, string>
> = {
    is: 'равно',
    not: 'не равно',
    empty: 'пусто',
    not_empty: 'не пусто',
    lt: 'меньше',
    lte: 'не больше',
    gt: 'больше',
    gte: 'не меньше',
    above_norm: 'выше нормы типа звонка',
    within_norm: 'в норме типа звонка',
    checkpoint_missed: 'пункт пропущен',
    checkpoint_done: 'пункт выполнен',
};

const EVIDENCE_TITLES = {
    quote: 'нужна дословная цитата',
    fact: 'факт разговора, цитата по возможности',
} as const;

const STATUS_TITLES = {
    done: 'выполнен',
    missed: 'пропущен',
    not_applicable: 'не применимо',
} as const;

/** Пункт-кандидат каталога: пункт встроенной методики с пометкой «правило кода». */
export interface CatalogCheckpoint extends MethodologyCheckpoint {
    /** Считается кодом по фактам, у модели не спрашивается. */
    byRule: boolean;
    /** Откуда пункт: код встроенной методики. */
    source: string;
}

export interface MethodologyCatalog {
    callTypes: CatalogEntry[];
    sections: CatalogEntry[];
    factFields: CatalogEntry<MethodologyFactField>[];
    conditionOps: CatalogEntry<MethodologyConditionOp>[];
    evidenceKinds: CatalogEntry[];
    statuses: CatalogEntry[];
    capTargets: CatalogEntry<MethodologyCapTarget>[];
    anchorBands: string[];
    /** Пункты-кандидаты встроенных методик — выбираются галочками. */
    checkpoints: CatalogCheckpoint[];
    /** Ограничители ядра — действуют всегда, в форме только для справки. */
    coreCaps: MethodologyCap[];
}

const SECTION_TITLES = new Map<string, string>(
    CALL_REPORT_SECTIONS.map(section => [section.code, section.title]),
);

/** Каталог собирается из констант кода — всегда актуален. */
export function buildMethodologyCatalog(): MethodologyCatalog {
    return {
        callTypes: CALL_REPORT_CALL_TYPE_ITEMS.map(item => ({
            code: item.CODE,
            title: item.VALUE,
        })),
        sections: CALL_REPORT_SECTIONS.map(section => ({
            code: section.code,
            title: section.title,
        })),
        factFields: METHODOLOGY_FACT_FIELDS.map(code => ({
            code,
            title: METHODOLOGY_FACT_TITLES[code],
        })),
        conditionOps: METHODOLOGY_CONDITION_OPS.map(code => ({
            code,
            title: METHODOLOGY_OP_TITLES[code],
        })),
        evidenceKinds: CHECKPOINT_EVIDENCE_KINDS.map(code => ({
            code,
            title: EVIDENCE_TITLES[code],
        })),
        statuses: CHECKPOINT_STATUSES.map(code => ({
            code,
            title: STATUS_TITLES[code],
        })),
        capTargets: METHODOLOGY_CAP_TARGETS.map(code => ({
            code,
            title:
                code === 'total'
                    ? 'Итоговая оценка'
                    : (SECTION_TITLES.get(code) ?? code),
        })),
        anchorBands: [...ANCHOR_BANDS],
        checkpoints: POLYANSKY_METHODOLOGY.checkpoints.map(checkpoint => ({
            ...checkpoint,
            byRule: checkpoint.rule !== undefined,
            source: POLYANSKY_METHODOLOGY.code,
        })),
        coreCaps: [...CORE_CAPS],
    };
}
