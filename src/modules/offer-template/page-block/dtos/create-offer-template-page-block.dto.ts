import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsNumber, IsEnum, IsJSON,  } from 'class-validator';

export enum BlockType {
    BACKGROUND = 'background',
    ABOUT = 'about',
    HERO = 'hero',
    LETTER = 'letter',
    DOCUMENT_NUMBER = 'documentNumber',
    MANAGER = 'manager',
    LOGO = 'logo',
    STAMP = 'stamp',
    HEADER = 'header',
    FOOTER = 'footer',
    INFOBLOCKS = 'infoblocks',
    PRICE = 'price',
    SLOGAN = 'slogan',
    INFOBLOCKS_DESCRIPTION = 'infoblocksDescription',
    LT = 'lt',
    OTHER_COMPLECTS = 'otherComplects',
    COMPARISON = 'comparison',
    COMPARISON_COMPLECTS = 'comparisonComplects',
    COMPARISON_IBLOCKS = 'comparisonIblocks',
    USER = 'user',
    DEFAULT = 'default',
}

export class CreateOfferTemplatePageBlockRequestDto {


    @ApiProperty({ description: 'The order of the offer template page block' })
    @IsNumber()
    order: number;

    @ApiProperty({ description: 'The name of the offer template page block' })
    @IsString()
    name: string;

    @ApiProperty({ description: 'The code of the offer template page block' })
    @IsString()
    @IsOptional()
    code?: string;

    @ApiProperty({
        description: 'The type of the offer template page block',
        enum: BlockType,
        enumName: 'BlockType'
    })
    @IsEnum(BlockType)
    @IsOptional()
    type?: BlockType = BlockType.DEFAULT;

    @ApiProperty({ description: 'The content of the offer template page block' })
    @IsJSON()
    @IsOptional()
    content?: string;

    @ApiProperty({ description: 'The settings of the offer template page block' })
    @IsString()
    @IsOptional()
    settings?: string;

    @ApiProperty({ description: 'The stickers of the offer template page block' })
    @IsString()
    @IsOptional()
    stickers?: string;

    @ApiProperty({ description: 'The background of the offer template page block' })
    @IsString()
    @IsOptional()
    background?: string;

    @ApiProperty({ description: 'The colors of the offer template page block' })
    @IsString()
    @IsOptional()
    colors?: string;


}

export class CreateOfferTemplatePageBlockDto extends CreateOfferTemplatePageBlockRequestDto {
    @ApiProperty({ description: 'The offer template page id' })
    @IsNumber()
    offer_template_page_id: number | bigint;

   
    @ApiProperty({ description: 'The image id of the offer template page block' })
    @IsNumber()
    @IsOptional()
    image_id?: number | bigint;
}
