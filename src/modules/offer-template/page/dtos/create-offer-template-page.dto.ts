import { ApiProperty } from '@nestjs/swagger';
import {
    IsString,
    IsOptional,
    IsBoolean,
    IsNumber,
    IsEnum,
    IsArray,
    ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CreateOfferTemplatePageBlockDto, CreateOfferTemplatePageBlockRequestDto } from '../../page-block';
import { CreateOfferTemplatePageStickerDto } from '../../page-sticker';
import { OfferTemplatePage } from '../entities/offer-template-page.entity';

export enum PageType {
    LETTER = 'letter',
    DESCRIPTION = 'description',
    INFOBLOCKS = 'infoblocks',
    PRICE = 'price',
    LT = 'lt',
    OTHER = 'other',
    DEFAULT = 'default',
}
class CreateOfferTemplatePageDto {

    @ApiProperty({ description: 'The offer template id' })
    @IsNumber()
    offer_template_id: number;

    @ApiProperty({ description: 'The order of the offer template page' })
    @IsNumber()
    order: number;

    @ApiProperty({ description: 'The name of the offer template page' })
    @IsString()
    name: string;

    @ApiProperty({ description: 'The code of the offer template page' })
    @IsString()
    @IsOptional()
    code?: string;

    @ApiProperty({
        description: 'The type of the offer template page',
        enum: PageType,
        enumName: 'PageType'
    })
    @IsEnum(PageType)
    @IsOptional()
    type?: PageType = PageType.DEFAULT;

    @ApiProperty({ description: 'Whether the offer template page is active' })
    @IsBoolean()
    @IsOptional()
    is_active?: boolean = true;

    @ApiProperty({ description: 'The settings of the offer template page' })
    @IsString()
    @IsOptional()
    settings?: string;

    @ApiProperty({ description: 'The stickers of the offer template page' })
    @IsString()
    @IsOptional()
    stickers?: string;

    @ApiProperty({ description: 'The background of the offer template page' })
    @IsString()
    @IsOptional()
    background?: string;

    @ApiProperty({ description: 'The colors of the offer template page' })
    @IsString()
    @IsOptional()
    colors?: string;

    @ApiProperty({ description: 'The fonts of the offer template page' })
    @IsString()
    @IsOptional()
    fonts?: string;

    @ApiProperty({ description: 'The stickers of the offer template page', type: [CreateOfferTemplatePageStickerDto] })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => CreateOfferTemplatePageStickerDto)
    @IsOptional()
    stickers_items?: CreateOfferTemplatePageStickerDto[];



}
export class CreateOfferTemplatePageRequestDto extends CreateOfferTemplatePageDto {





    @ApiProperty({ description: 'The blocks of the offer template page', type: [CreateOfferTemplatePageBlockRequestDto] })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => CreateOfferTemplatePageBlockRequestDto)
    @IsOptional()
    blocks?: CreateOfferTemplatePageBlockRequestDto[];



}



export class CreateOfferTemplatePageResponseDto extends OfferTemplatePage {
    @ApiProperty({ description: 'The offer template id' })
    @IsNumber()
    declare offer_template_id: bigint;


    @ApiProperty({ description: 'The blocks of the offer template page', type: [CreateOfferTemplatePageBlockRequestDto] })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => CreateOfferTemplatePageBlockDto)
    @IsOptional()
    blocks?: CreateOfferTemplatePageBlockDto[];



}

