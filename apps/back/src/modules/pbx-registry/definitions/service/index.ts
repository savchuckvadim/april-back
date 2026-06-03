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
import { buildGroupFromStorage } from '../utils/build-group-from-storage';
import { loadMergedRegistryJsonDir } from '../utils/storage/load-registry-json-dir';

type ServiceDealRegistryData = {
    categories?: unknown[];
};

/** Один смарт из JSON (install/data/service/smarts/*.json). */
type ServiceSmartJson = {
    id?: number | null;
    entityTypeId?: number | null;
    entityType?: string;
    type?: string;
    group?: string;
    name?: string;
    title: string;
    bitrixId?: string | null;
    bitrixCamelId?: string;
    code: string;
    isActive?: boolean;
    isNeedUpdate?: boolean;
    order?: number;
    isDefault?: string;
    categories?: unknown[];
    fields?: unknown[];
};

async function loadServiceDealsData(
    storage: StorageService,
): Promise<ServiceDealRegistryData[]> {
    return loadMergedRegistryJsonDir<ServiceDealRegistryData>(
        storage,
        'service/deal',
        { nestedArrayKey: 'deals' },
    );
}

async function loadServiceFieldsData(
    storage: StorageService,
): Promise<PbxFieldDefinition[]> {
    const data = await loadMergedRegistryJsonDir<unknown>(
        storage,
        'service/fields',
        {
            nestedArrayKey: 'fields',
        },
    );
    return convertFields(data as Parameters<typeof convertFields>[0]);
}

async function loadServiceSmartsData(
    storage: StorageService,
): Promise<ServiceSmartJson[]> {
    return loadMergedRegistryJsonDir<ServiceSmartJson>(
        storage,
        'service/smarts',
        { nestedArrayKey: 'smarts' },
    );
}

async function loadServiceRpasData(
    storage: StorageService,
): Promise<PbxRpaDefinition[]> {
    const data = await loadMergedRegistryJsonDir<unknown>(
        storage,
        'service/rpa',
        {
            nestedArrayKey: 'rpas',
        },
    );
    return convertRpas(data as Parameters<typeof convertRpas>[0]);
}

export async function loadServiceListData(
    storage: StorageService,
): Promise<PbxListDefinition[]> {
    return loadMergedRegistryJsonDir<PbxListDefinition>(
        storage,
        'service/lists',
        {
            nestedArrayKey: 'lists',
        },
    );
}

export async function loadServiceDealCategories(
    storage: StorageService,
): Promise<PbxCategoryDefinition[]> {
    const deals = await loadServiceDealsData(storage);
    return deals.flatMap(deal =>
        convertCategories(
            (deal.categories ?? []) as Parameters<typeof convertCategories>[0],
            PbxEntityType.DEAL,
        ),
    );
}

export async function loadServiceFields(
    storage: StorageService,
): Promise<PbxFieldDefinition[]> {
    return loadServiceFieldsData(storage);
}

export async function loadServiceSmarts(
    storage: StorageService,
): Promise<PbxSmartDefinition[]> {
    const serviceData = await loadServiceSmartsData(storage);
    return convertSmarts(serviceData as Parameters<typeof convertSmarts>[0]);
}

export async function loadServiceRpas(
    storage: StorageService,
): Promise<PbxRpaDefinition[]> {
    return loadServiceRpasData(storage);
}

export async function buildServiceGroup(
    storage: StorageService,
): Promise<PbxGroupDefinition> {
    return buildGroupFromStorage(storage, 'service');
}
