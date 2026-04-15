import { StorageService, StorageType } from '@/core/storage';

const PBX_REGISTRY_DATA_SUBPATH = 'install/data';

export async function loadRegistryJsonFromStorage<T>(
    storage: StorageService,
    fileName: string,
): Promise<T> {
    const buffer = await storage.readFileByType(
        StorageType.APP,
        PBX_REGISTRY_DATA_SUBPATH,
        fileName,
    );

    return JSON.parse(buffer.toString('utf-8')) as T;
}
