import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty } from 'class-validator';
import {
    DeleteDealCategoriesDto,
    DeleteDealCategoryStageDto,
    EditDealCategoryStageDto,
} from '@app/pbx-install/deal/dto/manage-deal-category.dto';
import { SmartGroupEnum, SmartNameEnum } from './install-smart.dto';

const SMART_NAME_DESCRIPTION =
    'Имя смарта (то же значение, что в URL установки и в `smarts.type`).';
const SMART_GROUP_DESCRIPTION =
    'Группа отдела, к которой относится смарт (`smarts.group`).';

/**
 * Manage-DTO для воронок смарта. Расширяют deal-DTO двумя полями `smartName` + `group`,
 * по которым резолвер находит конкретный смарт на портале (на портале может быть
 * несколько смартов с разными `(type, group)`).
 */
export class DeleteSmartCategoriesDto extends DeleteDealCategoriesDto {
    @ApiProperty({
        description: SMART_NAME_DESCRIPTION,
        example: SmartNameEnum.PRESENTATION,
        enum: SmartNameEnum,
    })
    @IsEnum(SmartNameEnum)
    @IsNotEmpty()
    smartName: SmartNameEnum;

    @ApiProperty({
        description: SMART_GROUP_DESCRIPTION,
        example: SmartGroupEnum.SALES,
        enum: SmartGroupEnum,
    })
    @IsEnum(SmartGroupEnum)
    @IsNotEmpty()
    group: SmartGroupEnum;
}

export class DeleteSmartCategoryStageDto extends DeleteDealCategoryStageDto {
    @ApiProperty({
        description: SMART_NAME_DESCRIPTION,
        example: SmartNameEnum.PRESENTATION,
        enum: SmartNameEnum,
    })
    @IsEnum(SmartNameEnum)
    @IsNotEmpty()
    smartName: SmartNameEnum;

    @ApiProperty({
        description: SMART_GROUP_DESCRIPTION,
        example: SmartGroupEnum.SALES,
        enum: SmartGroupEnum,
    })
    @IsEnum(SmartGroupEnum)
    @IsNotEmpty()
    group: SmartGroupEnum;
}

export class EditSmartCategoryStageDto extends EditDealCategoryStageDto {
    @ApiProperty({
        description: SMART_NAME_DESCRIPTION,
        example: SmartNameEnum.PRESENTATION,
        enum: SmartNameEnum,
    })
    @IsEnum(SmartNameEnum)
    @IsNotEmpty()
    smartName: SmartNameEnum;

    @ApiProperty({
        description: SMART_GROUP_DESCRIPTION,
        example: SmartGroupEnum.SALES,
        enum: SmartGroupEnum,
    })
    @IsEnum(SmartGroupEnum)
    @IsNotEmpty()
    group: SmartGroupEnum;
}
