import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PbxFieldEntityDto } from '@lib/portal-lib/pbx-domain';
import { InstallEntityFieldDto } from '../../shared';
import { BxUserFieldDto } from './pbx-user-bitrix.dto';

/**
 * Статус поля в трёх слоях pbx (шаблон-константа / PortalDB / живой Bitrix).
 * Runtime-массив используется и для Swagger (`enum`), и как источник union-типа.
 */
export const PBX_FIELD_SYNC_STATUS_VALUES = [
    'synced',
    'missing_in_db',
    'missing_in_bitrix',
    'only_template',
] as const;
export type PbxFieldSyncStatus = (typeof PBX_FIELD_SYNC_STATUS_VALUES)[number];

export class PbxUserMergedFieldDto {
    @ApiProperty({
        description:
            'Полное имя поля в Bitrix (UF_USR_*) — общий ключ склейки трёх слоёв.',
        example: 'UF_USR_EVENT_COMMENT',
        type: String,
    })
    name!: string;

    @ApiPropertyOptional({
        description:
            'Шаблон поля из констант (USER_FIELDS). null — нет в шаблоне.',
        type: InstallEntityFieldDto,
        nullable: true,
    })
    template!: InstallEntityFieldDto | null;

    @ApiPropertyOptional({
        description: 'Запись поля в PortalDB. null — нет в БД.',
        type: PbxFieldEntityDto,
        nullable: true,
    })
    db!: PbxFieldEntityDto | null;

    @ApiPropertyOptional({
        description: 'Живое поле из Bitrix. null — нет в Bitrix.',
        type: BxUserFieldDto,
        nullable: true,
    })
    bx!: BxUserFieldDto | null;

    @ApiProperty({
        description:
            'Статус согласованности слоёв: synced — есть в БД и Bitrix; ' +
            'missing_in_db — есть в Bitrix, нет в БД; missing_in_bitrix — есть ' +
            'в БД, нет в Bitrix; only_template — есть только в шаблоне.',
        example: 'synced',
        enum: PBX_FIELD_SYNC_STATUS_VALUES,
    })
    status!: PbxFieldSyncStatus;
}

export class PbxUserMonitoringSummaryDto {
    @ApiProperty({
        description: 'Всего строк склейки.',
        example: 1,
        type: Number,
    })
    total!: number;

    @ApiProperty({
        description: 'Поля, синхронные в БД и Bitrix.',
        example: 1,
        type: Number,
    })
    synced!: number;

    @ApiProperty({
        description: 'Поля, которых нет в PortalDB (есть в Bitrix).',
        example: 0,
        type: Number,
    })
    missingInDb!: number;

    @ApiProperty({
        description: 'Поля, которых нет в Bitrix (есть в PortalDB).',
        example: 0,
        type: Number,
    })
    missingInBitrix!: number;

    @ApiProperty({
        description: 'Поля только из шаблона (нигде не установлены).',
        example: 0,
        type: Number,
    })
    onlyTemplate!: number;
}

export class PbxUserMonitoringResultDto {
    @ApiProperty({
        description: 'Домен портала.',
        example: 'april-dev.bitrix24.ru',
        type: String,
    })
    domain!: string;

    @ApiProperty({
        description: 'Идентификатор портала в PortalDB.',
        example: 1,
        type: Number,
    })
    portalId!: number;

    @ApiPropertyOptional({
        description:
            'Идентификатор пользователя (BtxUser) в PortalDB. null — записи нет.',
        example: 42,
        type: Number,
        nullable: true,
    })
    userId!: number | null;

    @ApiProperty({ type: PbxUserMonitoringSummaryDto })
    summary!: PbxUserMonitoringSummaryDto;

    @ApiProperty({
        description: 'Склейка по полям шаблона и установленным полям.',
        type: [PbxUserMergedFieldDto],
    })
    mergedFields!: PbxUserMergedFieldDto[];

    @ApiProperty({
        description:
            'Поля PortalDB без пары в шаблоне (потенциальные orphan-ы).',
        type: [PbxFieldEntityDto],
    })
    dbFieldsWithoutMerged!: PbxFieldEntityDto[];

    @ApiProperty({
        description: 'Живые UF_USR_-поля Bitrix без пары в шаблоне.',
        type: [BxUserFieldDto],
    })
    bitrixFieldsWithoutMerged!: BxUserFieldDto[];
}

export class PbxUserMonitoringPortalErrorDto {
    @ApiProperty({ description: 'Домен портала.', type: String })
    domain!: string;

    @ApiProperty({
        description: 'Текст ошибки получения данных по порталу.',
        type: String,
    })
    error!: string;
}

export class PbxUserMonitoringAllResponseDto {
    @ApiProperty({
        description: 'Результаты по каждому доступному порталу.',
        type: [PbxUserMonitoringResultDto],
    })
    perPortal!: PbxUserMonitoringResultDto[];

    @ApiProperty({
        description: 'Порталы, по которым данные получить не удалось.',
        type: [PbxUserMonitoringPortalErrorDto],
    })
    errors!: PbxUserMonitoringPortalErrorDto[];
}
