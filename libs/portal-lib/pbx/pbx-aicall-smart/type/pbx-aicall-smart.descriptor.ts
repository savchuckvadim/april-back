import { BitrixOwnerTypeId } from '@/modules/bitrix/domain/enums/bitrix-constants.enum';
import { ConstSmartDescriptor } from '../../const-smart-registry/type/const-smart-descriptor.type';
import { buildAicallInstallFields } from './pbx-aicall-smart-field.type';
import {
    CALL_REPORT_SMART_CODE,
    CALL_REPORT_SMART_FIELDS,
    CALL_REPORT_SMART_GROUP,
    CALL_REPORT_SMART_TITLE,
    CALL_REPORT_SMART_TYPE,
} from './pbx-aicall-smart.type';

/** Descriptor смарта «AI-анализ звонков» для реестра галереи const-смартов. */
export const AICALL_SMART_DESCRIPTOR = {
    kind: 'aicall',
    type: CALL_REPORT_SMART_TYPE,
    group: CALL_REPORT_SMART_GROUP,
    code: CALL_REPORT_SMART_CODE,
    title: CALL_REPORT_SMART_TITLE,
    fieldsCount: CALL_REPORT_SMART_FIELDS.length,
    // isCategoriesEnabled: 'N' в установщике — воронок у смарта нет.
    hasCategories: false,
    description:
        'Разборы звонков AI-агентом: разделы анализа, связи с воронками и отчётностью, транскрипт.',
    buildInstallFields: buildAicallInstallFields,
    // Разбор звонка виден вкладкой в карточках сделки, лида, контакта, компании.
    parentEntityTypeIds: [
        BitrixOwnerTypeId.DEAL,
        BitrixOwnerTypeId.LEAD,
        BitrixOwnerTypeId.CONTACT,
        BitrixOwnerTypeId.COMPANY,
    ],
} as const satisfies ConstSmartDescriptor;
