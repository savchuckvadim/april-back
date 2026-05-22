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
    InvoiceTemplateType as InvoiceTemplateTypeSchema,
    InvoiceTemplateTypeValue,
    InvoiceTemplateVisibility as InvoiceTemplateVisibilitySchema,
    InvoiceTemplateVisibilityValue,
} from './invoice-template.enums';

/** Ссылка для ESLint/TS (декораторы не всегда засчитывают «использование» импорта). */
const _invoiceTemplateVisibilityForMeta = InvoiceTemplateVisibilitySchema;
const _invoiceTemplateTypeForMeta = InvoiceTemplateTypeSchema;

export class UpdateInvoiceTemplateDto {
    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    name?: string;

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
    @IsString()
    description?: string;

    @ApiPropertyOptional({ enum: _invoiceTemplateTypeForMeta })
    @IsOptional()
    @IsEnum(_invoiceTemplateTypeForMeta)
    type?: InvoiceTemplateTypeValue;

    @ApiPropertyOptional()
    @IsOptional()
    @Type(() => Boolean)
    @IsBoolean()
    is_default?: boolean;

    @ApiPropertyOptional()
    @IsOptional()
    @Type(() => Boolean)
    @IsBoolean()
    is_active?: boolean;
}
