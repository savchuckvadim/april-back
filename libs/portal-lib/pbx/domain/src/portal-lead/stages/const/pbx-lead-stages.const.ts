import { PbxDealSalesBaseStageCode } from '../../../portal-deal/sales/base/const/pbx-deal-sales-base-stages.const';

/**
 * Типизированный шаблон стадий лида — единственный источник правды.
 *
 * Раньше шаблон жил нетипизированной константой в pbx-install
 * (lead-stage-template.constants.ts) — тот файл теперь re-export отсюда.
 * Здесь он в portal-lib, потому что коды стадий нужны и рантайму
 * (event-sales: хук «лид → работа»), а импорт app→app запрещён.
 *
 * Отличие от сделок: у лида ОДИН общий справочник статусов портала
 * (crm.status, ENTITY_ID='STATUS'), в нём живут и системные статусы
 * (NEW/CONVERTED/JUNK), и клиентские. Поэтому установка стадий лида
 * СТРОГО АДДИТИВНА: создаём/обновляем только свои (installMode='create'),
 * чужие статусы не удаляем никогда.
 */

/** Группа отделов — значения совпадают с PbxEntityGroupEnum из pbx-install. */
export type PbxLeadStageGroup = 'sales' | 'service';

/** Семантика статуса Bitrix: '' — в работе, S — успех, F — провал. */
export type PbxLeadStageSemantics = '' | 'S' | 'F';

export interface PbxLeadStageTemplateItem {
    /** Уникальный код стадии в шаблоне (он же `code` строки `btx_stages`). */
    code: string;
    /** Системное имя стадии. */
    name: string;
    /** Человекочитаемый заголовок. */
    title: string;
    /** Цвет #RRGGBB. */
    color: string;
    /** Порядок сортировки (и SORT при создании в Bitrix). */
    order: number;
    isActive: boolean;
    /**
     * Желаемый STATUS_ID в Bitrix. Для installMode='create' — обязателен
     * (PBX_-префикс, чтобы не столкнуться с клиентскими статусами);
     * для map-only системных — известный системный id (NEW/IN_PROCESS/...),
     * null — статус подбирается админом вручную.
     */
    bitrixStatusId: string | null;
    semantics: PbxLeadStageSemantics;
    /**
     * create — установщик создаёт/обновляет статус в Bitrix;
     * map-only — только ручное сопоставление в админке (системные статусы
     * и «зеркальные» стадии, которые на портале уже существуют).
     */
    installMode: 'create' | 'map-only';
    /**
     * Зеркало стадии воронки ОП: лид в этой стадии соответствует сделке
     * sales_base в стадии dealStageCode (кейс «Презентация» из ТЗ хуков).
     */
    dealStageCode?: PbxDealSalesBaseStageCode;
}

const SALES_LEAD_STAGES = [
    {
        code: 'lead_new',
        name: 'new',
        title: 'Новый лид',
        color: '#39A8EF',
        order: 10,
        isActive: true,
        bitrixStatusId: 'NEW',
        semantics: '',
        installMode: 'map-only',
    },
    {
        code: 'lead_in_work',
        name: 'in_work',
        title: 'В работе',
        color: '#2FC6F6',
        order: 20,
        isActive: true,
        bitrixStatusId: 'IN_PROCESS',
        semantics: '',
        installMode: 'map-only',
    },
    {
        // ХО-вход: назначение ≠ принятие. Хук ставит лид сюда, «Взята в
        // работу» происходит только при подтверждении менеджером
        // (POST /lead-request/accept) — от разницы считается firstprepare.
        code: 'lead_assigned',
        name: 'assigned',
        title: 'Назначена менеджеру',
        color: '#8FBCF6',
        order: 21,
        isActive: true,
        bitrixStatusId: 'PBX_ASSIGNED',
        semantics: '',
        installMode: 'create',
    },
    {
        code: 'lead_taken_in_work',
        name: 'taken_in_work',
        title: 'Взята в работу',
        color: '#55D0E0',
        order: 22,
        isActive: true,
        bitrixStatusId: 'PBX_TAKEN_IN_WORK',
        semantics: '',
        installMode: 'create',
    },
    {
        code: 'lead_company_work',
        name: 'company_work',
        title: 'Работа с компанией',
        color: '#47E4C2',
        order: 24,
        isActive: true,
        bitrixStatusId: 'PBX_COMPANY_WORK',
        semantics: '',
        installMode: 'create',
    },
    {
        code: 'lead_pres',
        name: 'pres',
        title: 'Презентация (зеркало ОП)',
        color: '#FFA900',
        order: 26,
        isActive: true,
        bitrixStatusId: null,
        semantics: '',
        installMode: 'map-only',
        dealStageCode: 'sales_pres',
    },
    {
        code: 'lead_warm',
        name: 'warm',
        title: 'Переговоры (зеркало ОП)',
        color: '#FFB95E',
        order: 27,
        isActive: true,
        bitrixStatusId: null,
        semantics: '',
        installMode: 'map-only',
        dealStageCode: 'sales_warm',
    },
    {
        code: 'lead_converted',
        name: 'converted',
        title: 'Качественный лид',
        color: '#7BD500',
        order: 30,
        isActive: true,
        bitrixStatusId: 'CONVERTED',
        semantics: 'S',
        installMode: 'map-only',
    },
    {
        code: 'lead_junk',
        name: 'junk',
        title: 'Некачественный лид',
        color: '#FF5752',
        order: 40,
        isActive: true,
        bitrixStatusId: 'JUNK',
        semantics: 'F',
        installMode: 'map-only',
    },
] as const satisfies readonly PbxLeadStageTemplateItem[];

/** Группа SERVICE новых стадий не получает (решение по умолчанию, вопрос №10 ТЗ). */
const SERVICE_LEAD_STAGES = [
    {
        code: 'lead_new',
        name: 'new',
        title: 'Новый лид',
        color: '#39A8EF',
        order: 10,
        isActive: true,
        bitrixStatusId: 'NEW',
        semantics: '',
        installMode: 'map-only',
    },
    {
        code: 'lead_in_work',
        name: 'in_work',
        title: 'В работе',
        color: '#2FC6F6',
        order: 20,
        isActive: true,
        bitrixStatusId: 'IN_PROCESS',
        semantics: '',
        installMode: 'map-only',
    },
    {
        code: 'lead_converted',
        name: 'converted',
        title: 'Качественный лид',
        color: '#7BD500',
        order: 30,
        isActive: true,
        bitrixStatusId: 'CONVERTED',
        semantics: 'S',
        installMode: 'map-only',
    },
    {
        code: 'lead_junk',
        name: 'junk',
        title: 'Некачественный лид',
        color: '#FF5752',
        order: 40,
        isActive: true,
        bitrixStatusId: 'JUNK',
        semantics: 'F',
        installMode: 'map-only',
    },
] as const satisfies readonly PbxLeadStageTemplateItem[];

export const PBX_LEAD_STAGES: Record<
    PbxLeadStageGroup,
    readonly PbxLeadStageTemplateItem[]
> = {
    sales: SALES_LEAD_STAGES,
    service: SERVICE_LEAD_STAGES,
};

/** Union кодов стадий лида группы SALES — для типобезопасного резолва. */
export type PbxLeadStageCode = (typeof SALES_LEAD_STAGES)[number]['code'];

/** Runtime-массив кодов SALES — для @IsIn и Swagger enum. */
export const PBX_LEAD_STAGE_CODES: readonly PbxLeadStageCode[] =
    SALES_LEAD_STAGES.map(stage => stage.code);

/** Шаблон группы (пустой массив для неизвестной группы). */
export function getPbxLeadStageTemplate(
    group: string,
): readonly PbxLeadStageTemplateItem[] {
    return PBX_LEAD_STAGES[group as PbxLeadStageGroup] ?? [];
}

/** Стадия SALES-шаблона по коду (принимает и сырой STATUS-код рантайма). */
export function findPbxLeadStage(
    code: string,
): PbxLeadStageTemplateItem | undefined {
    return SALES_LEAD_STAGES.find(stage => stage.code === code);
}
