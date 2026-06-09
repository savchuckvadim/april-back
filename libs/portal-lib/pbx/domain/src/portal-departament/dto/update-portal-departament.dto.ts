import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';

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
}
