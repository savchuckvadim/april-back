import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';
import {
    DeleteEntityFieldItemDto,
    DeleteEntityFieldsDto,
    EditEntityFieldItemDto,
} from '../../entity';

/**
 * Manage-DTO для полей smart/RPA. Расширяют entity-DTO двумя дополнительными
 * полями `type` + `group`, по которым резолвер находит конкретную «типизированную»
 * сущность (smart или RPA) в портальной БД.
 *
 * `type` — то же значение, что и в URL-эндпоинте установки (`SmartNameEnum`/`RpaNameEnum`),
 * хранится в `smarts.type` / `btx_rpa.type`.
 */
const TYPE_DESCRIPTION =
    'Тип типизированной сущности (например, `presentation` для смарта или ' +
    'код RPA). Совпадает с тем, что хранится в `smarts.type` / `btx_rpa.type` и ' +
    'используется при первичной установке.';

const GROUP_DESCRIPTION =
    'Группа отдела/приложения, в которой живёт сущность (например, `sales`). ' +
    'Совпадает с `smarts.group` / `btx_rpa.group`.';

export class DeleteTypedEntityFieldsDto extends DeleteEntityFieldsDto {
    @ApiProperty({ description: TYPE_DESCRIPTION, example: 'presentation', type: String })
    @IsString()
    @IsNotEmpty()
    type: string;

    @ApiProperty({ description: GROUP_DESCRIPTION, example: 'sales', type: String })
    @IsString()
    @IsNotEmpty()
    group: string;
}

export class DeleteTypedEntityFieldItemDto extends DeleteEntityFieldItemDto {
    @ApiProperty({ description: TYPE_DESCRIPTION, example: 'presentation', type: String })
    @IsString()
    @IsNotEmpty()
    type: string;

    @ApiProperty({ description: GROUP_DESCRIPTION, example: 'sales', type: String })
    @IsString()
    @IsNotEmpty()
    group: string;
}

export class EditTypedEntityFieldItemDto extends EditEntityFieldItemDto {
    @ApiProperty({ description: TYPE_DESCRIPTION, example: 'presentation', type: String })
    @IsString()
    @IsNotEmpty()
    type: string;

    @ApiProperty({ description: GROUP_DESCRIPTION, example: 'sales', type: String })
    @IsString()
    @IsNotEmpty()
    group: string;
}
