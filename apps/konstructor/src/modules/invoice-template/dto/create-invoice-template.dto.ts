import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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

    @ApiPropertyOptional({
        description:
            'Типы клиента, для которых годится шаблон. Пустой список и отсутствие ' +
            'поля означают «для любого типа клиента» (в БД пишется NULL).',
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
            'Типы поставки, для которых годится шаблон. Пустой список и отсутствие ' +
            'поля означают «для любого типа поставки» (в БД пишется NULL).',
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

    @ApiPropertyOptional()
    @IsOptional()
    @IsNumberString()
    creator_bitrix_user_id?: string;
}

export class CreateInvoiceTemplateMultipartDto extends CreateInvoiceTemplateBodyDto {
    @ApiProperty({ type: 'string', format: 'binary' })
    file: Express.Multer.File;
}
