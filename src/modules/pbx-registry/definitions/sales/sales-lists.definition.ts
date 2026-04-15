import { StorageService } from '@/core/storage';
import { PbxFieldDefinition } from '../../interfaces';
import { convertFields } from '../converters';
import { loadRegistryJsonFromStorage } from '../storage-data-loader';

type ListData = { fields: unknown[] };

async function loadListFields(
    storage: StorageService,
    fileName: string,
): Promise<PbxFieldDefinition[]> {
    const data = await loadRegistryJsonFromStorage<ListData>(storage, fileName);

    return convertFields(data.fields as Parameters<typeof convertFields>[0]);
}

export function loadSalesListKpiFields(
    storage: StorageService,
): Promise<PbxFieldDefinition[]> {
    return loadListFields(storage, 'sales-op-lists--list-kpi.json');
}

export function loadSalesListHistoryFields(
    storage: StorageService,
): Promise<PbxFieldDefinition[]> {
    return loadListFields(storage, 'sales-op-lists--list-history.json');
}

export function loadSalesListPresentationFields(
    storage: StorageService,
): Promise<PbxFieldDefinition[]> {
    return loadListFields(storage, 'sales-pres-list--list-presentation.json');
}
