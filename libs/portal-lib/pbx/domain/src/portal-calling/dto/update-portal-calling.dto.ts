import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';

/**
 * Данные для обновления группы звонков (`callings`).
 * type/group/portalId менять нельзя — они образуют уникальный ключ.
 */
export class UpdatePortalCallingDto {
    @ApiPropertyOptional({
        description: 'Системное имя группы звонков в Bitrix',
        example: 'ОП Звонки',
        type: String,
    })
    @IsOptional()
    @IsString()
    name?: string;

    @ApiPropertyOptional({
        description: 'Заголовок группы звонков',
        example: 'ОП Звонки',
        type: String,
    })
    @IsOptional()
    @IsString()
    title?: string;

    @ApiPropertyOptional({
        description: 'ID рабочей группы в Bitrix (sonet_group ID)',
        example: 42,
        type: Number,
    })
    @IsOptional()
    @IsInt()
    @Min(1)
    bitrixId?: number;
}
