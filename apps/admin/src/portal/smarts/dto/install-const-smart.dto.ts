import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

/** Generic-установка const-смарта по ключу из реестра. */
export class InstallConstSmartDto {
    @ApiProperty({
        description: 'Ключ const-смарта из GET registry (например aicall).',
        example: 'aicall',
        type: String,
    })
    @IsString()
    @IsNotEmpty()
    kind: string;

    @ApiProperty({
        description: 'Домен портала Bitrix24, на который ставится смарт.',
        example: 'gsr.bitrix24.ru',
        type: String,
    })
    @IsString()
    @IsNotEmpty()
    domain: string;
}
