import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
    IsBoolean,
    IsEnum,
    IsNumberString,
    IsOptional,
    IsString,
} from 'class-validator';
import {
    InvoiceTemplateVisibility as InvoiceTemplateVisibilitySchema,
    InvoiceTemplateVisibilityValue,
} from './invoice-template.enums';

const _invoiceTemplateVisibilityForMeta = InvoiceTemplateVisibilitySchema;

export class InvoiceTemplateQueryDto {
    @ApiPropertyOptional({ enum: _invoiceTemplateVisibilityForMeta })
    @IsOptional()
    @IsEnum(_invoiceTemplateVisibilityForMeta)
    visibility?: InvoiceTemplateVisibilityValue;

    @ApiPropertyOptional()
    @IsOptional()
    @IsNumberString()
    portal_id?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsNumberString()
    agent_id?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @Type(() => Boolean)
    @IsBoolean()
    is_active?: boolean;

    @ApiPropertyOptional()
    @IsOptional()
    @Type(() => Boolean)
    @IsBoolean()
    is_archived?: boolean;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    search?: string;
}
