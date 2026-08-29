import { BitrixOwnerTypeId } from '@/modules/bitrix/domain/enums/bitrix-constants.enum';
import { ConstSmartDescriptor } from '../../const-smart-registry/type/const-smart-descriptor.type';
import {
    buildPresentationInstallCategories,
    buildPresentationInstallFields,
} from './pbx-presentation-smart-field.type';
import {
    PRESENTATION_SMART_CODE,
    PRESENTATION_SMART_FIELDS,
    PRESENTATION_SMART_GROUP,
    PRESENTATION_SMART_TITLE,
    PRESENTATION_SMART_TYPE,
} from './pbx-presentation-smart.type';

/**
 * Descriptor смарта «Презентации».
 *
 * Зарегистрирован в CONST_SMART_REGISTRY — карточка в галерее админки.
 * Установка целиком (тип + воронка/стадии + поля с items) —
 * InstallPresentationSmartUseCase (@app/pbx-install/smart/presentation),
 * поверх общего движка InstallConstSmartService (тот же, которым ставится
 * ЗПР).
 *
 * Зеркало сделок «ОП Презентации»: смарт НИЧЕГО не отключает, сделки
 * продолжают вести презентации как раньше — см. README модуля.
 */
export const PRESENTATION_SMART_DESCRIPTOR = {
    kind: 'presentation',
    type: PRESENTATION_SMART_TYPE,
    group: PRESENTATION_SMART_GROUP,
    code: PRESENTATION_SMART_CODE,
    title: PRESENTATION_SMART_TITLE,
    fieldsCount: PRESENTATION_SMART_FIELDS.length,
    // Стадии = воронка sales_presentation + контур согласования заявки
    // (легаси-РПА) — см. PRESENTATION_SMART_STAGES.
    hasCategories: true,
    description:
        'Презентации: элемент = одна презентация (плановая или спонтанная) ' +
        'со стадиями воронки «ОП Презентации» и согласования заявки, ' +
        'связями с основной, презентационной и ТМЦ-сделкой, лидом, ' +
        'компанией и контактом, блоками «5К» и «Хвост» и историей ' +
        'комментариев. Зеркало сделок-презентаций, ничего не отключает.',
    buildInstallFields: buildPresentationInstallFields,
    buildInstallCategories: buildPresentationInstallCategories,
    // Элементы видны вкладкой в карточках сделки, компании, лида и контакта —
    // ради этого зеркало и делается (открывать презентацию из родителя).
    parentEntityTypeIds: [
        BitrixOwnerTypeId.DEAL,
        BitrixOwnerTypeId.COMPANY,
        BitrixOwnerTypeId.LEAD,
        BitrixOwnerTypeId.CONTACT,
    ],
    // Обратная ссылка op_presentations (`T{hex}_{id}`, presentation-flow
    // дописывает её в сделку и компанию) — установщик смарта доливает в
    // settings поля DYNAMIC_{entityTypeId}='Y', иначе Битрикс молча
    // отбрасывает значения (поле ставится установкой полей раньше, чем
    // известен entityTypeId смарта).
    backRefFields: [
        { entity: 'deal', ufName: 'UF_CRM_OP_PRESENTATIONS' },
        { entity: 'company', ufName: 'UF_CRM_OP_PRESENTATIONS' },
    ],
} as const satisfies ConstSmartDescriptor;
