import { PbxGroupDefinition } from '../../interfaces';
import { SALES_EVENT_FIELD_DEFINITIONS } from './sales-event-fields.definition';
import { SALES_DEAL_CATEGORIES } from './sales-categories.definition';

export const SALES_EVENT_GROUP: PbxGroupDefinition = {
    group: 'sales',
    appType: 'event',
    fields: SALES_EVENT_FIELD_DEFINITIONS,
    categories: SALES_DEAL_CATEGORIES,
};

export { SALES_EVENT_FIELD_DEFINITIONS } from './sales-event-fields.definition';
export { SALES_DEAL_CATEGORIES } from './sales-categories.definition';
