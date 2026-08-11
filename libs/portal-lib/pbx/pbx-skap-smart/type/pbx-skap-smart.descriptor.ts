import { BitrixOwnerTypeId } from '@/modules/bitrix/domain/enums/bitrix-constants.enum';
import { ConstSmartDescriptor } from '../../const-smart-registry/type/const-smart-descriptor.type';
import { buildSkapInstallFields } from './pbx-skap-smart-field.type';
import {
    SKAP_SMART_CODE,
    SKAP_SMART_FIELDS,
    SKAP_SMART_GROUP,
    SKAP_SMART_TITLE,
    SKAP_SMART_TYPE,
} from './pbx-skap-smart.type';

/** Descriptor смарта «СКАП» для реестра галереи const-смартов. */
export const SKAP_SMART_DESCRIPTOR = {
    kind: 'skap',
    type: SKAP_SMART_TYPE,
    group: SKAP_SMART_GROUP,
    code: SKAP_SMART_CODE,
    title: SKAP_SMART_TITLE,
    fieldsCount: SKAP_SMART_FIELDS.length,
    // isCategoriesEnabled: 'N' в установщике — воронок/стадий у смарта нет.
    hasCategories: false,
    description:
        'Статистика использования СКАП: элемент = логин клиента за месяц, ' +
        'связи с компанией (рег-лист), сделкой Сервиса и контактом.',
    buildInstallFields: buildSkapInstallFields,
    // Элементы видны вкладкой в карточках сделки, компании и контакта.
    parentEntityTypeIds: [
        BitrixOwnerTypeId.DEAL,
        BitrixOwnerTypeId.COMPANY,
        BitrixOwnerTypeId.CONTACT,
    ],
} as const satisfies ConstSmartDescriptor;
