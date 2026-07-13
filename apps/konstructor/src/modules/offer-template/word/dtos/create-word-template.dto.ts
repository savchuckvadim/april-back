import {
    IsString,
    IsOptional,
    IsBoolean,
    IsEnum,
    IsNumber,
    MaxLength,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { OfferTemplateVisibility } from '../../offer-template/dtos/create-offer-template.dto';
import { WordTemplate } from '../entities';

export class CreateWordTemplateBodyDto {
    @ApiProperty({ description: 'The name of the word template' })
    @IsString()
    @MaxLength(255, { message: 'name must be at most 255 characters' })
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

    @ApiProperty({ description: 'The tags of the word template' })
    @IsString()
    @IsOptional()
    @MaxLength(255, { message: 'tags must be at most 255 characters' })
    tags?: string;

    @ApiProperty({ description: 'Whether the word template is active' })
    @IsBoolean()
    @IsOptional()
    is_active?: boolean = false;

    @ApiProperty({
        description: 'id of the portal',
        required: true,
        type: Number,
    })
    @IsNumber()
    portal_id: number;

    @ApiProperty({
        description: 'id of the user',
        required: true,
        type: Number,
    })
    @IsNumber()
    user_id: number;
}

export class CreateWordTemplateMultipartDto extends CreateWordTemplateBodyDto {
    @ApiProperty({
        type: 'string',
        format: 'binary',
        description: 'DOCX template file',
    })
    file: any;
}

export class CreateWordTemplateServerDto extends CreateWordTemplateBodyDto {
    @ApiProperty({ description: 'The code of the word template' })
    @IsString()
    code: string;
}

export class CreateWordTemplateResponseDto {
    constructor(partial: Partial<WordTemplate>) {
        Object.assign(this, partial);
    }
    @ApiProperty({ type: String })
    id: string;

    @ApiProperty({ type: String })
    name: string;

    @ApiProperty({ enum: OfferTemplateVisibility })
    visibility: OfferTemplateVisibility;

    @ApiProperty({ type: Boolean })
    is_default: boolean;

    @ApiProperty({ type: String })
    file_path: string;

    @ApiProperty({ required: false })
    demo_path?: string;

    @ApiProperty({ type: String })
    type: string;

    @ApiProperty()
    code: string;

    @ApiProperty({ required: false })
    tags?: string;

    @ApiProperty({ type: Boolean })
    is_active: boolean;

    @ApiProperty({ type: Number })
    counter: number;

    @ApiProperty({ required: false, type: String })
    template_url?: string;

    @ApiProperty({ required: false, type: Date })
    created_at?: Date;

    @ApiProperty({ required: false, type: Date })
    updated_at?: Date;

    @ApiProperty({ required: false, type: Boolean })
    is_archived?: boolean;

    @ApiProperty({ required: false, type: Date })
    archived_at?: Date;

    @ApiProperty({ required: false, type: Number })
    portal_id?: number;

    @ApiProperty({ required: false, type: Number })
    user_id?: number;
}
