import {
    IsString,
    IsOptional,
    IsBoolean,
    IsEnum,
    IsNumber,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { OfferTemplateVisibility } from '../../offer-template/dtos/create-offer-template.dto';

export class CreateWordTemplateRequestDto {
    @ApiProperty({
        type: 'string',
        format: 'binary',
        description: 'DOCX template file',
    })
    file?: any; // File is handled by FileInterceptor, not validated here

    @ApiProperty({ description: 'The name of the word template' })
    @IsString()
    name: string;

    @ApiProperty({
        description: 'The visibility of the word template',
        enum: OfferTemplateVisibility,
        enumName: 'OfferTemplateVisibility',
    })
    @IsEnum(OfferTemplateVisibility)
    @IsOptional()
    visibility?: OfferTemplateVisibility = OfferTemplateVisibility.USER;

    @ApiProperty({ description: 'Whether the word template is default' })
    @IsBoolean()
    @IsOptional()
    is_default?: boolean = false;

    @ApiProperty({ description: 'The code of the word template' })
    @IsString()
    code: string;

    @ApiProperty({ description: 'The tags of the word template' })
    @IsString()
    @IsOptional()
    tags?: string;

    @ApiProperty({ description: 'Whether the word template is active' })
    @IsBoolean()
    @IsOptional()
    is_active?: boolean = false;

    @ApiProperty({ description: 'Portal ID for portal-specific template' })
    @IsNumber()
    @IsOptional()
    portal_id?: number;

    @ApiProperty({ description: 'User ID for user-specific template' })
    @IsNumber()
    @IsOptional()
    user_id?: number;
}

export class CreateWordTemplateResponseDto {
    @ApiProperty()
    id: string;

    @ApiProperty()
    name: string;

    @ApiProperty({ enum: OfferTemplateVisibility })
    visibility: OfferTemplateVisibility;

    @ApiProperty()
    is_default: boolean;

    @ApiProperty()
    file_path: string;

    @ApiProperty({ required: false })
    demo_path?: string;

    @ApiProperty()
    type: string;

    @ApiProperty()
    code: string;

    @ApiProperty({ required: false })
    tags?: string;

    @ApiProperty()
    is_active: boolean;

    @ApiProperty()
    counter: number;

    @ApiProperty({ required: false })
    template_url?: string;

    @ApiProperty({ required: false })
    created_at?: Date;

    @ApiProperty({ required: false })
    updated_at?: Date;
}

