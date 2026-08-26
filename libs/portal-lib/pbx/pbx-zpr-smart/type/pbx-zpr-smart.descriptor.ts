import { BitrixOwnerTypeId } from '@/modules/bitrix/domain/enums/bitrix-constants.enum';
import { ConstSmartDescriptor } from '../../const-smart-registry/type/const-smart-descriptor.type';
import {
    buildZprInstallCategories,
    buildZprInstallFields,
} from './pbx-zpr-smart-field.type';
import {
    ZPR_SMART_CODE,
    ZPR_SMART_FIELDS,
    ZPR_SMART_GROUP,
    ZPR_SMART_TITLE,
    ZPR_SMART_TYPE,
} from './pbx-zpr-smart.type';

/**
 * Descriptor смарта «Звонки По решению».
 *
 * Зарегистрирован в CONST_SMART_REGISTRY — карточка в галерее админки.
 * Установка целиком (тип + воронка/стадии через install-smart-categories +
 * поля с items) — InstallZprSmartUseCase (@app/pbx-install/smart/zpr),
 * первый const-инсталлятор со стадиями. Концепция —
 * front/docs/zpr-smart-concept.md.
 */
export const ZPR_SMART_DESCRIPTOR = {
    kind: 'zpr',
    type: ZPR_SMART_TYPE,
    group: ZPR_SMART_GROUP,
    code: ZPR_SMART_CODE,
    title: ZPR_SMART_TITLE,
    fieldsCount: ZPR_SMART_FIELDS.length,
    // Стадии есть (план → ожидание → исходы) — см. ZPR_SMART_STAGES.
    hasCategories: true,
    description:
        'Звонки по решению: элемент = один запланированный (или спонтанный) ' +
        'ЗПР со стадиями, возражениями и историей комментариев; связи с ' +
        'основной и презентационной сделками, лидом и компанией.',
    buildInstallFields: buildZprInstallFields,
    // Первый const-смарт с воронкой: одна категория, стадии ZPR_SMART_STAGES.
    buildInstallCategories: buildZprInstallCategories,
    // Элементы видны вкладкой в карточках сделки, компании, лида и контакта.
    parentEntityTypeIds: [
        BitrixOwnerTypeId.DEAL,
        BitrixOwnerTypeId.COMPANY,
        BitrixOwnerTypeId.LEAD,
        BitrixOwnerTypeId.CONTACT,
    ],
    // Обратная ссылка op_zprs (`T{hex}_{id}`) живёт на сделке и компании —
    // установщик смарта доливает в её settings DYNAMIC_{entityTypeId}='Y',
    // иначе Битрикс молча отбрасывает значения (поле ставится установкой
    // полей раньше, чем известен entityTypeId смарта).
    backRefFields: [
        { entity: 'deal', ufName: 'UF_CRM_OP_ZPRS' },
        { entity: 'company', ufName: 'UF_CRM_OP_ZPRS' },
    ],
} as const satisfies ConstSmartDescriptor;
