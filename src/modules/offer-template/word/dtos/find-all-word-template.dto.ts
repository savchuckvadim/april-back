import { IsOptional, IsEnum, IsBoolean, IsString, IsNumberString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { OfferTemplateVisibility } from '../../offer-template/dtos/create-offer-template.dto';

export class WordTemplateQueryDto {
    @ApiProperty({ required: false, enum: OfferTemplateVisibility })
    @IsEnum(OfferTemplateVisibility)
    @IsOptional()
    visibility?: OfferTemplateVisibility;

    @ApiProperty({ required: false })
    @IsNumberString()
    @IsOptional()
    portal_id?: string;

    @ApiProperty({ required: false })
    @IsBoolean()
    @IsOptional()
    is_active?: boolean;

    @ApiProperty({ required: false })
    @IsString()
    @IsOptional()
    search?: string;
}

