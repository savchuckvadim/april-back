import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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

const _invoiceTemplateVisibilityForMeta = InvoiceTemplateVisibilitySchema;
const _invoiceTemplateTypeForMeta = InvoiceTemplateTypeSchema;

/** Поля multipart (кроме file) */
export class CreateInvoiceTemplateBodyDto {
    @ApiProperty()
    @IsString()
    name: string;

    @ApiPropertyOptional({ enum: _invoiceTemplateVisibilityForMeta })
    @IsOptional()
    @IsEnum(_invoiceTemplateVisibilityForMeta)
    visibility?: InvoiceTemplateVisibilityValue;

    @ApiPropertyOptional({
        description: 'Обязательно для visibility=portal|provider',
    })
    @IsOptional()
    @IsNumberString()
    portal_id?: string;

    @ApiPropertyOptional({
        description:
            'ID агента (поставщика); для visibility=provider обязателен',
    })
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

    @ApiPropertyOptional()
    @IsOptional()
    @IsNumberString()
    creator_bitrix_user_id?: string;
}

export class CreateInvoiceTemplateMultipartDto extends CreateInvoiceTemplateBodyDto {
    @ApiProperty({ type: 'string', format: 'binary' })
    file: Express.Multer.File;
}
