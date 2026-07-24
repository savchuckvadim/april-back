import { ApiProperty } from '@nestjs/swagger';
import {
    IsArray,
    IsEnum,
    IsInt,
    IsOptional,
    IsString,
    Min,
} from 'class-validator';
import { EClients } from './bx-department.dto';

export class BxDepartmentCacheResetRequestDto {
    @ApiProperty({
        enum: EClients,
        description:
            'Домен портала Битрикс24, чей кэш отделов и команд нужно сбросить. ' +
            'Если не указан — кэш сбрасывается по всем порталам сразу.',
        example: EClients.dev,
        required: false,
    })
    @IsOptional()
    @IsEnum(EClients)
    domain?: EClients;
}

export class BxDepartmentCacheResetResponseDto {
    @ApiProperty({
        description: 'Сколько ключей кэша удалено из Redis.',
        type: Number,
        example: 6,
    })
    @IsInt()
    @Min(0)
    deletedCount: number;

    @ApiProperty({
        description:
            'Паттерны ключей, по которым выполнялся поиск (SCAN MATCH).',
        type: [String],
        example: [
            'department_structure_v2_april-garant.bitrix24.ru_*',
            'department_april-garant.bitrix24.ru_*',
            'bx_team_april-garant.bitrix24.ru_*',
        ],
    })
    @IsArray()
    @IsString({ each: true })
    patterns: string[];
}
