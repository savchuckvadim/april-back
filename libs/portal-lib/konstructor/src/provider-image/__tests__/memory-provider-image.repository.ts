import { ProviderImageEntity } from '../provider-image.entity';
import { ProviderImageRole } from '../provider-image.role';
import {
    ProviderImageRepository,
    UpsertProviderImageData,
} from '../provider-image.repository';

/**
 * Репозиторий картинок в памяти для юнит-тестов: записи копятся в `rows`,
 * существующие реквизиты задаются в конструкторе.
 */
export class MemoryProviderImageRepository implements ProviderImageRepository {
    readonly rows: ProviderImageEntity[] = [];
    /** Следующий upsert упадёт с этой ошибкой */
    failNextUpsert: Error | null = null;

    constructor(private readonly rqIds: number[] = []) {}

    rqExists(rqId: number): Promise<boolean> {
        return Promise.resolve(this.rqIds.includes(rqId));
    }

    findByRq(rqId: number): Promise<ProviderImageEntity[]> {
        return Promise.resolve(
            this.rows.filter(row => row.rqId === rqId).map(row => ({ ...row })),
        );
    }

    find(
        rqId: number,
        role: ProviderImageRole,
    ): Promise<ProviderImageEntity | null> {
        const row = this.rows.find(
            item => item.rqId === rqId && item.role === role,
        );
        return Promise.resolve(row ? { ...row } : null);
    }

    upsert(data: UpsertProviderImageData): Promise<ProviderImageEntity> {
        if (this.failNextUpsert) {
            const error = this.failNextUpsert;
            this.failNextUpsert = null;
            return Promise.reject(error);
        }
        const now = new Date();
        const index = this.rows.findIndex(
            row => row.rqId === data.rqId && row.role === data.role,
        );
        const previous = index >= 0 ? this.rows[index] : null;
        const row: ProviderImageEntity = {
            id: data.id,
            rqId: data.rqId,
            role: data.role,
            path: data.path,
            format: data.format,
            width: data.width,
            height: data.height,
            size: data.size,
            originalName: data.originalName,
            legacyFileId:
                data.legacyFileId === undefined
                    ? (previous?.legacyFileId ?? null)
                    : data.legacyFileId,
            createdAt: previous?.createdAt ?? now,
            updatedAt: now,
        };
        if (index >= 0) this.rows[index] = row;
        else this.rows.push(row);
        return Promise.resolve({ ...row });
    }

    delete(rqId: number, role: ProviderImageRole): Promise<boolean> {
        const index = this.rows.findIndex(
            row => row.rqId === rqId && row.role === role,
        );
        if (index < 0) return Promise.resolve(false);
        this.rows.splice(index, 1);
        return Promise.resolve(true);
    }
}
