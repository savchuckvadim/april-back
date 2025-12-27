import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsNumber } from 'class-validator';

export class CreateBitrixFieldItemDto {
    @ApiProperty({
        description: 'Item name',
        example: 'item_name',
    })
    @IsString()
    @IsNotEmpty()
    name: string;

    @ApiProperty({
        description: 'Item title',
        example: 'Item Title',
    })
    @IsString()
    @IsNotEmpty()
    title: string;

    @ApiProperty({
        description: 'Item code',
        example: 'item_code',
    })
    @IsString()
    @IsNotEmpty()
    code: string;

    @ApiProperty({
        description: 'Bitrix ID',
        example: 1,
    })
    @IsNumber()
    @IsNotEmpty()
    bitrixId: number;
}

