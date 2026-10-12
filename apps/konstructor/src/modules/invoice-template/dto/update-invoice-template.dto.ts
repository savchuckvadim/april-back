import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBooleanFlag } from '@lib/portal-lib/konstructor/document-template';
import { Transform } from 'class-transformer';
import {
    IsArray,
    IsEnum,
    IsNumberString,
    IsOptional,
    IsString,
} from 'class-validator';
import { ClientTypeEnum } from '@app/konstructor/document-generate/type/client.type';
import { SupplyTypeEnum } from '@app/konstructor/document-generate/type/supply.type';
import {
    InvoiceTemplateType as InvoiceTemplateTypeSchema,
    InvoiceTemplateTypeValue,
    InvoiceTemplateVisibility as InvoiceTemplateVisibilitySchema,
    InvoiceTemplateVisibilityValue,
} from './invoice-template.enums';
import { parseMultipartList } from './invoice-template.multipart-list';

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

    @ApiPropertyOptional({
        description:
            'Типы клиента. Пустой массив сбрасывает привязку в NULL — ' +
            '«годится любому типу клиента».',
        enum: ClientTypeEnum,
        enumName: 'ClientTypeEnum',
        isArray: true,
        example: [ClientTypeEnum.ORG_STATE],
    })
    @IsOptional()
    @Transform(parseMultipartList)
    @IsArray()
    @IsEnum(ClientTypeEnum, { each: true })
    client_types?: ClientTypeEnum[];

    @ApiPropertyOptional({
        description:
            'Типы поставки. Пустой массив сбрасывает привязку в NULL — ' +
            '«годится любому типу поставки».',
        enum: SupplyTypeEnum,
        enumName: 'SupplyTypeEnum',
        isArray: true,
        example: [SupplyTypeEnum.INTERNET],
    })
    @IsOptional()
    @Transform(parseMultipartList)
    @IsArray()
    @IsEnum(SupplyTypeEnum, { each: true })
    supply_types?: SupplyTypeEnum[];

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
    @IsBooleanFlag()
    is_default?: boolean;

    @ApiPropertyOptional()
    @IsOptional()
    @IsBooleanFlag()
    is_active?: boolean;
}
