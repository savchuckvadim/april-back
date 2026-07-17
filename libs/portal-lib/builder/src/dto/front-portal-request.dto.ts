import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

/** Запрос модели портала для фронта. */
export class FrontPortalRequestDto {
    @ApiProperty({
        description: 'Домен портала Битрикс24',
        example: 'mycompany.bitrix24.ru',
        type: String,
    })
    @IsString()
    @IsNotEmpty()
    domain!: string;
}
