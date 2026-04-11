import { PbxEntityType } from '@/shared/enums';
import { PbxFieldDefinition, PbxFieldItemDefinition } from '../../interfaces';
import { PBX_SALES_EVENT_FIELDS } from '@/modules/pbx-domain/field/type/sales/event/pbx-sales-event-field.type';

/** List item shape from legacy PBX_SALES_EVENT_FIELDS `items` arrays */
type LegacyFieldListItem = {
    code: string;
    value: string;
    sort: number;
    xml_id?: string;
    del?: string;
};

/**
 * Converts legacy field definitions to the new PbxFieldDefinition format.
 * The `lead`, `company`, `deal`, `smart` keys become suffixes per entity.
 * Empty string means the field is not installed on that entity.
 */
function hasSuffix(value: unknown): value is string {
    return typeof value === 'string' && value !== '';
}

function convertLegacyField(
    legacy: (typeof PBX_SALES_EVENT_FIELDS)[number],
): PbxFieldDefinition {
    return {
        code: legacy.code,
        name: legacy.name,
        type: legacy.type,
        isMultiple: legacy.isMultiple,
        order: legacy.order,
        appType: legacy.appType,
        suffixes: {
            [PbxEntityType.LEAD]: hasSuffix(legacy.lead)
                ? legacy.lead
                : undefined,
            [PbxEntityType.BTX_COMPANY]: hasSuffix(legacy.company)
                ? legacy.company
                : undefined,
            [PbxEntityType.DEAL]: hasSuffix(legacy.deal)
                ? legacy.deal
                : undefined,
            [PbxEntityType.SMART]: hasSuffix(legacy.smart)
                ? legacy.smart
                : undefined,
        },
        items:
            legacy.items && legacy.items.length > 0
                ? legacy.items.map(
                      (item: LegacyFieldListItem): PbxFieldItemDefinition => ({
                          code: item.code,
                          value: item.value,
                          sort: item.sort,
                          xmlId: item.xml_id,
                          del:
                              item.del === 'Y' || item.del === 'N'
                                  ? item.del
                                  : undefined,
                      }),
                  )
                : undefined,
    };
}

export const SALES_EVENT_FIELD_DEFINITIONS: PbxFieldDefinition[] =
    PBX_SALES_EVENT_FIELDS.map(f => convertLegacyField(f));
