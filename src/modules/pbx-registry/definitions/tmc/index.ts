import { StorageService } from '@/core/storage';
import { PbxGroupDefinition } from '../../interfaces';
import { buildGroupFromStorage } from '../utils/build-group-from-storage';

export async function buildTmcGroup(
    storage: StorageService,
): Promise<PbxGroupDefinition> {
    return buildGroupFromStorage(storage, 'tmc');
}
