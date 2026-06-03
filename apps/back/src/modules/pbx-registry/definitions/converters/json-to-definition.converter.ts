import { PbxEntityType } from '@/shared/enums';
import {
    PbxFieldDefinition,
    PbxFieldItemDefinition,
    PbxCategoryDefinition,
    PbxStageDefinition,
    PbxSmartDefinition,
    PbxRpaDefinition,
    PbxSmartInstallSettings,
    PbxSmartTypeRelationsDefinition,
} from '../../interfaces';

/**
 * Field shape from source JSON.
 * Covers both `items` and `list` item collections.
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
    rpas?: unknown;
    contact?: string | number;
    smarts?: unknown;
    list?: unknown;
    lists?: unknown;
    user?: string | number;
    users?: unknown;
    task?: string | number;

    items?: RawFieldItem[];
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
    fields?: unknown;
    installSettings?: Record<string, unknown>;
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

function toCode(value: unknown): string | undefined {
    if (typeof value === 'string' && value !== '') return value;
    if (typeof value === 'number' && value > 0) return String(value);
    return undefined;
}

function toCodeList(value: unknown): string[] | undefined {
    if (!Array.isArray(value)) return undefined;

    const codes = value
        .map(item => toCode(item))
        .filter((item): item is string => Boolean(item));

    return codes.length > 0 ? Array.from(new Set(codes)) : undefined;
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
    const rawItems = Array.isArray(raw.items)
        ? raw.items
        : Array.isArray(raw.list)
          ? raw.list
          : [];
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
        rpa: toCode(raw.rpa),
        rpas: toCodeList(raw.rpas),
        smart: toCode(raw.smart),
        smarts: toCodeList(raw.smarts),
        list: toCode(raw.list),
        lists: toCodeList(raw.lists),
        user: toCode(raw.user),
        users: toCodeList(raw.users),
        task: toCode(raw.task),
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
    const smartFields = Array.isArray(raw.fields)
        ? convertFields(raw.fields as RawField[])
        : undefined;
    const installSettings = convertSmartInstallSettings(
        (raw.installSettings ??
            (!Array.isArray(raw.fields) ? raw.fields : undefined)) as
            | Record<string, unknown>
            | undefined,
    );
    return {
        code: raw.code,
        title: raw.title || raw.name || raw.code,
        fields: smartFields,
        installSettings,
        categories: raw.categories
            ? convertCategories(raw.categories, PbxEntityType.SMART)
            : undefined,
    };
}

function convertSmartInstallSettings(
    raw: Record<string, unknown> | undefined,
): PbxSmartInstallSettings | undefined {
    if (!raw || typeof raw !== 'object') return undefined;

    const relationRowsToDto = (
        value: unknown,
    ): PbxSmartTypeRelationsDefinition[keyof PbxSmartTypeRelationsDefinition] => {
        if (!Array.isArray(value)) return undefined;

        const rows = value
            .filter(row => typeof row === 'object' && row !== null)
            .map(row => {
                const relation = row as Record<string, unknown>;
                const entityTypeId = Number(relation.entityTypeId);
                if (!Number.isFinite(entityTypeId)) return null;

                const isChildrenListEnabled =
                    relation.isChildrenListEnabled === 'Y' ||
                    relation.isChildrenListEnabled === 'N'
                        ? relation.isChildrenListEnabled
                        : undefined;

                return {
                    entityTypeId,
                    isChildrenListEnabled,
                };
            })
            .filter(Boolean) as NonNullable<
            PbxSmartTypeRelationsDefinition[keyof PbxSmartTypeRelationsDefinition]
        >;

        return rows.length > 0 ? rows : undefined;
    };

    const asYN = (value: unknown): 'Y' | 'N' | undefined =>
        value === 'Y' || value === 'N' ? value : undefined;
    const asNumber = (value: unknown): number | undefined => {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : undefined;
    };
    const asRecord = (value: unknown): Record<string, string> | undefined => {
        if (!value || typeof value !== 'object' || Array.isArray(value))
            return undefined;
        return Object.fromEntries(
            Object.entries(value as Record<string, unknown>).map(
                ([key, val]) => [key, String(val)],
            ),
        );
    };
    const relationsRaw =
        raw.relations && typeof raw.relations === 'object'
            ? (raw.relations as Record<string, unknown>)
            : undefined;

    const settings: PbxSmartInstallSettings = {
        entityTypeId: asNumber(raw.entityTypeId),
        relations: relationsRaw
            ? {
                  parent: relationRowsToDto(relationsRaw.parent),
                  child: relationRowsToDto(relationsRaw.child),
              }
            : undefined,
        linkedUserFields: asRecord(raw.linkedUserFields),
        isUseInUserfieldEnabled: asYN(raw.isUseInUserfieldEnabled),
        isAutomationEnabled: asYN(raw.isAutomationEnabled),
        isBeginCloseDatesEnabled: asYN(raw.isBeginCloseDatesEnabled),
        isBizProcEnabled: asYN(raw.isBizProcEnabled),
        isCategoriesEnabled: asYN(raw.isCategoriesEnabled),
        isClientEnabled: asYN(raw.isClientEnabled),
        isDocumentsEnabled: asYN(raw.isDocumentsEnabled),
        isLinkWithProductsEnabled: asYN(raw.isLinkWithProductsEnabled),
        isMycompanyEnabled: asYN(raw.isMycompanyEnabled),
        isObserversEnabled: asYN(raw.isObserversEnabled),
        isRecyclebinEnabled: asYN(raw.isRecyclebinEnabled),
        isSetOpenPermissions: asYN(raw.isSetOpenPermissions),
        isSourceEnabled: asYN(raw.isSourceEnabled),
        isStagesEnabled: asYN(raw.isStagesEnabled),
        isExternal: asYN(raw.isExternal),
        customSectionId: asNumber(raw.customSectionId),
        customSections: Array.isArray(raw.customSections)
            ? raw.customSections
            : undefined,
    };

    const hasAnySetting = Object.values(settings).some(
        value => value !== undefined,
    );
    return hasAnySetting ? settings : undefined;
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
