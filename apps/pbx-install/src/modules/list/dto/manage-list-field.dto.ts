import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsString } from 'class-validator';
import {
    DeleteEntityFieldItemDto,
    DeleteEntityFieldsDto,
    EditEntityFieldItemDto,
} from '@app/pbx-install/shared';
import { ListGroupEnum } from '../type/parse.type';
import {
    LIST_GROUP_DESCRIPTION,
    LIST_TYPE_DESCRIPTION,
} from './install-list-field.dto';

/**
 * Manage-DTO для полей списков. Расширяют общие entity-DTO двумя полями
 * `type` + `group`, по которым резолвер находит конкретный список на портале
 * (на портале может быть несколько списков с разными `(type, group)`).
 */
export class DeleteListFieldsDto extends DeleteEntityFieldsDto {
    @ApiProperty({
        description: LIST_TYPE_DESCRIPTION,
        example: 'kpi',
        type: String,
    })
    @IsString()
    @IsNotEmpty()
    type!: string;

    @ApiProperty({
        description: LIST_GROUP_DESCRIPTION,
        example: ListGroupEnum.SALES,
        enum: ListGroupEnum,
    })
    @IsEnum(ListGroupEnum)
    group!: ListGroupEnum;
}

export class DeleteListFieldItemDto extends DeleteEntityFieldItemDto {
    @ApiProperty({
        description: LIST_TYPE_DESCRIPTION,
        example: 'kpi',
        type: String,
    })
    @IsString()
    @IsNotEmpty()
    type!: string;

    @ApiProperty({
        description: LIST_GROUP_DESCRIPTION,
        example: ListGroupEnum.SALES,
        enum: ListGroupEnum,
    })
    @IsEnum(ListGroupEnum)
    group!: ListGroupEnum;
}

export class EditListFieldItemDto extends EditEntityFieldItemDto {
    @ApiProperty({
        description: LIST_TYPE_DESCRIPTION,
        example: 'kpi',
        type: String,
    })
    @IsString()
    @IsNotEmpty()
    type!: string;

    @ApiProperty({
        description: LIST_GROUP_DESCRIPTION,
        example: ListGroupEnum.SALES,
        enum: ListGroupEnum,
    })
    @IsEnum(ListGroupEnum)
    group!: ListGroupEnum;
}
