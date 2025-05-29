import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class GetDealsDto {
    @ApiProperty({
        description: 'The domain of the category',
        example: 'example.bitrix24.ru'
    })
    @IsString()
    @IsNotEmpty()
    domain: string;

    @ApiProperty({
        description: 'The id of the category',
        example: 8
    })
    @IsString()
    @IsNotEmpty()
    categoryId: string;


    @ApiProperty({
        description: 'The id of the category',
        example: 'PREPARATION'
    })
    @IsString()
    @IsNotEmpty()
    stageId: string;
}



export class ReplaceDealsDto {
    @ApiProperty({
        description: 'The domain of the category',
        example: 'example.bitrix24.ru'
    })
    @IsString()
    @IsNotEmpty()
    domain: string;

    @ApiProperty({
        description: 'The id of the category from',
        example: 8
    })
    @IsString()
    @IsNotEmpty()
    fromCategoryId: string;


    @ApiProperty({
        description: 'The id of the stage from',
        example: 'PREPARATION'
    })
    @IsString()
    @IsNotEmpty()
    fromStageId: string;


    @ApiProperty({
        description: 'The id of the category to',
        example: 8
    })
    @IsString()
    @IsNotEmpty()
    toCategoryId: string;


    @ApiProperty({
        description: 'The id of the stage to',
        example: 'PREPARATION'
    })
    @IsString()
    @IsNotEmpty()
    toStageId: string;
}
