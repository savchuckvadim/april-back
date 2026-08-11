import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';
import {
    SKAP_FILE_STATUSES,
    SKAP_ITEM_STATUSES,
    SKAP_RUN_STATUSES,
    SkapFileStatus,
    SkapItemStatus,
    SkapRunStatus,
} from '@lib/skap-lib';
import {
    SkapImportFile,
    SkapImportItem,
    SkapImportRun,
} from 'generated/prisma';

export class SkapFilesQueryDto {
    @ApiPropertyOptional({
        description: 'Фильтр по статусу файла',
        enum: SKAP_FILE_STATUSES,
        example: 'error_format',
    })
    @IsOptional()
    @IsString()
    @IsIn(SKAP_FILE_STATUSES)
    status?: SkapFileStatus;
}

export class SkapItemsQueryDto {
    @ApiPropertyOptional({
        description: 'Фильтр по статусу записи логин×месяц',
        enum: SKAP_ITEM_STATUSES,
        example: 'skipped_no_company',
    })
    @IsOptional()
    @IsString()
    @IsIn(SKAP_ITEM_STATUSES)
    status?: SkapItemStatus;
}

export class SkapRunDto {
    @ApiProperty({
        description: 'ID прогона импорта в журнале (uuid)',
        type: String,
        example: 'e2b1c1f0-6c2a-4b6e-9f1d-1a2b3c4d5e6f',
    })
    id!: string;

    @ApiProperty({
        description: 'Домен портала Битрикс, для которого выполнялся прогон',
        type: String,
        example: 'client.bitrix24.ru',
    })
    domain!: string;

    @ApiProperty({
        description:
            'Статус прогона: running — идёт, done — завершён, ' +
            'stopped_time_budget — остановлен по бюджету времени, ' +
            'error — упал с ошибкой',
        enum: SKAP_RUN_STATUSES,
        example: 'done',
    })
    status!: SkapRunStatus;

    @ApiProperty({
        description: 'Причина остановки (time_budget / текст ошибки)',
        type: String,
        nullable: true,
        example: null,
    })
    stopReason!: string | null;

    @ApiProperty({
        description:
            'Счётчики прогона: файлы, элементы, сессии, подписки, ворнинги',
        type: Object,
        nullable: true,
        example: { files: 3, items: 120, warnings: 2 },
    })
    stats!: unknown;

    @ApiProperty({
        description: 'Начало прогона',
        type: String,
        format: 'date-time',
        nullable: true,
        example: '2026-08-01T03:00:00.000Z',
    })
    startedAt!: Date | null;

    @ApiProperty({
        description: 'Окончание прогона',
        type: String,
        format: 'date-time',
        nullable: true,
        example: '2026-08-01T03:04:12.000Z',
    })
    finishedAt!: Date | null;

    static fromRow(row: SkapImportRun): SkapRunDto {
        const dto = new SkapRunDto();
        dto.id = row.id;
        dto.domain = row.domain;
        dto.status = row.status as SkapRunStatus;
        dto.stopReason = row.stopReason;
        dto.stats = row.stats;
        dto.startedAt = row.startedAt;
        dto.finishedAt = row.finishedAt;
        return dto;
    }
}

export class SkapFileDto {
    @ApiProperty({
        description: 'ID файла в журнале импорта (uuid)',
        type: String,
        example: '7f3a9d20-1b4c-4e8f-a6d2-9c0e5b1f2a3d',
    })
    id!: string;

    @ApiProperty({
        description: 'ID файла на Диске Битрикс',
        type: String,
        example: '1234',
    })
    diskFileId!: string;

    @ApiProperty({
        description: 'Путь файла от папки загрузок',
        type: String,
        example: 'август 2024/61-40762/2024.09.03.Online.csv',
    })
    fileName!: string;

    @ApiProperty({
        description: 'Статус обработки файла',
        enum: SKAP_FILE_STATUSES,
        example: 'done',
    })
    status!: SkapFileStatus;

    @ApiProperty({
        description: 'Версия распознанного формата',
        type: String,
        nullable: true,
        example: 'online_v1',
    })
    formatVersion!: string | null;

    @ApiProperty({
        description: 'Текст ошибки (для error / error_format)',
        type: String,
        nullable: true,
        example: 'Не распознан формат колонок',
    })
    error!: string | null;

    @ApiProperty({
        description: 'Счётчики обработки файла и ворнинги',
        type: Object,
        nullable: true,
        example: { rows: 250, created: 10, updated: 240 },
    })
    stats!: unknown;

    @ApiProperty({
        description: 'Окончание обработки',
        type: String,
        format: 'date-time',
        nullable: true,
        example: '2026-08-01T03:02:45.000Z',
    })
    finishedAt!: Date | null;

    static fromRow(row: SkapImportFile): SkapFileDto {
        const dto = new SkapFileDto();
        dto.id = row.id;
        dto.diskFileId = row.diskFileId;
        dto.fileName = row.fileName;
        dto.status = row.status as SkapFileStatus;
        dto.formatVersion = row.formatVersion;
        dto.error = row.error;
        dto.stats = row.stats;
        dto.finishedAt = row.finishedAt;
        return dto;
    }
}

export class SkapItemDto {
    @ApiProperty({
        description: 'ID записи логин×месяц в журнале импорта (uuid)',
        type: String,
        example: 'a1b2c3d4-5e6f-4a7b-8c9d-0e1f2a3b4c5d',
    })
    id!: string;

    @ApiProperty({
        description: 'Номер карточки клиента АРМ (рег-лист клиента)',
        type: String,
        example: '61-40762-000004',
    })
    clientCard!: string;

    @ApiProperty({
        description: 'Email-логин СКАП',
        type: String,
        example: 'user@client.ru',
    })
    login!: string;

    @ApiProperty({
        description: 'Отчётный месяц (1-е число)',
        type: String,
        format: 'date',
        example: '2024-08-01',
    })
    period!: Date;

    @ApiProperty({
        description: 'Статус обработки записи логин×месяц',
        enum: SKAP_ITEM_STATUSES,
        example: 'created',
    })
    status!: SkapItemStatus;

    @ApiProperty({
        description: 'ID элемента смарта «СКАП» в Битриксе',
        type: Number,
        nullable: true,
        example: 1501,
    })
    bitrixItemId!: number | null;

    @ApiProperty({
        description: 'ID найденной компании',
        type: Number,
        nullable: true,
        example: 20544,
    })
    companyId!: number | null;

    @ApiProperty({
        description: 'ID привязанной сделки',
        type: Number,
        nullable: true,
        example: 30712,
    })
    dealId!: number | null;

    @ApiProperty({
        description: 'Ворнинг записи (причина скипа/ошибки)',
        type: String,
        nullable: true,
        example: 'Компания по рег-листу не найдена',
    })
    warning!: string | null;

    static fromRow(row: SkapImportItem): SkapItemDto {
        const dto = new SkapItemDto();
        dto.id = row.id;
        dto.clientCard = row.clientCard;
        dto.login = row.login;
        dto.period = row.period;
        dto.status = row.status as SkapItemStatus;
        dto.bitrixItemId = row.bitrixItemId;
        dto.companyId = row.companyId;
        dto.dealId = row.dealId;
        dto.warning = row.warning;
        return dto;
    }
}

export class SkapRunRequestDto {
    @ApiProperty({
        description:
            'Домен портала Битрикс, для которого запустить прогон импорта ' +
            '(пересчёт после добавления файлов на Диск)',
        type: String,
        example: 'client.bitrix24.ru',
    })
    @IsString()
    domain!: string;
}

export class SkapRunResponseDto {
    @ApiProperty({
        description:
            'Прогон поставлен в очередь. Если прогон по домену уже идёт — ' +
            'второй не ставится (jobId={domain}:run), это не ошибка',
        type: Boolean,
        example: true,
    })
    queued!: boolean;

    @ApiProperty({
        description: 'ID джоба в очереди skap-import',
        type: String,
        example: 'client.bitrix24.ru:run',
    })
    jobId!: string;
}

export class SkapRetryResponseDto {
    @ApiProperty({
        description: 'Файл сброшен в pending (false — файл не найден)',
        type: Boolean,
        example: true,
    })
    reset!: boolean;
}

export class SkapReprocessResponseDto {
    @ApiProperty({
        description:
            'Сколько файлов-источников записей skipped_no_company сброшено ' +
            'в pending (пересоздадутся следующим прогоном)',
        type: Number,
        example: 3,
    })
    filesReset!: number;
}
