import type { ProviderImage } from 'generated/prisma';
import {
    PROVIDER_IMAGE_FORMATS,
    ProviderImageEntity,
    ProviderImageFormat,
} from '../provider-image.entity';
import { isProviderImageRole } from '../provider-image.role';

const isProviderImageFormat = (value: string): value is ProviderImageFormat =>
    (PROVIDER_IMAGE_FORMATS as readonly string[]).includes(value);

/**
 * bigint только у rqId (внешний ключ на rqs.id). Строка с ролью или форматом,
 * которых код не знает (роль добавили в более новой версии), в сущность не
 * превращается: null, вызывающий её пропускает.
 */
export const createProviderImageEntityFromPrisma = (
    row: ProviderImage,
): ProviderImageEntity | null => {
    if (!isProviderImageRole(row.role) || !isProviderImageFormat(row.format)) {
        return null;
    }
    return {
        id: row.id,
        rqId: Number(row.rqId),
        role: row.role,
        path: row.path,
        format: row.format,
        width: row.width,
        height: row.height,
        size: row.size,
        originalName: row.originalName,
        legacyFileId: row.legacyFileId,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
    };
};
