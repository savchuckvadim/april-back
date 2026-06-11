import { PbxEntityGroupEnum } from '@app/pbx-install/shared/entity/field/parse-entity-field.service';

/**
 * Шаблонная стадия лида (источник — код, не Excel).
 * `bitrixId` НЕ задаётся в шаблоне: он появляется только после ручного сопоставления
 * шаблонной стадии с реальным статусом лида из Bitrix (STATUS_ID).
 */
export interface LeadStageTemplateItem {
    /** Уникальный код стадии в шаблоне (он же `code` строки `btx_stages`). */
    code: string;
    /** Системное имя стадии. */
    name: string;
    /** Человекочитаемый заголовок. */
    title: string;
    /** Цвет в формате #RRGGBB. */
    color: string;
    /** Порядок сортировки. */
    order: number;
    /** Активна ли стадия. */
    isActive: boolean;
}

/**
 * Шаблон стадий лида по группам отделов.
 * Состав можно дополнять/уточнять без изменения архитектуры модуля.
 */
export const LEAD_STAGE_TEMPLATE: Record<
    PbxEntityGroupEnum,
    LeadStageTemplateItem[]
> = {
    [PbxEntityGroupEnum.SALES]: [
        {
            code: 'lead_new',
            name: 'new',
            title: 'Новый лид',
            color: '#39A8EF',
            order: 10,
            isActive: true,
        },
        {
            code: 'lead_in_work',
            name: 'in_work',
            title: 'В работе',
            color: '#2FC6F6',
            order: 20,
            isActive: true,
        },
        {
            code: 'lead_converted',
            name: 'converted',
            title: 'Качественный лид',
            color: '#7BD500',
            order: 30,
            isActive: true,
        },
        {
            code: 'lead_junk',
            name: 'junk',
            title: 'Некачественный лид',
            color: '#FF5752',
            order: 40,
            isActive: true,
        },
    ],
    [PbxEntityGroupEnum.SERVICE]: [
        {
            code: 'lead_new',
            name: 'new',
            title: 'Новый лид',
            color: '#39A8EF',
            order: 10,
            isActive: true,
        },
        {
            code: 'lead_in_work',
            name: 'in_work',
            title: 'В работе',
            color: '#2FC6F6',
            order: 20,
            isActive: true,
        },
        {
            code: 'lead_converted',
            name: 'converted',
            title: 'Качественный лид',
            color: '#7BD500',
            order: 30,
            isActive: true,
        },
        {
            code: 'lead_junk',
            name: 'junk',
            title: 'Некачественный лид',
            color: '#FF5752',
            order: 40,
            isActive: true,
        },
    ],
};

/** Шаблон стадий лида для указанной группы (пустой массив, если группа неизвестна). */
export function getLeadStageTemplate(
    group: PbxEntityGroupEnum,
): LeadStageTemplateItem[] {
    return LEAD_STAGE_TEMPLATE[group] ?? [];
}
