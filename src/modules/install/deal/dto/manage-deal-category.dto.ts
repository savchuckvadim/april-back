import { ApiProperty } from '@nestjs/swagger';
import {
    ArrayMinSize,
    IsArray,
    IsNotEmpty,
    IsString,
} from 'class-validator';
import { MANAGE_DOMAIN_ALL } from '@/modules/install/shared';

const DOMAIN_DESCRIPTION =
    'Домен Bitrix-портала без протокола и завершающего слэша. ' +
    `Передайте "${MANAGE_DOMAIN_ALL}", чтобы выполнить операцию для всех порталов.`;

/** Удалить воронки сделки по списку `code` из портальной БД + Bitrix. */
export class DeleteDealCategoriesDto {
    @ApiProperty({
        description: DOMAIN_DESCRIPTION,
        example: 'example.bitrix24.ru',
        type: String,
    })
    @IsString()
    @IsNotEmpty()
    domain: string;

    @ApiProperty({
        description:
            'Список `code` воронок сделки для удаления (из `btx_categories` и Bitrix CRM). ' +
            'Стадии каждой воронки в Bitrix удаляются перед удалением самой категории.',
        example: ['sales_xo', 'tmc_base'],
        type: [String],
    })
    @IsArray()
    @ArrayMinSize(1)
    @IsString({ each: true })
    codes: string[];
}

/** Удалить одну стадию из конкретной воронки сделки (PortalDB + Bitrix). */
export class DeleteDealCategoryStageDto {
    @ApiProperty({
        description: DOMAIN_DESCRIPTION,
        example: 'example.bitrix24.ru',
        type: String,
    })
    @IsString()
    @IsNotEmpty()
    domain: string;

    @ApiProperty({
        description: '`code` воронки-владельца стадии (например, `sales_xo`).',
        example: 'sales_xo',
        type: String,
    })
    @IsString()
    @IsNotEmpty()
    categoryCode: string;

    @ApiProperty({
        description: '`code` стадии для удаления (например, `cold_new`).',
        example: 'cold_new',
        type: String,
    })
    @IsString()
    @IsNotEmpty()
    stageCode: string;
}

/** Переименовать стадию в портальной БД и Bitrix (`NAME`/`title`). `code` остаётся прежним. */
export class EditDealCategoryStageDto {
    @ApiProperty({
        description: DOMAIN_DESCRIPTION,
        example: 'example.bitrix24.ru',
        type: String,
    })
    @IsString()
    @IsNotEmpty()
    domain: string;

    @ApiProperty({
        description: '`code` воронки-владельца стадии.',
        example: 'sales_xo',
        type: String,
    })
    @IsString()
    @IsNotEmpty()
    categoryCode: string;

    @ApiProperty({
        description:
            '`code` редактируемой стадии. По нему ищется запись в PortalDB; ' +
            'в Bitrix обновление выполняется по фактическому `ID` записи `crm.status`.',
        example: 'cold_new',
        type: String,
    })
    @IsString()
    @IsNotEmpty()
    stageCode: string;

    @ApiProperty({
        description:
            'Новое отображаемое название стадии (`NAME` в Bitrix, `name`/`title` в PortalDB). ' +
            '`code` и `bitrixId` остаются прежними.',
        example: 'Новые',
        type: String,
    })
    @IsString()
    @IsNotEmpty()
    newValue: string;
}
