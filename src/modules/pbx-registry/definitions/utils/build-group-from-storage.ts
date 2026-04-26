import { StorageService } from '@/core/storage';
import { PbxEntityType } from '@/shared/enums';
import {
    PbxCategoryDefinition,
    PbxFieldDefinition,
    PbxGroupDefinition,
    PbxListDefinition,
    PbxRpaDefinition,
    PbxSmartDefinition,
} from '../../interfaces';
import {
    convertCategories,
    convertFields,
    convertRpas,
    convertSmarts,
} from '../converters';
import { loadMergedRegistryJsonDir } from './storage/load-registry-json-dir';

type GroupDealRegistryData = {
    categories?: unknown[];
};

type GroupSmartJson = {
    code: string;
    title: string;
    name?: string;
    categories?: unknown[];
    fields?: unknown[];
};

function hasText(value: string | undefined | null): value is string {
    return typeof value === 'string' && value.trim().length > 0;
}

function hasEntitySuffix(
    field: PbxFieldDefinition,
    entity: PbxEntityType,
): boolean {
    return hasText(field.suffixes[entity]);
}

function uniqueByCode<T extends { code: string }>(items: readonly T[]): T[] {
    const map = new Map<string, T>();
    for (const item of items) {
        if (!map.has(item.code)) {
            map.set(item.code, item);
        }
    }
    return Array.from(map.values());
}

function mergeFields(
    ownFields: readonly PbxFieldDefinition[] | undefined,
    referencedFields: readonly PbxFieldDefinition[],
): PbxFieldDefinition[] {
    return uniqueByCode([...(ownFields ?? []), ...referencedFields]);
}

function fieldTargetsCode(
    field: PbxFieldDefinition,
    singularCode: string | undefined,
    manyCodes: readonly string[] | undefined,
    code: string,
): boolean {
    if (!hasText(singularCode)) {
        return false;
    }
    if (!manyCodes || manyCodes.length === 0) {
        return true;
    }
    return manyCodes.includes(code);
}

function getUserFields(
    fields: readonly PbxFieldDefinition[],
): PbxFieldDefinition[] {
    return fields.filter(field => hasText(field.user) || field.users?.length);
}

function getContactFields(
    fields: readonly PbxFieldDefinition[],
): PbxFieldDefinition[] {
    return fields.filter(field =>
        hasEntitySuffix(field, PbxEntityType.BTX_CONTACT),
    );
}

function getCompanyFields(
    fields: readonly PbxFieldDefinition[],
): PbxFieldDefinition[] {
    return fields.filter(field =>
        hasEntitySuffix(field, PbxEntityType.BTX_COMPANY),
    );
}

function getTaskFields(
    fields: readonly PbxFieldDefinition[],
): PbxFieldDefinition[] {
    return fields.filter(field => hasText(field.task));
}

function getLeadFields(
    fields: readonly PbxFieldDefinition[],
): PbxFieldDefinition[] {
    return fields.filter(field => hasEntitySuffix(field, PbxEntityType.LEAD));
}

function getDealFields(
    fields: readonly PbxFieldDefinition[],
): PbxFieldDefinition[] {
    return fields.filter(field => hasEntitySuffix(field, PbxEntityType.DEAL));
}

function attachFieldsToSmarts(
    smarts: readonly PbxSmartDefinition[],
    fields: readonly PbxFieldDefinition[],
): PbxSmartDefinition[] {
    return smarts.map(smart => {
        const referencedFields = fields.filter(field =>
            fieldTargetsCode(field, field.smart, field.smarts, smart.code),
        );
        return {
            ...smart,
            fields: mergeFields(smart.fields, referencedFields),
        };
    });
}

function attachFieldsToRpas(
    rpas: readonly PbxRpaDefinition[],
    fields: readonly PbxFieldDefinition[],
): PbxRpaDefinition[] {
    return rpas.map(rpa => {
        const referencedFields = fields.filter(field =>
            fieldTargetsCode(field, field.rpa, field.rpas, rpa.code),
        );
        return {
            ...rpa,
            fields: mergeFields(rpa.fields, referencedFields),
        };
    });
}

function attachFieldsToLists(
    lists: readonly PbxListDefinition[],
    fields: readonly PbxFieldDefinition[],
): PbxListDefinition[] {
    return lists.map(list => {
        const referencedFields = fields.filter(field =>
            fieldTargetsCode(field, field.list, field.lists, list.code),
        );
        return {
            ...list,
            fields: mergeFields(list.fields, referencedFields),
        };
    });
}

function withEntityFields(
    fields: readonly PbxFieldDefinition[],
): Pick<
    PbxGroupDefinition,
    'company' | 'contact' | 'deal' | 'lead' | 'task' | 'user'
> {
    const userFields = getUserFields(fields);
    const contactFields = getContactFields(fields);
    const companyFields = getCompanyFields(fields);
    const taskFields = getTaskFields(fields);
    const leadFields = getLeadFields(fields);
    const dealFields = getDealFields(fields);

    return {
        user: userFields.length ? { fields: userFields } : undefined,
        contact: contactFields.length ? { fields: contactFields } : undefined,
        company: companyFields.length ? { fields: companyFields } : undefined,
        task: taskFields.length ? { fields: taskFields } : undefined,
        lead: leadFields.length ? { fields: leadFields } : undefined,
        deal: { fields: dealFields },
    };
}

async function loadGroupDealsData(
    storage: StorageService,
    group: string,
): Promise<GroupDealRegistryData[]> {
    return loadMergedRegistryJsonDir<GroupDealRegistryData>(
        storage,
        `${group}/deal`,
        { nestedArrayKey: 'deals' },
    );
}

async function loadGroupFieldsData(
    storage: StorageService,
    group: string,
): Promise<PbxFieldDefinition[]> {
    const data = await loadMergedRegistryJsonDir<unknown>(
        storage,
        `${group}/fields`,
        {
            nestedArrayKey: 'fields',
        },
    );
    return convertFields(data as Parameters<typeof convertFields>[0]);
}

async function loadGroupSmartsData(
    storage: StorageService,
    group: string,
): Promise<GroupSmartJson[]> {
    return loadMergedRegistryJsonDir<GroupSmartJson>(
        storage,
        `${group}/smarts`,
        {
            nestedArrayKey: 'smarts',
        },
    );
}

async function loadGroupRpasData(
    storage: StorageService,
    group: string,
): Promise<PbxRpaDefinition[]> {
    const data = await loadMergedRegistryJsonDir<unknown>(
        storage,
        `${group}/rpa`,
        {
            nestedArrayKey: 'rpas',
        },
    );
    return convertRpas(data as Parameters<typeof convertRpas>[0]);
}

async function loadGroupListsData(
    storage: StorageService,
    group: string,
): Promise<PbxListDefinition[]> {
    return loadMergedRegistryJsonDir<PbxListDefinition>(
        storage,
        `${group}/lists`,
        {
            nestedArrayKey: 'lists',
        },
    );
}

async function loadGroupDealCategoriesData(
    storage: StorageService,
    group: string,
): Promise<PbxCategoryDefinition[]> {
    const deals = await loadGroupDealsData(storage, group);
    return deals.flatMap(deal =>
        convertCategories(
            (deal.categories ?? []) as Parameters<typeof convertCategories>[0],
            PbxEntityType.DEAL,
        ),
    );
}

export async function buildGroupFromStorage(
    storage: StorageService,
    group: string,
    appType = group,
): Promise<PbxGroupDefinition> {
    const [fields, categories, smarts, lists, rpas] = await Promise.all([
        loadGroupFieldsData(storage, group),
        loadGroupDealCategoriesData(storage, group),
        loadGroupSmartsData(storage, group),
        loadGroupListsData(storage, group),
        loadGroupRpasData(storage, group),
    ]);

    const entityFields = withEntityFields(fields);
    const smartsWithFields = attachFieldsToSmarts(
        convertSmarts(smarts as Parameters<typeof convertSmarts>[0]),
        fields,
    );
    const listsWithFields = attachFieldsToLists(lists, fields);
    const rpasWithFields = attachFieldsToRpas(rpas, fields);

    return {
        group,
        appType,
        fields,
        ...entityFields,
        deal: {
            categories,
            fields: entityFields.deal?.fields ?? [],
        },
        smarts: smartsWithFields,
        lists: listsWithFields,
        rpas: rpasWithFields,
    };
}
