import {
    ProviderImageEntity,
    ProviderImageFormat,
} from './provider-image.entity';
import { ProviderImageRole } from './provider-image.role';

/** Данные записи картинки: загрузка новой и замена прежней одной операцией. */
export interface UpsertProviderImageData {
    /** uuid, который выдал Nest; он же имя файла */
    id: string;
    rqId: number;
    role: ProviderImageRole;
    path: string;
    format: ProviderImageFormat;
    width: number;
    height: number;
    size: number;
    originalName: string | null;
    /**
     * Запись `files`, из которой перенесена картинка. Не задано — при замене
     * прежнее значение остаётся, при создании записи будет null.
     */
    legacyFileId?: number | null;
}

export abstract class ProviderImageRepository {
    /** Есть ли такие реквизиты: картинка без реквизитов нарушила бы внешний ключ */
    abstract rqExists(rqId: number): Promise<boolean>;

    /** Все картинки реквизитов, по порядку ролей */
    abstract findByRq(rqId: number): Promise<ProviderImageEntity[]>;

    abstract find(
        rqId: number,
        role: ProviderImageRole,
    ): Promise<ProviderImageEntity | null>;

    /**
     * Одна картинка каждой роли на реквизиты: записи с такой парой нет —
     * создаётся, есть — обновляется (id, путь и сведения о файле новые).
     */
    abstract upsert(
        data: UpsertProviderImageData,
    ): Promise<ProviderImageEntity>;

    /** false — картинки с такой ролью у реквизитов нет */
    abstract delete(rqId: number, role: ProviderImageRole): Promise<boolean>;
}
