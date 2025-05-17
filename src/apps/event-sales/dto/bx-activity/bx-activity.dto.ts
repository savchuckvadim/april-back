import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNumber, IsNotEmpty } from 'class-validator';

export class BxActivityDto {
    @ApiProperty({
        description: 'Domain of the Bitrix24 portal',
        example: 'example.bitrix24.ru'
    })
    @IsString()
    @IsNotEmpty()
    domain: string;

    @ApiProperty({
        description: 'ID of the lead in Bitrix24',
        example: 12345
    })
    @IsNumber()
    @IsNotEmpty()
    leadId: number;
}