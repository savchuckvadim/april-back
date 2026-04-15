import { StorageService } from '@/core/storage';
import { PbxRpaDefinition, PbxFieldDefinition } from '../../interfaces';
import { convertRpas, convertFields } from '../converters';
import { loadRegistryJsonFromStorage } from '../storage-data-loader';

type RpaRegistryData = { rpa: unknown[]; fields: unknown[] };

async function loadRpaSupplyData(
    storage: StorageService,
): Promise<RpaRegistryData> {
    return loadRegistryJsonFromStorage<RpaRegistryData>(
        storage,
        'rpa-supply.json',
    );
}

export async function loadRpaSupplyDefinition(
    storage: StorageService,
): Promise<PbxRpaDefinition> {
    const data = await loadRpaSupplyData(storage);
    const rpas = convertRpas(data.rpa as Parameters<typeof convertRpas>[0]);

    return rpas.find(r => r.code === 'supply') || rpas[0];
}

export async function loadRpaSupplyFields(
    storage: StorageService,
): Promise<PbxFieldDefinition[]> {
    const data = await loadRpaSupplyData(storage);

    return convertFields(data.fields as Parameters<typeof convertFields>[0]);
}
