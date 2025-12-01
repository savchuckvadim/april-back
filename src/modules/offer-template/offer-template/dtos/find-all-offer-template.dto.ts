import {
    IsString,
    IsOptional,
    IsBoolean,
    IsEnum,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OfferTemplateVisibility } from './create-offer-template.dto';




export class OfferTemplateQueryDto {




    @ApiPropertyOptional({
        description: 'The visibility of the offer template',
        enum: OfferTemplateVisibility,
        enumName: 'OfferTemplateVisibility',
        required: false,  // 👈 обязательно!
    })
    @IsEnum(OfferTemplateVisibility)
    @IsOptional()
    visibility?: OfferTemplateVisibility = OfferTemplateVisibility.USER;


    @ApiPropertyOptional({
        description: 'The portal id of the offer template',
        required: false,
        type: String,
    })
    @IsString()
    @IsOptional()
    portal_id?: string;

    @ApiPropertyOptional({
        description: 'The is active of the offer template',
        required: false,
        type: Boolean,
    })
    @IsBoolean()
    @IsOptional()
    is_active?: boolean;

    @ApiPropertyOptional({
        description: 'The search of the offer template',
        required: false,
        type: String,
    })
    @IsString()
    @IsOptional()
    search?: string;
}

