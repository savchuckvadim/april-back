import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class PageOrderDto {
    @ApiProperty({ description: 'The page id', example: 1 })
    @IsNumber()
    id: number;

    @ApiProperty({ description: 'The page order', example: 1 })
    @IsNumber()
    order: number;
}

export class ReorderPagesDto {
    @ApiProperty({ description: 'The template id', example: 1 })
    @IsNumber()
    template_id: number;

    @ApiProperty({
        description: 'The page orders',
        type: [PageOrderDto]
    })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => PageOrderDto)
    page_orders: PageOrderDto[];
}
