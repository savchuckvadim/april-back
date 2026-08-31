import { ZprSmartInfo } from '@lib/portal-lib/pbx/pbx-zpr-smart';
import {
    normalizeSmartFieldName,
    SmartItemField,
    SmartItemFields,
} from '@lib/portal-lib/pbx/smart-item-fields';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { FlowBitrix } from '../../shared/side-flow';
import { QuestionnaireSmartAnswer } from '../../shared/questionnaire-answers';
import { ZprFlowJobData } from '../dto/zpr-flow-job.dto';
import { BxRow, ZprFlowRun } from '../types/zpr-flow-run.type';

/**
 * Общие фикстуры сайд-flow ЗПР. Раньше жили внутри одной большой спеки
 * сервиса; после разбиения потока на use-case и подсервисы их читают пять
 * спек, и держать пять копий слепка смарта означало бы править портал в
 * пяти местах (файл не `*.spec.ts` — jest его как тест не подхватывает).
 */

/** Слепок установленного смарта ЗПР: ключи полей и стадии воронки. */
export const makeInfo = (over?: Partial<ZprSmartInfo>): ZprSmartInfo => ({
    entityTypeId: 1038,
    typeId: 7,
    ufKeyByCode: {
        ZPR_BASE_DEAL: 'ufCrm7BaseDeal',
        ZPR_PRES_DEAL: 'ufCrm7PresDeal',
        ZPR_LEAD: 'ufCrm7Lead',
        ZPR_COMPANY: 'ufCrm7Company',
        ZPR_CONTACT: 'ufCrm7Contact',
        ZPR_PLAN_DATE: 'ufCrm7PlanDate',
        ZPR_DONE_DATE: 'ufCrm7DoneDate',
        ZPR_IS_SPONTANEOUS: 'ufCrm7Spont',
        ZPR_RESPONSIBLE: 'ufCrm7Resp',
        ZPR_PLAN_COMMENT: 'ufCrm7PlanComment',
        ZPR_REPORT_COMMENT: 'ufCrm7ReportComment',
        ZPR_COMMENTS: 'ufCrm7Comments',
        ZPR_LAST_CALL_DATE: 'ufCrm7LastCall',
        ZPR_NEXT_CALL_DATE: 'ufCrm7NextCall',
        ZPR_MOVE_COUNT: 'ufCrm7MoveCount',
        ZPR_SALE_DATE_PROGNOZ: 'ufCrm7SaleDatePrognoz',
    },
    enumItems: {},
    stageIdByCode: {
        zpr_plan: 'DT1038_9:PLAN',
        zpr_pending: 'DT1038_9:PENDING',
        zpr_success: 'DT1038_9:SUCCESS',
        zpr_noresult: 'DT1038_9:NORESULT',
        zpr_result_fail: 'DT1038_9:RESULT_FAIL',
        zpr_fail: 'DT1038_9:FAIL',
    },
    ...over,
});

/** ЖИВЫЕ поля элемента ЗПР — адреса портальной анкеты. */
const LIVE_FIELDS: SmartItemField[] = [
    {
        key: 'ufCrm7QObjection',
        upperName: 'UF_CRM_7_Q_OBJECTION',
        type: 'string',
        isMultiple: false,
        title: 'Главное возражение',
        items: [],
    },
    {
        key: 'ufCrm7QDecisionAt',
        upperName: 'UF_CRM_7_Q_DECISION_AT',
        type: 'date',
        isMultiple: false,
        title: 'Дата решения',
        items: [],
    },
];

export const ITEM_FIELDS: SmartItemFields = {
    entityTypeId: 1038,
    byNormalizedName: Object.fromEntries(
        LIVE_FIELDS.map(field => [
            normalizeSmartFieldName(field.upperName),
            field,
        ]),
    ),
};

/** Ответ анкеты: по умолчанию отчётный строковый. */
export const answer = (
    over?: Partial<QuestionnaireSmartAnswer>,
): QuestionnaireSmartAnswer => ({
    key: 'q_zpr:objection',
    purpose: 'report',
    fieldName: 'UF_CRM_7_Q_OBJECTION',
    fieldType: 'string',
    control: 'string' as QuestionnaireSmartAnswer['control'],
    value: 'Дорого',
    title: 'Главное возражение',
    optionTitle: null,
    ...over,
});

/** Ответ ПЛАНА датой — вторая половина большинства анкетных кейсов. */
export const dateAnswer = (
    over?: Partial<QuestionnaireSmartAnswer>,
): QuestionnaireSmartAnswer =>
    answer({
        key: 'q_zpr:date',
        purpose: 'plan',
        fieldName: 'UF_CRM_7_Q_DECISION_AT',
        fieldType: 'date',
        control: 'date' as QuestionnaireSmartAnswer['control'],
        value: '2026-09-20',
        title: 'Дата решения',
        ...over,
    });

export const job = (over?: Partial<ZprFlowJobData>): ZprFlowJobData => ({
    domain: 'x.bitrix24.ru',
    operationId: 'op-1',
    kind: 'plan',
    baseDealId: 100,
    presDealId: 77,
    companyId: 431,
    leadId: 42,
    contactId: 9,
    responsibleId: 8,
    planDeadline: '01.09.2026 10:00:00',
    planName: 'Обсудить решение',
    planComment: 'Договорились созвониться',
    reportComment: null,
    isResult: true,
    ...over,
});

/** Что фейковый клиент Битрикса записал — по одному списку на сущность. */
export interface BitrixSpy {
    bitrix: FlowBitrix;
    added: BxRow[];
    updatedItems: Array<{ id: number; fields: BxRow }>;
    dealUpdates: Array<{ id: number; fields: BxRow }>;
    taskUpdates: Array<{ id: number; fields: BxRow }>;
}

export const makeBitrix = (over?: {
    /** Что вернёт `item.listAll` — кандидаты в открытый элемент. */
    openItems?: BxRow[];
    /** Открытые сделки основной воронки компании (для дотяжки baseDealId). */
    companyDeals?: Array<{ ID: string; ASSIGNED_BY_ID?: string }>;
    /**
     * Элементы по id для `item.get` — путь резолва от ПРИВЯЗКИ ЗАДАЧИ.
     * Ключа нет — элемент «не найден» (result без item), как в живом API.
     */
    itemsById?: Record<number, BxRow>;
    /** `item.get` падает — сетевая ошибка чтения указателя задачи. */
    itemGetError?: Error;
}): BitrixSpy => {
    const added: BxRow[] = [];
    const updatedItems: Array<{ id: number; fields: BxRow }> = [];
    const dealUpdates: Array<{ id: number; fields: BxRow }> = [];
    const taskUpdates: Array<{ id: number; fields: BxRow }> = [];

    const bitrix = {
        item: {
            add: (_typeId: string, fields: BxRow) => {
                added.push(fields);
                return Promise.resolve({
                    result: { item: { id: 500 + added.length } },
                });
            },
            get: (id: number | string) => {
                if (over?.itemGetError) {
                    return Promise.reject(over.itemGetError);
                }
                const item = over?.itemsById?.[Number(id)];
                return Promise.resolve({ result: item ? { item } : {} });
            },
            listAll: () => Promise.resolve(over?.openItems ?? []),
            update: (id: number, _typeId: never, fields: BxRow) => {
                updatedItems.push({ id, fields });
                return Promise.resolve({ result: true });
            },
        },
        deal: {
            get: () =>
                Promise.resolve({
                    result: { ID: '100', UF_CRM_OP_ZPRS: ['T40e_1'] },
                }),
            getList: () =>
                Promise.resolve({ result: over?.companyDeals ?? [] }),
            update: (id: number, fields: BxRow) => {
                dealUpdates.push({ id, fields });
                return Promise.resolve({ result: true });
            },
        },
        company: {
            get: () => Promise.resolve({ result: { ID: '431' } }),
            update: (id: number, fields: BxRow) => {
                dealUpdates.push({ id, fields });
                return Promise.resolve({ result: true });
            },
        },
        task: {
            get: () =>
                Promise.resolve({
                    result: { task: { ufCrmTask: ['D_100', 'CO_431'] } },
                }),
            update: (id: number, fields: BxRow) => {
                taskUpdates.push({ id, fields });
                return Promise.resolve({ result: true });
            },
        },
    } as unknown as FlowBitrix;

    return { bitrix, added, updatedItems, dealUpdates, taskUpdates };
};

/** Портал: таймзона, реестр полей (op_zprs) и категория основной воронки. */
export const makePortal = (over?: { zprsField?: boolean }): PortalModel =>
    ({
        getTimezone: () => 'Europe/Moscow',
        getEntityFieldByCode: () =>
            (over?.zprsField ?? true) ? { bitrixId: 'OP_ZPRS' } : undefined,
        getFieldBitrixId: () => 'UF_CRM_OP_ZPRS',
        getDealCategoryByCode: () => ({ bitrixId: 5, stages: [] }),
    }) as unknown as PortalModel;

/** Момент прогона: фиксированный, чтобы ленту комментариев можно было ждать. */
export const NOW = '30.08.2026 12:00:00';

/**
 * Прогон джоба целиком — то, чем обмениваются подсервисы потока. Собирается
 * тут же, а не через use-case: writer и builder не должны знать ни про
 * PBXService, ни про резолв смарта.
 */
export const makeRun = (over?: {
    job?: Partial<ZprFlowJobData>;
    info?: ZprSmartInfo;
    itemFields?: SmartItemFields | null;
    bitrix?: FlowBitrix;
    portal?: PortalModel;
}): ZprFlowRun => ({
    bitrix: over?.bitrix ?? makeBitrix().bitrix,
    portal: over?.portal ?? makePortal(),
    info: over?.info ?? makeInfo(),
    job: job(over?.job),
    tz: 'Europe/Moscow',
    now: NOW,
    itemFields: over?.itemFields === undefined ? ITEM_FIELDS : over.itemFields,
});
