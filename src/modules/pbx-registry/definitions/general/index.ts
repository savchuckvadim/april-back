import { StorageService } from '@/core/storage';
import { PbxGroupDefinition } from '../../interfaces';
import { buildGroupFromStorage } from '../utils/build-group-from-storage';

export async function buildGeneralGroup(
    storage: StorageService,
): Promise<PbxGroupDefinition> {
    return buildGroupFromStorage(storage, 'general');
}
