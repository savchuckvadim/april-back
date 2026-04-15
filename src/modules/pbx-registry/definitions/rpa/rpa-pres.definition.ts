import { StorageService } from '@/core/storage';
import { PbxRpaDefinition, PbxFieldDefinition } from '../../interfaces';
import { convertRpas, convertFields } from '../converters';
import { loadRegistryJsonFromStorage } from '../storage-data-loader';

type RpaRegistryData = { rpa: unknown[]; fields: unknown[] };

async function loadRpaPresData(
    storage: StorageService,
): Promise<RpaRegistryData> {
    return loadRegistryJsonFromStorage<RpaRegistryData>(
        storage,
        'rpa-pres.json',
    );
}

export async function loadRpaPresDefinition(
    storage: StorageService,
): Promise<PbxRpaDefinition> {
    const data = await loadRpaPresData(storage);
    const rpas = convertRpas(data.rpa as Parameters<typeof convertRpas>[0]);

    return rpas.find(r => r.code === 'sales') || rpas[0];
}

export async function loadRpaPresFields(
    storage: StorageService,
): Promise<PbxFieldDefinition[]> {
    const data = await loadRpaPresData(storage);

    return convertFields(data.fields as Parameters<typeof convertFields>[0]);
}
