import {
    IsString,
    IsOptional,
    IsBoolean,
    IsNumber,
    IsEnum,
    ValidateNested,
    IsArray,

} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

import { OfferTemplateVisibility } from './create-offer-template.dto';
import { OfferTemplate, OfferTemplateSummary } from '../entities/offer-template.entity';
import { OfferTemplatePageDto } from '../../page';
import { Type } from 'class-transformer';
import { OfferTemplateFontDto } from '../../font';

export class OfferTemplateSummaryDto extends OfferTemplateSummary {
    @ApiProperty({ description: 'The id of the offer template' })
    @IsNumber()
    declare id: string;

    @ApiProperty({ description: 'The portal id of the offer template' })
    @IsString()
    @IsOptional()
    portal_id?: string;

    @ApiProperty({ description: 'The is active of the offer template' })
    @IsBoolean()
    declare is_active: boolean;

    @ApiProperty({ description: 'The search of the offer template' })
    @IsString()
    @IsOptional()
    search?: string;

    @ApiProperty({ description: 'The visibility of the offer template' })
    @IsEnum(OfferTemplateVisibility)
    declare visibility: OfferTemplateVisibility;


    @ApiProperty({ description: 'The is default of the offer template' })
    @IsBoolean()
    declare is_default: boolean;

    @ApiProperty({ description: 'The type of the offer template' })
    @IsString()
    declare type: string;

    @ApiProperty({ description: 'The style of the offer template' })
    @IsString()
    declare style: string;

    @ApiProperty({ description: 'The color of the offer template' })
    @IsString()
    declare color: string;

    @ApiProperty({ description: 'The code of the offer template' })
    @IsString()
    declare code: string;

    @ApiProperty({ description: 'The counter of the offer template' })
    @IsNumber()
    declare counter: number;

    @ApiProperty({ description: 'The pages of the offer template', type: [OfferTemplatePageDto] })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => OfferTemplatePageDto)
    pages: OfferTemplatePageDto[];
}


export class OfferTemplateDto extends OfferTemplate {
    @ApiProperty({ description: 'The id of the offer template' })
    @IsString()

    declare id: string;

    @ApiProperty({ description: 'The pages of the offer template', type: [OfferTemplatePageDto] })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => OfferTemplatePageDto)
    pages: OfferTemplatePageDto[];

    @ApiProperty({ description: 'The fonts of the offer template', type: [OfferTemplateFontDto] })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => OfferTemplateFontDto)
    fonts: OfferTemplateFontDto[];

    @ApiProperty({ description: 'The portal id of the offer template' })
    @IsString()
    @IsOptional()
    portal_id?: string;

    @ApiProperty({ description: 'The is active of the offer template' })
    @IsBoolean()
    declare is_active: boolean;

    @ApiProperty({ description: 'The search of the offer template' })
    @IsString()
    @IsOptional()
    search?: string;

    @ApiProperty({ description: 'The visibility of the offer template' })
    @IsEnum(OfferTemplateVisibility)
    declare visibility: OfferTemplateVisibility;

    @ApiProperty({ description: 'The is default of the offer template' })
    @IsBoolean()
    declare is_default: boolean;

    @ApiProperty({ description: 'The type of the offer template' })
    @IsString()
    declare type: string;

    @ApiProperty({ description: 'The style of the offer template' })
    @IsString()
    declare style: string;

    @ApiProperty({ description: 'The color of the offer template' })
    @IsString()
    declare color: string;

    @ApiProperty({ description: 'The code of the offer template' })
    @IsString()
    declare code: string;

    @ApiProperty({ description: 'The counter of the offer template' })
    @IsNumber()
    declare counter: number;

    @ApiProperty({ description: 'The tags of the offer template' })
    @IsString()
    declare tags: string;

    @ApiProperty({ description: 'The sale text 1 of the offer template' })
    @IsString()
    declare sale_text_1: string;

    @ApiProperty({ description: 'The sale text 2 of the offer template' })
    @IsString()
    declare sale_text_2: string;
}
