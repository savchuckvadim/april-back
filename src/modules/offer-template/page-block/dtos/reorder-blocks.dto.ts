import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class BlockOrderDto {
    @ApiProperty({ description: 'The block id', example: 1 })
    @IsNumber()
    id: number;

    @ApiProperty({ description: 'The block order', example: 1 })
    @IsNumber()
    order: number;
}

export class ReorderBlocksDto {
    @ApiProperty({ description: 'The page id', example: 1 })
    @IsNumber()
    page_id: number;

    @ApiProperty({
        description: 'The block orders',
        type: [BlockOrderDto]
    })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => BlockOrderDto)
    block_orders: BlockOrderDto[];
}
