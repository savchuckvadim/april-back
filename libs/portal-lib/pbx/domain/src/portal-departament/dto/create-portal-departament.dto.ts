import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsInt, IsNotEmpty, IsString, Min } from 'class-validator';
import { EDepartamentGroup } from '../entity/portal-departament.entity';

/**
 * Данные для создания отдела (`departaments`).
 * Уникальность строки — по сочетанию type + group + portalId.
 */
export class CreatePortalDepartamentDto {
    @ApiProperty({
        description: 'ID портала в нашей БД',
        example: 1,
        type: Number,
    })
    @IsInt()
    @Min(1)
    portalId!: number;

    @ApiProperty({
        description: 'Группа отдела: ОП (sales) / ОС (service)',
        enum: EDepartamentGroup,
        example: EDepartamentGroup.sales,
    })
    @IsEnum(EDepartamentGroup)
    group!: EDepartamentGroup;

    @ApiProperty({
        description: 'Системное имя отдела',
        example: 'Отдел продаж',
        type: String,
    })
    @IsString()
    @IsNotEmpty()
    name!: string;

    @ApiProperty({
        description: 'Заголовок отдела',
        example: 'Отдел продаж',
        type: String,
    })
    @IsString()
    @IsNotEmpty()
    title!: string;

    @ApiProperty({
        description: 'ID существующего отдела в Bitrix (department ID)',
        example: 5,
        type: Number,
    })
    @IsInt()
    @Min(1)
    bitrixId!: number;
}
