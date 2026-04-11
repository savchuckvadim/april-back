import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
    IsArray,
    IsBoolean,
    IsEnum,
    IsNumber,
    IsOptional,
    IsString,
    ValidateNested,
} from 'class-validator';
import {
    ProductRowDto,
    ProductRowSetDto,
    ComplectDto,
} from 'src/apps/konstructor/document-generate';
import { ClientTypeEnum } from '../../document-generate/type/client.type';
import { ContractDto } from '../../dto/contract.dto';
import { CONTRACT_LTYPE } from '../../document-generate/type/contract.type';
import { SupplyDto } from '../../dto';

export class InvoiceDataDto {
    @ApiProperty({ description: 'Need general invoice' })
    @IsBoolean()
    needGeneralInvoice: boolean;
    @ApiProperty({ description: 'Need many invoices' })
    @IsBoolean()
    needManyInvoices: boolean;
    @ApiProperty({ description: 'Is by presentation invoices' })
    @IsBoolean()
    isByPresentationInvoices: boolean;
    @ApiProperty({ description: 'Invoice date' })
    @IsString()
    @IsOptional()
    invoiceDate: string;
    @ApiProperty({ description: 'Invoice number' })
    @IsString()
    @IsOptional()
    invoiceNumber?: string;
}
export class IOfferWordGenerateRecipientDto {
    @ApiProperty({ description: 'Name of the recipient' })
    @IsString()
    @IsOptional()
    name?: string;
    @ApiProperty({ description: 'INN of the recipient' })
    @IsString()
    @IsOptional()
    inn?: string;
    @ApiProperty({ description: 'Company name of the recipient' })
    @IsString()
    @IsOptional()
    companyName?: string;
    @ApiProperty({ description: 'Position of the recipient' })
    @IsString()
    @IsOptional()
    position?: string;
}
export class IOfferWordGenerateManagerDto {
    @ApiProperty({ description: 'Name of the manager' })
    @IsString()
    @IsOptional()
    name?: string;
    @ApiProperty({ description: 'Email of the manager' })
    @IsString()
    @IsOptional()
    email?: string;
    @ApiProperty({ description: 'Phone of the manager' })
    @IsString()
    @IsOptional()
    phone?: string;
    @ApiProperty({ description: 'Position of the manager' })
    @IsString()
    @IsOptional()
    position?: string;
}

export class ProductRowFullSetsDto {
    @ApiProperty({ description: 'General set of the product rows' })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ProductRowSetDto)
    general: ProductRowSetDto[];
    @ApiProperty({ description: 'Alternative set of the product rows' })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ProductRowSetDto)
    alternative: ProductRowSetDto[];
}
export class OfferWordByTemplateGenerateDto {
    @ApiProperty({ description: 'ID of the template' })
    @IsString()
    templateId: string;

    @ApiProperty({ description: 'ID of the invoice template' })
    @IsString()
    invoiceTemplateId: string;

    @ApiProperty({ description: 'Domain of the company' })
    @IsString()
    domain: string;

    @ApiProperty({ description: 'ID of the company' })
    @IsString()
    companyId: string;

    @ApiProperty({ description: 'ID of the deal' })
    @IsString()
    dealId: string;

    @ApiProperty({ description: 'ID of the provider' })
    @IsNumber()
    providerId: number;

    @ApiProperty({ description: 'ID of the user' })
    @IsNumber()
    userId: number;

    @ApiProperty({
        description: 'Type of the contract',
        enum: CONTRACT_LTYPE,
    })
    @IsEnum(CONTRACT_LTYPE)
    contractType: CONTRACT_LTYPE;

    @ApiProperty({
        description: 'Complect of the contract',
        type: [ComplectDto],
    })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ComplectDto)
    complect: ComplectDto[];

    @ApiProperty({ description: 'Supply of the contract', type: SupplyDto })
    @ValidateNested()
    @Type(() => SupplyDto)
    supply: SupplyDto;

    @ApiProperty({ description: 'Contract of the contract', type: ContractDto })
    @ValidateNested()
    @Type(() => ContractDto)
    contract: ContractDto;

    @ApiProperty({ description: 'Rows of the contract', type: [ProductRowDto] })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ProductRowDto)
    rows: ProductRowDto[];

    @ApiProperty({
        description: 'Product set of the contract',
        type: ProductRowFullSetsDto,
    })
    @ValidateNested()
    @Type(() => ProductRowFullSetsDto)
    sets: ProductRowFullSetsDto;

    @ApiProperty({ description: 'Total of the contract', type: ProductRowDto })
    @ValidateNested()
    @Type(() => ProductRowDto)
    total: ProductRowDto;

    @ApiProperty({
        description: 'Client type of the contract',
        enum: ClientTypeEnum,
    })
    @IsEnum(ClientTypeEnum)
    clientType: ClientTypeEnum;

    @ApiProperty({
        required: false,
        default: false,
        description:
            'true — в ответе link ведёт на PDF (DOCX сохраняется и конвертируется); false или не передавать — link на DOCX',
    })
    @IsOptional()
    @IsBoolean()
    isWord?: boolean;

    @ApiProperty({
        description: 'Recipient of the contract',
        type: IOfferWordGenerateRecipientDto,
    })
    @ValidateNested()
    @Type(() => IOfferWordGenerateRecipientDto)
    recipient: IOfferWordGenerateRecipientDto;

    @ApiProperty({
        description: 'Manager of the contract',
        type: IOfferWordGenerateManagerDto,
    })
    @ValidateNested()
    @Type(() => IOfferWordGenerateManagerDto)
    manager: IOfferWordGenerateManagerDto;

    @ApiProperty({ description: 'Invoice data', type: InvoiceDataDto })
    @ValidateNested()
    @Type(() => InvoiceDataDto)
    invoice: InvoiceDataDto;

    @ApiProperty({ description: 'Without queue' })
    @IsBoolean()
    @IsOptional()
    withoutQueue?: boolean;

    @ApiProperty({
        required: false,
        default: false,
        description:
            'true — сохранять документы только в Bitrix Disk; false или не передавать — сохранять и на сервере, и в Bitrix',
    })
    @IsOptional()
    @IsBoolean()
    onlyBitrixSave?: boolean;
}
