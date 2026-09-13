import { BitrixOwnerTypeId } from '@/modules/bitrix/domain/enums/bitrix-constants.enum';
import { ConstSmartDescriptor } from '../../const-smart-registry/type/const-smart-descriptor.type';
import {
    buildComplectVariantInstallCategories,
    buildComplectVariantInstallFields,
} from './pbx-complect-variant-smart-field.type';
import {
    COMPLECT_VARIANT_SMART_CODE,
    COMPLECT_VARIANT_SMART_FIELDS,
    COMPLECT_VARIANT_SMART_GROUP,
    COMPLECT_VARIANT_SMART_TITLE,
    COMPLECT_VARIANT_SMART_TYPE,
} from './pbx-complect-variant-smart.type';

/**
 * Descriptor смарта «Варианты комплекта».
 *
 * Зарегистрирован в CONST_SMART_REGISTRY — карточка появляется в галерее
 * админки сама, фронт админки не меняется.
 *
 * Элемент = один собранный вариант предложения. Вариантов на сделке несколько:
 * их сравнивают, выбирают один либо сливают в общий комплект под один договор.
 */
export const COMPLECT_VARIANT_SMART_DESCRIPTOR = {
    kind: 'complect_variant',
    type: COMPLECT_VARIANT_SMART_TYPE,
    group: COMPLECT_VARIANT_SMART_GROUP,
    code: COMPLECT_VARIANT_SMART_CODE,
    title: COMPLECT_VARIANT_SMART_TITLE,
    fieldsCount: COMPLECT_VARIANT_SMART_FIELDS.length,
    hasCategories: true,
    // Вариант без товарных строк бессмыслен: в нём весь состав продажи.
    hasProductRows: true,
    description:
        'Варианты комплекта: элемент = один собранный в конструкторе вариант ' +
        'предложения (комплект, дополнения, ЛТ, академия) с товарными ' +
        'строками. Вариантов на сделке несколько — их сравнивают, выбирают ' +
        'один или сливают в общий комплект под один договор. Состав полей — ' +
        'зеркало konstructor-полей сделки.',
    buildInstallFields: buildComplectVariantInstallFields,
    buildInstallCategories: buildComplectVariantInstallCategories,
    // Варианты открываются вкладкой в карточке сделки — там же, где их собирают.
    parentEntityTypeIds: [BitrixOwnerTypeId.DEAL],
} as const satisfies ConstSmartDescriptor;
