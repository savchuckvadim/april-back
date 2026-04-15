import { StorageService } from '@/core/storage';
import { PbxEntityType } from '@/shared/enums';
import {
    PbxFieldDefinition,
    PbxCategoryDefinition,
    PbxSmartDefinition,
    PbxGroupDefinition,
} from '../../interfaces';
import { convertCategories, convertFields, convertSmarts } from '../converters';
import { loadRegistryJsonFromStorage } from '../storage-data-loader';

type ServiceDealsRegistryData = {
    deals: Array<{ categories: unknown[] }>;
    fields: unknown[];
    smarts: unknown[];
};

type ServiceListRegistryData = {
    lists: Array<{ fields: unknown[] }>;
};

async function loadServiceDealsData(
    storage: StorageService,
): Promise<ServiceDealsRegistryData> {
    return loadRegistryJsonFromStorage<ServiceDealsRegistryData>(
        storage,
        'service-deals.json',
    );
}

async function loadServiceListData(
    storage: StorageService,
): Promise<ServiceListRegistryData> {
    return loadRegistryJsonFromStorage<ServiceListRegistryData>(
        storage,
        'service-list.json',
    );
}

export async function loadServiceDealCategories(
    storage: StorageService,
): Promise<PbxCategoryDefinition[]> {
    const serviceData = await loadServiceDealsData(storage);

    return serviceData.deals.flatMap(d =>
        convertCategories(
            d.categories as Parameters<typeof convertCategories>[0],
            PbxEntityType.DEAL,
        ),
    );
}

export async function loadServiceFields(
    storage: StorageService,
): Promise<PbxFieldDefinition[]> {
    const serviceData = await loadServiceDealsData(storage);

    return convertFields(
        serviceData.fields as Parameters<typeof convertFields>[0],
    );
}

export async function loadServiceSmarts(
    storage: StorageService,
): Promise<PbxSmartDefinition[]> {
    const serviceData = await loadServiceDealsData(storage);

    return convertSmarts(
        serviceData.smarts as Parameters<typeof convertSmarts>[0],
    );
}

export async function loadServiceListHistoryFields(
    storage: StorageService,
): Promise<PbxFieldDefinition[]> {
    const serviceListData = await loadServiceListData(storage);

    return convertFields(
        (serviceListData.lists[0]?.fields || []) as Parameters<
            typeof convertFields
        >[0],
    );
}

export async function buildServiceGroup(
    storage: StorageService,
): Promise<PbxGroupDefinition> {
    const [fields, categories, smarts] = await Promise.all([
        loadServiceFields(storage),
        loadServiceDealCategories(storage),
        loadServiceSmarts(storage),
    ]);

    return {
        group: 'service',
        appType: 'service',
        fields,
        categories,
        smarts,
    };
}
