import { ApiPropertyOptional } from '@nestjs/swagger';
import {
    IsBoolean,
    IsInt,
    IsNotEmpty,
    IsOptional,
    IsString,
    Min,
    ValidateIf,
} from 'class-validator';
import { DEPARTAMENT_MULTIPLE_TAGS } from '../entity/portal-departament.entity';

/**
 * Данные для обновления отдела (`departaments`).
 * type/group/portalId менять нельзя — они образуют уникальный ключ.
 */
export class UpdatePortalDepartamentDto {
    @ApiPropertyOptional({
        description: 'Системное имя отдела',
        example: 'Отдел продаж',
        type: String,
    })
    @IsOptional()
    @IsString()
    name?: string;

    @ApiPropertyOptional({
        description: 'Заголовок отдела',
        example: 'Отдел продаж',
        type: String,
    })
    @IsOptional()
    @IsString()
    title?: string;

    @ApiPropertyOptional({
        description: 'ID существующего отдела в Bitrix (department ID)',
        example: 5,
        type: Number,
    })
    @IsOptional()
    @IsInt()
    @Min(1)
    bitrixId?: number;

    @ApiPropertyOptional({
        description:
            'Собирать ли ЦУП из разрозненных по всей структуре отделов. ' +
            'Если true — отделы ищутся по тэгу `multipleTag`.',
        example: true,
        type: Boolean,
    })
    @IsOptional()
    @IsBoolean()
    isMultiple?: boolean;

    @ApiPropertyOptional({
        description:
            'По какому тэгу искать разрозненные отделы: ' +
            `известные значения — ${DEPARTAMENT_MULTIPLE_TAGS.join(' / ')}, ` +
            'допускается произвольный custom-тэг. ' +
            'Передайте null, чтобы сбросить тэг.',
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
