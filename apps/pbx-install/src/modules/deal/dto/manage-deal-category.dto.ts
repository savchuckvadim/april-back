import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    ArrayMinSize,
    IsArray,
    IsBoolean,
    IsEnum,
    IsIn,
    IsNotEmpty,
    IsOptional,
    IsString,
} from 'class-validator';
import { MANAGE_DOMAIN_ALL } from '@app/pbx-install/shared';
import { PbxEntityGroupEnum } from '@app/pbx-install/shared/entity/field/parse-entity-field.service';
import { ParseCategoryNameEnum } from '../services/categories/parse-category.service';

const DOMAIN_DESCRIPTION =
    'Домен Bitrix-портала без протокола и завершающего слэша. ' +
    `Передайте "${MANAGE_DOMAIN_ALL}", чтобы выполнить операцию для всех порталов.`;

/**
 * Коды воронок, доступных для поштучной синхронизации стадии.
 *
 * Это `ParseCategoryNameEnum` БЕЗ `all`: «синхронизировать одну стадию во
 * всех воронках сразу» смысла не имеет — стадия принадлежит одной воронке.
 */
export const SYNC_CATEGORY_CODES = Object.values(
    ParseCategoryNameEnum,
) as readonly ParseCategoryNameEnum[];

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

/**
 * Синхронизировать ОДНУ стадию воронки сделки из Excel-шаблона.
 *
 * В отличие от установки всей воронки, операция ничего не удаляет: стадия
 * либо заводится, либо обновляется, а прочие стадии остаются на месте.
 */
export class SyncDealCategoryStageDto {
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
            'Группа шаблона — определяет Excel-файл, из которого читается ' +
            'строка стадии (`install/{group}/deal/data.xlsx`).',
        enum: PbxEntityGroupEnum,
        example: PbxEntityGroupEnum.SALES,
    })
    @IsEnum(PbxEntityGroupEnum)
    group: PbxEntityGroupEnum;

    @ApiProperty({
        description:
            '`code` воронки-владельца стадии. Воронка обязана уже существовать ' +
            'на портале: поштучная синхронизация стадии её не создаёт.',
        type: String,
        enum: SYNC_CATEGORY_CODES,
        example: ParseCategoryNameEnum.sales_base,
    })
    @IsString()
    @IsIn(SYNC_CATEGORY_CODES as unknown as string[])
    categoryCode: ParseCategoryNameEnum;

    @ApiProperty({
        description:
            '`code` стадии из шаблона. Все атрибуты (название, цвет, `bitrixId`, ' +
            'семантика, порядок) берутся из строки шаблона, а не из запроса — ' +
            'чтобы портал и шаблон не разъезжались.',
        example: 'sales_not_ca',
        type: String,
    })
    @IsString()
    @IsNotEmpty()
    stageCode: string;

    @ApiPropertyOptional({
        description:
            'Пересчитать SORT остальных стадий воронки по шаблону. ' +
            'Включено по умолчанию: стадия, вставленная в СЕРЕДИНУ лестницы, ' +
            'иначе встанет в Bitrix последней — у соседей остаются старые SORT. ' +
            'Правится только порядок: названия, цвета и семантика соседних ' +
            'стадий не трогаются. Передайте `false`, если порядок в воронке ' +
            'настроен руками и его нельзя перетряхивать.',
        type: Boolean,
        default: true,
        example: true,
    })
    @IsOptional()
    @IsBoolean()
    reorder?: boolean;
}
