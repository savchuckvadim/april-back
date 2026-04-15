import { PbxEntityType } from '@/shared/enums';
import {
    PbxFieldDefinition,
    PbxFieldItemDefinition,
    PbxCategoryDefinition,
    PbxStageDefinition,
    PbxSmartDefinition,
    PbxRpaDefinition,
} from '../../interfaces';

/**
 * Legacy field shape from Google Apps Script JSON.
 * Covers both `items` (event-style) and `list` (konstructor/smart-style) formats.
 */
interface RawField {
    code: string;
    name: string;
    type: string;
    appType?: string;
    order?: number | string;
    isMultiple?: boolean;
    isNeedUpdate?: boolean;

    lead?: string | number;
    company?: string | number;
    deal?: string | number;
    smart?: string | number;
    rpa?: string | number;
    contact?: string | number;

    items?: RawFieldItem[];
    list?: RawFieldItem[];
}

interface RawFieldItem {
    code?: string;
    CODE?: string;
    value?: string;
    VALUE?: string;
    name?: string;
    sort?: number;
    SORT?: number;
    xml_id?: string;
    XML_ID?: string;
    del?: string;
    DEL?: string;
    bitrixCode?: string;
}

interface RawStage {
    code: string;
    name: string;
    color?: string;
    order?: number;
    isDefault?: string | boolean;
    bitrixId?: string;
    semantic?: string;
}

interface RawCategory {
    code: string;
    name: string;
    title?: string;
    order?: number;
    isDefault?: string | boolean;
    entityType?: string;
    stages?: RawStage[];
}

interface RawSmart {
    code: string;
    title: string;
    name?: string;
    entityTypeId?: number;
    categories?: RawCategory[];
}

interface RawRpa {
    code: string;
    title: string;
    name?: string;
    entityTypeId?: number;
    categories?: RawCategory[];
}

function toSuffix(value: unknown): string | undefined {
    if (typeof value === 'string' && value !== '') return value;
    if (typeof value === 'number' && value > 0) return String(value);
    return undefined;
}

function convertItem(raw: RawFieldItem): PbxFieldItemDefinition {
    return {
        code: raw.code || raw.CODE || '',
        value: raw.value || raw.VALUE || raw.name || '',
        sort: raw.sort || raw.SORT || 0,
        xmlId: raw.xml_id || raw.XML_ID,
        del: (() => {
            const d = raw.del || raw.DEL;
            return d === 'Y' || d === 'N' ? d : undefined;
        })(),
    };
}

export function convertField(raw: RawField): PbxFieldDefinition {
    const rawItems = raw.items || raw.list || [];
    const items = rawItems.length > 0 ? rawItems.map(convertItem) : undefined;

    return {
        code: raw.code,
        name: raw.name,
        type: raw.type,
        isMultiple: raw.isMultiple ?? false,
        order: typeof raw.order === 'number' ? raw.order : undefined,
        appType: raw.appType,
        suffixes: {
            [PbxEntityType.LEAD]: toSuffix(raw.lead),
            [PbxEntityType.BTX_COMPANY]: toSuffix(raw.company),
            [PbxEntityType.DEAL]: toSuffix(raw.deal),
            [PbxEntityType.SMART]: toSuffix(raw.smart),
            [PbxEntityType.BTX_RPA]: toSuffix(raw.rpa),
            [PbxEntityType.BTX_CONTACT]: toSuffix(raw.contact),
        },
        items,
    };
}

export function convertFields(rawFields: RawField[]): PbxFieldDefinition[] {
    return rawFields.map(convertField);
}

function convertStage(raw: RawStage): PbxStageDefinition {
    return {
        code: raw.code,
        name: raw.name,
        color: raw.color,
        sort: raw.order ?? 0,
        isDefault: raw.isDefault === 'Y' || raw.isDefault === true,
        semantics: raw.semantic || undefined,
    };
}

export function convertCategory(
    raw: RawCategory,
    entityType: PbxEntityType,
): PbxCategoryDefinition {
    return {
        code: raw.code,
        name: raw.title || raw.name,
        sort: raw.order ?? 0,
        entityType,
        isDefault: raw.isDefault === 'Y' || raw.isDefault === true,
        stages: (raw.stages || []).map(convertStage),
    };
}

export function convertCategories(
    rawCategories: RawCategory[],
    entityType: PbxEntityType,
): PbxCategoryDefinition[] {
    return rawCategories.map(c => convertCategory(c, entityType));
}

export function convertSmart(raw: RawSmart): PbxSmartDefinition {
    return {
        code: raw.code,
        title: raw.title || raw.name || raw.code,
        categories: raw.categories
            ? convertCategories(raw.categories, PbxEntityType.SMART)
            : undefined,
    };
}

export function convertSmarts(rawSmarts: RawSmart[]): PbxSmartDefinition[] {
    return rawSmarts.map(convertSmart);
}

export function convertRpa(raw: RawRpa): PbxRpaDefinition {
    const allStages = (raw.categories || []).flatMap(c =>
        (c.stages || []).map(convertStage),
    );

    return {
        code: raw.code,
        title: raw.title || raw.name || raw.code,
        stages: allStages.length > 0 ? allStages : undefined,
    };
}

export function convertRpas(rawRpas: RawRpa[]): PbxRpaDefinition[] {
    return rawRpas.map(convertRpa);
}
