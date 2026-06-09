import { ApiProperty } from '@nestjs/swagger';
import { PortalRqResponseDto } from '@lib/portal-lib/pbx-domain/portal-rq';
import { InstallRqFieldDto, InstallRqPresetDto } from './install-rq.dto';

/** Результат синхронизации одного пресета (Bitrix + зеркало в БД). */
export class RqPresetSyncResultDto {
    @ApiProperty({ description: 'Бизнес-код пресета', example: 'preset_org' })
    code!: string;

    @ApiProperty({
        description: 'XML_ID пресета',
        example: 'april_rq_preset_org',
    })
    xmlId!: string;

    @ApiProperty({
        description: 'ID пресета в Bitrix',
        example: 12,
        type: Number,
    })
    bitrixId!: number;

    @ApiProperty({
        description: 'Создан (true) или обновлён (false)',
        example: true,
    })
    created!: boolean;

    @ApiProperty({
        description: 'Строка зеркала в `bx_rqs`',
        type: PortalRqResponseDto,
    })
    portalResult!: PortalRqResponseDto;
}

/** Результат синхронизации одного пользовательского поля реквизита. */
export class RqFieldSyncResultDto {
    @ApiProperty({ description: 'XML_ID поля', example: 'position_case' })
    xmlId!: string;

    @ApiProperty({
        description: 'ID поля в Bitrix',
        example: 235,
        type: Number,
    })
    fieldId!: number;

    @ApiProperty({
        description: 'FIELD_NAME поля',
        example: 'UF_CRM_POSITION_CASE',
    })
    fieldName!: string;

    @ApiProperty({
        description: 'Создано (true) или обновлено (false)',
        example: true,
    })
    created!: boolean;
}

/** Результат установки реквизитной части (пресеты + поля). */
export class InstallRqResultDto {
    @ApiProperty({
        description: 'Домен портала',
        example: 'example.bitrix24.ru',
    })
    domain!: string;

    @ApiProperty({ description: 'ID портала в БД', example: 1, type: Number })
    portalId!: number;

    @ApiProperty({
        description: 'Результаты по пресетам',
        type: [RqPresetSyncResultDto],
    })
    presets!: RqPresetSyncResultDto[];

    @ApiProperty({
        description: 'Результаты по полям',
        type: [RqFieldSyncResultDto],
    })
    fields!: RqFieldSyncResultDto[];
}

/** Эталон для предпросмотра (Monitoring/parse). */
export class RqParseResponseDto {
    @ApiProperty({
        description: 'Эталонные пресеты',
        type: [InstallRqPresetDto],
    })
    presets!: InstallRqPresetDto[];

    @ApiProperty({ description: 'Эталонные поля', type: [InstallRqFieldDto] })
    fields!: InstallRqFieldDto[];
}

/** Статус одного пресета: эталон × Bitrix × БД. */
export class RqPresetMonitorRowDto {
    @ApiProperty({ description: 'Бизнес-код', example: 'preset_org' })
    code!: string;

    @ApiProperty({ description: 'Имя пресета', example: 'Организация' })
    name!: string;

    @ApiProperty({ description: 'XML_ID', example: 'april_rq_preset_org' })
    xmlId!: string;

    @ApiProperty({ description: 'Есть в Bitrix', example: true })
    inBitrix!: boolean;

    @ApiProperty({
        description: 'ID в Bitrix',
        example: 12,
        nullable: true,
        type: Number,
    })
    bitrixId!: number | null;

    @ApiProperty({ description: 'Есть в БД `bx_rqs`', example: true })
    inDb!: boolean;

    @ApiProperty({
        description: 'bitrix_id в БД',
        example: 12,
        nullable: true,
        type: Number,
    })
    dbBitrixId!: number | null;

    @ApiProperty({ description: 'Bitrix и БД совпадают', example: true })
    inSync!: boolean;
}

/** Статус одного поля: эталон × Bitrix. */
export class RqFieldMonitorRowDto {
    @ApiProperty({ description: 'XML_ID', example: 'position_case' })
    xmlId!: string;

    @ApiProperty({ description: 'Подпись поля', example: 'Должность (в лице)' })
    label!: string;

    @ApiProperty({ description: 'Есть в Bitrix', example: true })
    inBitrix!: boolean;

    @ApiProperty({
        description: 'ID поля в Bitrix',
        example: 235,
        nullable: true,
        type: Number,
    })
    fieldId!: number | null;

    @ApiProperty({
        description: 'FIELD_NAME поля',
        example: 'UF_CRM_POSITION_CASE',
        nullable: true,
    })
    fieldName!: string | null;
}

/** Смерженное состояние реквизитов на портале (Monitoring). */
export class RqMonitoringResponseDto {
    @ApiProperty({
        description: 'Домен портала',
        example: 'example.bitrix24.ru',
    })
    domain!: string;

    @ApiProperty({ description: 'ID портала в БД', example: 1, type: Number })
    portalId!: number;

    @ApiProperty({
        description: 'Статусы пресетов',
        type: [RqPresetMonitorRowDto],
    })
    presets!: RqPresetMonitorRowDto[];

    @ApiProperty({ description: 'Статусы полей', type: [RqFieldMonitorRowDto] })
    fields!: RqFieldMonitorRowDto[];
}

/** Ошибка удаления по одному id. */
export class RqDeleteFailedDto {
    @ApiProperty({
        description: 'ID, который не удалось удалить',
        example: 12,
        type: Number,
    })
    id!: number;

    @ApiProperty({ description: 'Текст ошибки', example: 'Access denied' })
    error!: string;
}

/** Результат точечного удаления (пресеты/поля). */
export class RqDeleteResultDto {
    @ApiProperty({
        description: 'Домен портала',
        example: 'example.bitrix24.ru',
    })
    domain!: string;

    @ApiProperty({
        description: 'Успешно удалённые id',
        type: [Number],
        example: [12, 13],
    })
    deleted!: number[];

    @ApiProperty({ description: 'Ошибки по id', type: [RqDeleteFailedDto] })
    failed!: RqDeleteFailedDto[];
}
