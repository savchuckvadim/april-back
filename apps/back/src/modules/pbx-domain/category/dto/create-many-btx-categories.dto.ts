import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, ArrayMinSize, ValidateNested } from 'class-validator';
import { CreateBtxCategoryDto } from './create-btx-category.dto';

export class CreateManyBtxCategoriesDto {
    @ApiProperty({
        description: 'Categories to create (each may include optional stages)',
        type: [CreateBtxCategoryDto],
    })
    @IsArray()
    @ArrayMinSize(1)
    @ValidateNested({ each: true })
    @Type(() => CreateBtxCategoryDto)
    categories: CreateBtxCategoryDto[];
}
