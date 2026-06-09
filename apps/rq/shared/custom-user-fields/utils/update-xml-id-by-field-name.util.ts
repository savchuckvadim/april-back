import { CustomField } from '@/apps/rq/types/bx-custom-field.type';
import {
    BASE_OTHER_FIELD_NAME,
    BASE_OTHER_FIELD_XML_ID,
} from '../consts/base-other-field.const';

const getXmlIdByFieldName = (fieldName: string): string | null => {
    // for example: UF_CRM_1773131028
    // получаем field name сравниваем с захардкоженым userfield name и возвращаем xml id из const
    if (fieldName.includes(BASE_OTHER_FIELD_NAME)) {
        return BASE_OTHER_FIELD_XML_ID;
    }
    return null;
};

export const mutateCustomFieldXmlIdByName = (
    customField: Partial<CustomField>,
) => {
    const xmlId = getXmlIdByFieldName(customField.FIELD_NAME || '');
    if (xmlId) {
        customField.XML_ID = xmlId;
    }
    return customField;
};
