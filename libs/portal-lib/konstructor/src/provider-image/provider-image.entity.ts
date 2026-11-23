import { ProviderImageRole } from './provider-image.role';

/** Форматы картинок поставщика: определяются по содержимому файла. */
export const PROVIDER_IMAGE_FORMATS = ['png', 'jpg'] as const;

export type ProviderImageFormat = (typeof PROVIDER_IMAGE_FORMATS)[number];

/** Картинка поставщика (`provider_images`): печать, подпись или логотип реквизитов. */
export class ProviderImageEntity {
    /** uuid; он же имя файла на диске */
    id: string;
    /** Реквизиты поставщика (`rqs.id`) */
    rqId: number;
    role: ProviderImageRole;
    /** Путь внутри `storage/app` без корня хранилища: `konstructor/provider-images/{rqId}/{id}.{format}` */
    path: string;
    format: ProviderImageFormat;
    /** Пиксели, как их покажет браузер (с учётом поворота из EXIF) */
    width: number;
    height: number;
    /** Байты */
    size: number;
    /** Имя, с которым файл загрузили: только для показа в админке */
    originalName: string | null;
    /** Запись `files`, из которой перенесена картинка */
    legacyFileId: number | null;
    createdAt: Date | null;
    updatedAt: Date | null;
}

/** Прочитанная картинка: байты для печати в документе. */
export interface ProviderImageContent {
    role: ProviderImageRole;
    format: ProviderImageFormat;
    data: Buffer;
}
