import { StorageService } from '@/core/storage';
import { PbxEntityType } from '@/shared/enums';
import {
    PbxSmartDefinition,
    PbxCategoryDefinition,
    PbxFieldDefinition,
} from '../../interfaces';
import { convertSmarts, convertCategories, convertFields } from '../converters';
import { loadRegistryJsonFromStorage } from '../storage-data-loader';

type SalesSmartsRegistryData = {
    smarts: unknown[];
    deals: unknown[];
    fields: unknown[];
};

async function loadSalesSmartsData(
    storage: StorageService,
): Promise<SalesSmartsRegistryData> {
    return loadRegistryJsonFromStorage<SalesSmartsRegistryData>(
        storage,
        'sales-smarts.json',
    );
}

export async function loadSalesSmartDefinitions(
    storage: StorageService,
): Promise<PbxSmartDefinition[]> {
    const data = await loadSalesSmartsData(storage);

    return convertSmarts(data.smarts as Parameters<typeof convertSmarts>[0]);
}

export async function loadSalesDealCategoriesFromSmarts(
    storage: StorageService,
): Promise<PbxCategoryDefinition[]> {
    const data = await loadSalesSmartsData(storage);
    const rawDeals = data.deals as Array<{ categories: unknown[] }>;

    return rawDeals.flatMap(d =>
        convertCategories(
            d.categories as Parameters<typeof convertCategories>[0],
            PbxEntityType.DEAL,
        ),
    );
}

export async function loadSalesFieldsFromSmarts(
    storage: StorageService,
): Promise<PbxFieldDefinition[]> {
    const data = await loadSalesSmartsData(storage);

    return convertFields(data.fields as Parameters<typeof convertFields>[0]);
}
