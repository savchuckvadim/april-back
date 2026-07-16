import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    IsBoolean,
    IsEnum,
    IsInt,
    IsNotEmpty,
    IsOptional,
    IsString,
    Min,
    ValidateIf,
} from 'class-validator';
import {
    DEPARTAMENT_MULTIPLE_TAGS,
    EDepartamentGroup,
} from '../entity/portal-departament.entity';

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

    @ApiPropertyOptional({
        description:
            'Собирать ли ЦУП из разрозненных по всей структуре отделов. ' +
            'Если true — отделы ищутся по тэгу `multipleTag`.',
        example: false,
        type: Boolean,
        default: false,
    })
    @IsOptional()
    @IsBoolean()
    isMultiple?: boolean;

    @ApiPropertyOptional({
        description:
            'По какому тэгу искать разрозненные отделы: ' +
            `известные значения — ${DEPARTAMENT_MULTIPLE_TAGS.join(' / ')}, ` +
            'допускается произвольный custom-тэг. null — тэг не задан.',
        example: DEPARTAMENT_MULTIPLE_TAGS[0],
        type: String,
        nullable: true,
    })
    @IsOptional()
    @ValidateIf((_, value) => value !== null)
    @IsString()
    @IsNotEmpty()
    multipleTag?: string | null;
}
