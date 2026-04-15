import { StorageService } from '@/core/storage';
import { PbxGroupDefinition } from '../../interfaces';
import { SALES_EVENT_FIELD_DEFINITIONS } from './sales-event-fields.definition';
import { SALES_KONSTRUCTOR_FIELD_DEFINITIONS } from './sales-konstructor-fields.definition';
import { SALES_DEAL_CATEGORIES } from './sales-categories.definition';
import {
    loadSalesFieldsFromSmarts,
    loadSalesSmartDefinitions,
} from './sales-smarts.definition';

export async function buildSalesEventGroup(
    storage: StorageService,
): Promise<PbxGroupDefinition> {
    const smarts = await loadSalesSmartDefinitions(storage);

    return {
        group: 'sales',
        appType: 'event',
        fields: SALES_EVENT_FIELD_DEFINITIONS,
        categories: SALES_DEAL_CATEGORIES,
        smarts,
    };
}

export function buildSalesKonstructorGroup(): PbxGroupDefinition {
    return {
        group: 'sales_konstructor',
        appType: 'konstructor',
        fields: SALES_KONSTRUCTOR_FIELD_DEFINITIONS,
        categories: [],
    };
}

export async function buildSalesGeneralGroup(
    storage: StorageService,
): Promise<PbxGroupDefinition> {
    const [fields, smarts] = await Promise.all([
        loadSalesFieldsFromSmarts(storage),
        loadSalesSmartDefinitions(storage),
    ]);

    return {
        group: 'sales_general',
        appType: 'general',
        fields,
        categories: [],
        smarts,
    };
}

export { SALES_EVENT_FIELD_DEFINITIONS } from './sales-event-fields.definition';
export { SALES_KONSTRUCTOR_FIELD_DEFINITIONS } from './sales-konstructor-fields.definition';
export { SALES_DEAL_CATEGORIES } from './sales-categories.definition';
export {
    loadSalesSmartDefinitions,
    loadSalesDealCategoriesFromSmarts,
    loadSalesFieldsFromSmarts,
} from './sales-smarts.definition';
export {
    loadSalesListKpiFields,
    loadSalesListHistoryFields,
    loadSalesListPresentationFields,
} from './sales-lists.definition';
