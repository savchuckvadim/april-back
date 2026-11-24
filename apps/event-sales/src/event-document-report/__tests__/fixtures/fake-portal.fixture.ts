/**
 * Фейковый портал: собирает поля, воронки и списки в методы, которые получает рабочий код.
 */
import {
    FakeField,
    FakeFieldItem,
    FakeFieldMap,
    makeDocumentFields,
} from './portal-fields.fixture';
import {
    FakeCategory,
    makeBaseCategory,
    makePresentationCategory,
} from './portal-categories.fixture';
import { FakeList, FakeListField } from './portal-lists.fixture';

// === Фейковый портал ===
export interface FakePortalOptions {
    /** Поля обеих карточек (по умолчанию — все поля документов). */
    fields?: FakeFieldMap;
    /** Поля отдельной карточки: перекрывают `fields` для её типа. */
    entityFields?: Record<string, FakeFieldMap>;
    /** Воронки сделок (по умолчанию — основная и презентации). */
    categories?: FakeCategory[];
    /** Списки портала по коду (`sales_kpi`, `sales_history`, `sales_presentation`). */
    lists?: Record<string, FakeList>;
    timezone?: string;
}

export const makeFakePortal = (options: FakePortalOptions = {}) => {
    const fields = options.fields ?? makeDocumentFields();
    const categories = options.categories ?? [
        makeBaseCategory(),
        makePresentationCategory(),
    ];
    return {
        getEntityFieldByCode: (
            entityType: string,
            code: string,
        ): FakeField | undefined =>
            (options.entityFields?.[entityType] ?? fields)[code],
        getFieldBitrixId: (field: FakeField): string =>
            field.bitrixId.startsWith('UF_CRM_')
                ? field.bitrixId
                : `UF_CRM_${field.bitrixId}`,
        getFieldItemByCode: (
            field: FakeField,
            itemCode: string,
        ): FakeFieldItem | undefined =>
            field.items.find(item => item.code === itemCode),
        getDealCategoryByCode: (code: string): FakeCategory | undefined =>
            categories.find(category => category.code === code),
        getTimezone: (): string => options.timezone ?? 'Europe/Moscow',
        getListByCode: (code: string): FakeList | undefined =>
            options.lists?.[code],
        getIdByCodeFieldList: (
            list: FakeList,
            code: string,
        ): FakeListField | undefined =>
            list.bitrixfields.find(
                field => field.code === `${list.group}_${list.type}_${code}`,
            ),
    };
};
