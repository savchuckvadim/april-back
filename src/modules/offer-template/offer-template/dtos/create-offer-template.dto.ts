import {
    IsString,
    IsOptional,
    IsBoolean,
    IsNumber,
    IsEnum,
    IsArray,
    ValidateNested,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { CreateOfferTemplatePageRequestDto, CreateOfferTemplatePageResponseDto } from '../../page';
import { Type } from 'class-transformer';
import { CreateOfferTemplateFontDto } from '../../font';
import { OfferTemplate } from '../entities/offer-template.entity';

export enum OfferTemplateVisibility {
    PUBLIC = 'public',
    PRIVATE = 'private',
    USER = 'user',
}

export class CreateOfferTemplateResponseDto implements OfferTemplate {

    constructor(partial: Partial<CreateOfferTemplateResponseDto>) {
        Object.assign(this, partial);
    }



    @ApiProperty({ description: 'The name of the offer template' })
    @IsString()
    domain: string;

    @ApiProperty({ description: 'The name of the offer template' })
    @IsString()
    name: string;

    @ApiProperty({
        description: 'The visibility of the offer template',
        enum: OfferTemplateVisibility,
        enumName: 'OfferTemplateVisibility'
    })
    @IsEnum(OfferTemplateVisibility)
    @IsOptional()
    visibility: OfferTemplateVisibility = OfferTemplateVisibility.PRIVATE;

    @ApiProperty({ description: 'Whether the offer template is default' })
    @IsBoolean()
    @IsOptional()
    is_default: boolean = false;

    @ApiProperty({ description: 'The file path of the offer template' })
    @IsString()
    file_path: string;

    @ApiProperty({ description: 'The demo path of the offer template' })
    @IsString()
    @IsOptional()
    demo_path?: string;

    @ApiProperty({ description: 'The type of the offer template' })
    @IsString()
    @IsOptional()
    type: string = 'single'; // pdf or word

    @IsString()
    @IsOptional()
    rules?: string;

    @ApiProperty({ description: 'The rules of the offer template' })
    @ApiProperty({ description: 'The price settings of the offer template' })
    @IsString()
    @IsOptional()
    price_settings?: string;

    @ApiProperty({ description: 'The infoblock settings of the offer template' })
    @IsString()
    @IsOptional()
    infoblock_settings?: string;

    @ApiProperty({ description: 'The letter text of the offer template' })
    @IsString()
    @IsOptional()
    letter_text?: string;

    @ApiProperty({ description: 'The sale text 1 of the offer template' })
    @IsString()
    @IsOptional()
    sale_text_1?: string;

    @ApiProperty({ description: 'The sale text 2 of the offer template' })
    @IsString()
    @IsOptional()
    sale_text_2?: string;

    @ApiProperty({ description: 'The sale text 3 of the offer template' })
    @IsString()
    @IsOptional()
    sale_text_3?: string;

    @ApiProperty({ description: 'The sale text 4 of the offer template' })
    @IsString()
    @IsOptional()
    sale_text_4?: string;

    @ApiProperty({ description: 'The sale text 5 of the offer template' })
    @IsString()
    @IsOptional()
    sale_text_5?: string;

    @ApiProperty({ description: 'The field codes of the offer template' })
    @IsString()
    @IsOptional()
    field_codes?: string;

    @ApiProperty({ description: 'The style of the offer template' })
    @IsString()
    @IsOptional()
    style?: string;

    @ApiProperty({ description: 'The color of the offer template' })
    @IsString()
    @IsOptional()
    color?: string;

    @ApiProperty({ description: 'The code of the offer template' })
    @IsString()
    code: string;

    @ApiProperty({ description: 'The tags of the offer template' })
    @IsString()
    @IsOptional()
    tags?: string;

    @ApiProperty({ description: 'Whether the offer template is active' })
    @IsBoolean()
    @IsOptional()
    is_active: boolean = false;

    @ApiProperty({ description: 'The counter of the offer template' })
    @IsNumber()
    @IsOptional()
    counter: number = 0;

    @ApiProperty({ description: 'The pages of the offer template', type: [CreateOfferTemplatePageRequestDto] })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => CreateOfferTemplatePageResponseDto)
    @IsOptional()
    pages?: CreateOfferTemplatePageResponseDto[];

    @ApiProperty({ description: 'The fonts of the offer template', type: [CreateOfferTemplateFontDto] })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => CreateOfferTemplateFontDto)
    @IsOptional()
    fonts?: CreateOfferTemplateFontDto[];
}

export class CreateOfferTemplateRequestDto {



    @ApiProperty({ description: 'The name of the offer template' })
    @IsString()
    domain: string;

    @ApiProperty({ description: 'The name of the offer template' })
    @IsString()
    name: string;

    @ApiProperty({
        description: 'The visibility of the offer template',
        enum: OfferTemplateVisibility,
        enumName: 'OfferTemplateVisibility'
    })
    @IsEnum(OfferTemplateVisibility)
    @IsOptional()
    visibility?: OfferTemplateVisibility = OfferTemplateVisibility.PRIVATE;

    @ApiProperty({ description: 'Whether the offer template is default' })
    @IsBoolean()
    @IsOptional()
    is_default?: boolean = false;

    @ApiProperty({ description: 'The file path of the offer template' })
    @IsString()
    file_path: string;

    @ApiProperty({ description: 'The demo path of the offer template' })
    @IsString()
    @IsOptional()
    demo_path?: string;

    @ApiProperty({ description: 'The type of the offer template' })
    @IsString()
    @IsOptional()
    type?: string = 'single';

    @IsString()
    @IsOptional()
    rules?: string;

    @ApiProperty({ description: 'The rules of the offer template' })
    @ApiProperty({ description: 'The price settings of the offer template' })
    @IsString()
    @IsOptional()
    price_settings?: string;

    @ApiProperty({ description: 'The infoblock settings of the offer template' })
    @IsString()
    @IsOptional()
    infoblock_settings?: string;

    @ApiProperty({ description: 'The letter text of the offer template' })
    @IsString()
    @IsOptional()
    letter_text?: string;

    @ApiProperty({ description: 'The sale text 1 of the offer template' })
    @IsString()
    @IsOptional()
    sale_text_1?: string;

    @ApiProperty({ description: 'The sale text 2 of the offer template' })
    @IsString()
    @IsOptional()
    sale_text_2?: string;

    @ApiProperty({ description: 'The sale text 3 of the offer template' })
    @IsString()
    @IsOptional()
    sale_text_3?: string;

    @ApiProperty({ description: 'The sale text 4 of the offer template' })
    @IsString()
    @IsOptional()
    sale_text_4?: string;

    @ApiProperty({ description: 'The sale text 5 of the offer template' })
    @IsString()
    @IsOptional()
    sale_text_5?: string;

    @ApiProperty({ description: 'The field codes of the offer template' })
    @IsString()
    @IsOptional()
    field_codes?: string;

    @ApiProperty({ description: 'The style of the offer template' })
    @IsString()
    @IsOptional()
    style?: string;

    @ApiProperty({ description: 'The color of the offer template' })
    @IsString()
    @IsOptional()
    color?: string;

    @ApiProperty({ description: 'The code of the offer template' })
    @IsString()
    code: string;

    @ApiProperty({ description: 'The tags of the offer template' })
    @IsString()
    @IsOptional()
    tags?: string;

    @ApiProperty({ description: 'Whether the offer template is active' })
    @IsBoolean()
    @IsOptional()
    is_active?: boolean = false;

    @ApiProperty({ description: 'The counter of the offer template' })
    @IsNumber()
    @IsOptional()
    counter?: number = 0;

    @ApiProperty({ description: 'The pages of the offer template', type: [CreateOfferTemplatePageRequestDto] })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => CreateOfferTemplatePageRequestDto)
    @IsOptional()
    pages?: CreateOfferTemplatePageRequestDto[];

    @ApiProperty({ description: 'The fonts of the offer template', type: [CreateOfferTemplateFontDto] })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => CreateOfferTemplateFontDto)
    @IsOptional()
    fonts?: CreateOfferTemplateFontDto[];
}
