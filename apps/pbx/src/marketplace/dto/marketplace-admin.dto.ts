import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString } from 'class-validator';

export class RefreshPlacementsDto {
    @ApiPropertyOptional({
        description:
            'member_id портала (приоритетный способ адресации; постоянен, не зависит от домена)',
        example: 'a223c6b3710f85df22e9377d6c4f7553',
        type: String,
    })
    @IsOptional()
    @IsString()
    memberId?: string;

    @ApiPropertyOptional({
        description: 'Домен портала (fallback, если member_id неизвестен)',
        example: 'example.bitrix24.ru',
        type: String,
    })
    @IsOptional()
    @IsString()
    domain?: string;
}

export class PlacementSyncResultDto {
    @ApiProperty({
        description: 'Сколько привязок добавлено (placement.bind)',
        example: 1,
        type: Number,
    })
    @IsInt()
    bound: number;

    @ApiProperty({
        description: 'Сколько привязок снято (placement.unbind)',
        example: 0,
        type: Number,
    })
    @IsInt()
    unbound: number;

    @ApiProperty({
        description: 'Сколько операций завершилось ошибкой',
        example: 0,
        type: Number,
    })
    @IsInt()
    errors: number;

    @ApiProperty({
        description: 'Всего целевых привязок в эталоне (виджет × место)',
        example: 4,
        type: Number,
    })
    @IsInt()
    total: number;
}
