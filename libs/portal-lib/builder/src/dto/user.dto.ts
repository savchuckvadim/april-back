import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
    IsArray,
    IsNumber,
    IsOptional,
    IsString,
    ValidateNested,
} from 'class-validator';
import { UserModel } from '../mappers/pbx-entity.mapper';
import { FieldDto } from './field.dto';

/**
 * Пользовательская модель BtxUser, как её отдавал Laravel BtxUserResource.
 * В таблице btx_users нет колонок name/title — Laravel отдавал их как null.
 */
export class UserDto implements UserModel {
    @ApiProperty({
        description: 'ID записи в нашей БД',
        example: 1,
        type: Number,
    })
    @IsNumber()
    id!: number;

    @ApiProperty({
        description: 'ID портала в нашей БД',
        example: 1,
        type: Number,
    })
    @IsNumber()
    portal_id!: number;

    @ApiProperty({
        description: 'Код сущности для ассоциаций',
        example: 'user',
        type: String,
    })
    @IsString()
    code!: string;

    @ApiProperty({
        description: 'Системное имя (в БД отсутствует — всегда null)',
        example: null,
        type: String,
        nullable: true,
    })
    @IsOptional()
    @IsString()
    name!: string | null;

    @ApiProperty({
        description: 'Отображаемое название (в БД отсутствует — всегда null)',
        example: null,
        type: String,
        nullable: true,
    })
    @IsOptional()
    @IsString()
    title!: string | null;

    @ApiProperty({ description: 'Пользовательские поля', type: [FieldDto] })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => FieldDto)
    bitrixfields!: FieldDto[];
}
