import { StorageService, StorageType } from '@/core/storage';

import { PBX_REGISTRY_DATA_SUBPATH } from './storage-data-loader';

export type LoadMergedRegistryJsonDirOptions = {
    /**
     * Если корень JSON — объект `{ [key]: T[] }`, указать ключ массива
     * (например `smarts`). Иначе учитываются только корень-массив или один объект.
     */
    nestedArrayKey?: string;
};

function registryDataDirPath(relativeDir: string): string {
    const base = PBX_REGISTRY_DATA_SUBPATH.replace(/\/+$/, '');
    const rest = relativeDir.replace(/^\/+/, '').replace(/\/+$/, '');
    return rest ? `${base}/${rest}` : base;
}

/**
 * Читает все `*.json` в `storage/app/{install/data}/{relativeDir}/`, сортирует по имени
 * и сливает в один массив. Формат файла: массив записей, объект с массивом по
 * `nestedArrayKey`, или одна запись-объект.
 */
export async function loadMergedRegistryJsonDir<T>(
    storage: StorageService,
    /** Подкаталог внутри `install/data`, например `service/smarts`. */
    relativeDir: string,
    options?: LoadMergedRegistryJsonDirOptions,
): Promise<T[]> {
    const dirPath = registryDataDirPath(relativeDir);
    const nestedKey = options?.nestedArrayKey;

    const files = await storage.listFilesByType(StorageType.APP, dirPath);
    const jsonFiles = files.filter((f: string) => f.endsWith('.json')).sort();

    const merged: T[] = [];
    for (const fileName of jsonFiles) {
        const buffer = await storage.readFileByType(
            StorageType.APP,
            dirPath,
            fileName,
        );
        const parsed: unknown = JSON.parse(buffer.toString('utf-8'));

        if (Array.isArray(parsed)) {
            merged.push(...(parsed as T[]));
        } else if (
            nestedKey &&
            parsed &&
            typeof parsed === 'object' &&
            Array.isArray((parsed as Record<string, unknown>)[nestedKey])
        ) {
            merged.push(...(parsed as Record<string, T[]>)[nestedKey]);
        } else if (parsed && typeof parsed === 'object') {
            merged.push(parsed as T);
        }
    }

    return merged;
}
