import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class StickerOrderDto {
    @ApiProperty({ description: 'The sticker id', example: 1 })
    @IsNumber()
    id: number;

    @ApiProperty({ description: 'The sticker order', example: 1 })
    @IsNumber()
    order: number;
}

export class ReorderStickersDto {
    @ApiProperty({ description: 'The page id', example: 1 })
    @IsNumber()
    page_id: number;

    @ApiProperty({
        description: 'The sticker orders',
        type: [StickerOrderDto]
    })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => StickerOrderDto)
    sticker_orders: StickerOrderDto[];
}
