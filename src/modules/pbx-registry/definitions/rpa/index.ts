import { StorageService } from '@/core/storage';
import { PbxGroupDefinition } from '../../interfaces';
import {
    loadRpaSupplyDefinition,
    loadRpaSupplyFields,
} from './rpa-supply.definition';
import {
    loadRpaPresDefinition,
    loadRpaPresFields,
} from './rpa-pres.definition';

export async function buildRpaGroup(
    storage: StorageService,
): Promise<PbxGroupDefinition> {
    const [supplyDefinition, supplyFields, presDefinition, presFields] =
        await Promise.all([
            loadRpaSupplyDefinition(storage),
            loadRpaSupplyFields(storage),
            loadRpaPresDefinition(storage),
            loadRpaPresFields(storage),
        ]);

    return {
        group: 'rpa',
        appType: 'rpa',
        fields: [...supplyFields, ...presFields],
        categories: [],
        rpas: [supplyDefinition, presDefinition],
    };
}

export {
    loadRpaSupplyDefinition,
    loadRpaSupplyFields,
    loadRpaPresDefinition,
    loadRpaPresFields,
};
