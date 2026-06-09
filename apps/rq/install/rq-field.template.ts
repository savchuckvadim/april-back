import { BASE_OTHER_FIELD_XML_ID } from '../shared/custom-user-fields/consts/base-other-field.const';
import { RqFieldTemplate } from './rq-install.types';

/**
 * Эталон кастомных пользовательских полей реквизита, которые `apps/rq`
 * читает по XML_ID (см. requisite.service: position_case/based/based_case/
 * director_case/base_other). Стандартные поля пресета (ИНН/КПП/директор и т.д.)
 * сюда не входят — их Bitrix заводит сам вместе с пресетом.
 */
export const RQ_FIELD_TEMPLATE: RqFieldTemplate[] = [
    {
        xmlId: 'position',
        label: 'Должность',
        userTypeId: 'string',
        isNeedUpdate: true,
    },
    {
        xmlId: 'position_case',
        label: 'Должность (в лице)',
        userTypeId: 'string',
        isNeedUpdate: true,
    },
    {
        xmlId: 'based',
        label: 'Действующего на основании',
        userTypeId: 'string',
        isNeedUpdate: true,
    },
    {
        xmlId: 'based_case',
        label: 'Действующего на основании (в род. пад.)',
        userTypeId: 'string',
        isNeedUpdate: true,
    },
    {
        xmlId: 'director_case',
        label: 'ФИО руководителя организации (в лице)',
        userTypeId: 'string',
        isNeedUpdate: true,
    },
    {
        xmlId: BASE_OTHER_FIELD_XML_ID,
        label: 'Дополнительные реквизиты',
        userTypeId: 'string',
        isNeedUpdate: true,
    },
];
