import { ApiProperty } from '@nestjs/swagger';
import {
    PROVIDER_IMAGE_ROLES,
    ProviderImageRole,
} from '../provider-image.role';
import {
    PROVIDER_IMAGE_LEGACY_IMPORT_MAX_BYTES,
    PROVIDER_IMAGE_LEGACY_IMPORT_MAX_FILES,
    PROVIDER_IMAGE_LEGACY_IMPORT_STATUSES,
    ProviderImageLegacyImportReport,
    ProviderImageLegacyImportRow,
    ProviderImageLegacyImportStatus,
    ProviderImageLegacyImportTotals,
} from './provider-image-legacy-import.types';

/**
 * Тело переноса из легаси (multipart/form-data). Имя каждого файла несёт
 * относительный путь внутри папки `clients`: так сервер находит запись
 * `files`. Разбирает файлы multer, проверки делает сервис.
 */
export class ProviderImageLegacyImportUploadDto {
    @ApiProperty({
        description:
            `Файлы картинок из копии папки clients легаси, до ${PROVIDER_IMAGE_LEGACY_IMPORT_MAX_FILES} штук, ` +
            `каждый до ${PROVIDER_IMAGE_LEGACY_IMPORT_MAX_BYTES / (1024 * 1024)} МБ. В имени файла передаётся относительный путь ` +
            '(`clients/<домен>/rq/<rqId>/<роль>/<имя>.png`): всё, что стоит перед `clients/`, отбрасывается, ' +
            'обратные слэши заменяются прямыми. Имя без корня `clients/` (только название файла или часть пути) ' +
            'ищется по хвосту пути `files.path` и принимается, когда подходит ровно одна запись.',
        type: 'array',
        items: { type: 'string', format: 'binary' },
    })
    files: Express.Multer.File[];
}

export class ProviderImageLegacyImportRowDto
    implements ProviderImageLegacyImportRow
{
    @ApiProperty({
        description:
            'Домен портала, которому принадлежат реквизиты (rq → поставщик → портал); null, если определить не удалось.',
        type: String,
        nullable: true,
        example: 'garant-office.bitrix24.ru',
    })
    portalDomain: string | null;

    @ApiProperty({
        description:
            'Реквизиты (`rqs.id`). 0 у загруженного файла, для которого нет записи в `files`.',
        type: Number,
        example: 12,
    })
    rqId: number;

    @ApiProperty({
        description: 'Название реквизитов; null, если реквизитов нет в базе.',
        type: String,
        nullable: true,
        example: 'ООО «Ромашка»',
    })
    rqName: string | null;

    @ApiProperty({
        description:
            'Роль в картинках поставщика, на которую переносится запись: stamp — печать, ' +
            'signature_director — подпись руководителя, signature_accountant — подпись главного ' +
            'бухгалтера, logo — логотип. null — запись не переносится (пояснение в `message`).',
        enum: PROVIDER_IMAGE_ROLES,
        enumName: 'ProviderImageRole',
        nullable: true,
        example: 'stamp',
    })
    role: ProviderImageRole | null;

    @ApiProperty({
        description:
            'Запись легаси (`files.id`). 0 у загруженного файла, для которого нет записи в `files`.',
        type: Number,
        example: 345,
    })
    legacyFileId: number;

    @ApiProperty({
        description:
            'Путь файла в легаси (`files.path`); у файла без записи в `files` — загруженный путь после нормализации.',
        type: String,
        example:
            'clients/garant-office.bitrix24.ru/rq/12/stamp/12_stamp_stamp_5f1c.png',
    })
    legacyPath: string;

    @ApiProperty({
        description:
            'Итог по записи: imported — перенесено; would-import — будет перенесено (режим проверки); ' +
            'exists — у реквизитов уже есть другая картинка этой роли, не перезаписывается; ' +
            'already — эта запись уже перенесена; no-file — файл не загружен; ' +
            'skipped — запись не переносится; error — ошибка записи.',
        enum: PROVIDER_IMAGE_LEGACY_IMPORT_STATUSES,
        enumName: 'ProviderImageLegacyImportStatus',
        example: 'would-import',
    })
    status: ProviderImageLegacyImportStatus;

    @ApiProperty({
        description:
            'Пояснение по-русски: причина пропуска, текст ошибки или итог.',
        type: String,
        nullable: true,
        example: 'Будет перенесено: Печать.',
    })
    message: string | null;
}

export class ProviderImageLegacyImportTotalsDto
    implements ProviderImageLegacyImportTotals
{
    @ApiProperty({ description: 'Перенесено.', type: Number, example: 3 })
    imported: number;

    @ApiProperty({
        description: 'Будет перенесено (режим проверки).',
        type: Number,
        example: 0,
    })
    wouldImport: number;

    @ApiProperty({
        description: 'У реквизитов уже есть другая картинка этой роли.',
        type: Number,
        example: 1,
    })
    exists: number;

    @ApiProperty({
        description: 'Запись уже перенесена раньше.',
        type: Number,
        example: 2,
    })
    already: number;

    @ApiProperty({
        description: 'Файл записи не загружен.',
        type: Number,
        example: 0,
    })
    noFile: number;

    @ApiProperty({
        description: 'Записи, которые не переносятся.',
        type: Number,
        example: 4,
    })
    skipped: number;

    @ApiProperty({
        description: 'Ошибки записи.',
        type: Number,
        example: 0,
    })
    error: number;
}

export class ProviderImageLegacyImportReportDto
    implements ProviderImageLegacyImportReport
{
    @ApiProperty({
        description:
            'true — режим проверки, ничего не записано; false — перенос выполнен.',
        type: Boolean,
        example: true,
    })
    dryRun: boolean;

    @ApiProperty({
        description:
            'Строки по всем записям `files` реквизитов, к которым относятся загруженные файлы, ' +
            'и по загруженным файлам без записи в `files`.',
        type: [ProviderImageLegacyImportRowDto],
    })
    rows: ProviderImageLegacyImportRowDto[];

    @ApiProperty({
        description: 'Счётчики строк по итогам.',
        type: ProviderImageLegacyImportTotalsDto,
    })
    totals: ProviderImageLegacyImportTotalsDto;
}
