import { PbxEntityType } from '@/shared/enums';
import { PbxFieldDefinition } from '../../interfaces';
import { PBX_SALES_KONSTRUCTOR_FIELDS } from '@/modules/pbx-domain/field/type/sales/konstructor/pbx-sales-konstructor-field.type';

type LegacyKonstructor = (typeof PBX_SALES_KONSTRUCTOR_FIELDS)[number];

function hasSuffix(value: unknown): value is string {
    return typeof value === 'string' && value !== '';
}

function isNumericSuffix(value: unknown): value is number {
    return typeof value === 'number' && value > 0;
}

function convertKonstruktorField(
    legacy: LegacyKonstructor,
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
                : isNumericSuffix(legacy.deal)
                  ? String(legacy.deal)
                  : undefined,
            [PbxEntityType.SMART]: hasSuffix(legacy.smart)
                ? legacy.smart
                : undefined,
        },
        items: undefined,
    };
}

export const SALES_KONSTRUCTOR_FIELD_DEFINITIONS: PbxFieldDefinition[] =
    PBX_SALES_KONSTRUCTOR_FIELDS.map(f => convertKonstruktorField(f));
