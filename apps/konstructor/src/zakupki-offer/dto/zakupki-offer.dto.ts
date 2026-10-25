import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
    IsArray,
    IsBoolean,
    IsNumber,
    IsObject,
    IsOptional,
    IsString,
    ValidateNested,
} from 'class-validator';
import { OtherProvidersDto } from './other-provider.dto';

import {
    ProductRowDto,
    ProductRowsItemsDto,
    ProductRowSetDto,
    RecipientDto,
    PriceDto,
    RegionDto,
    RegionsDto,
    ComplectDto,
} from '@app/konstructor/document-generate';
import { ProviderDto } from '@lib/portal-lib/konstructor/provider';
import { ContractDto } from '../../dto/contract.dto';
import { SupplyDto } from '../../dto';

class PlacementDto {
    @IsString() placement: string;
    @IsObject() options: { ID: number };
}

export class CreateOfferDto {
    @ApiProperty({ type: String }) @IsString() domain: string;
    @ApiProperty({ type: String }) @IsString() companyId: string;
    @ApiProperty({ type: PlacementDto, required: false })
    @IsOptional()
    @ValidateNested()
    @Type(() => PlacementDto)
    placement?: PlacementDto;
    @ApiProperty({ type: Boolean, required: false })
    @IsOptional()
    @IsBoolean()
    isProd?: boolean;
    @ApiProperty({ type: String }) @IsString() dealId: string;
    // @ValidateNested() @Type(() => TemplateDto) template: TemplateDto;
    /** Поставщик целиком (легаси-фронт); новый фронт шлёт providerId, бэк грузит сам */
    @ApiProperty({ type: ProviderDto, required: false })
    @IsOptional()
    @ValidateNested()
    @Type(() => ProviderDto)
    provider?: ProviderDto;
    @ApiProperty({
        description: 'Наш поставщик документов (agents.id) — вместо provider',
        type: Number,
        required: false,
    })
    @IsOptional()
    @IsNumber()
    providerId?: number;
    @ApiProperty({ type: RecipientDto })
    @ValidateNested()
    @Type(() => RecipientDto)
    recipient: RecipientDto;
    @ApiProperty({ type: Number }) @IsNumber() userId: number;
    @ApiProperty({ type: String }) @IsString() contractStart: string;
    @ApiProperty({ type: String }) @IsString() contractEnd: string;
    // @IsBoolean() isOffer: boolean;
    // @IsBoolean() isInvoice: boolean;
    // @IsBoolean() isPublic: boolean;
    // @IsBoolean() isFromPresentation: boolean;
    // @IsBoolean() withHook: boolean;
    // @IsOptional() @IsBoolean() isWord: boolean;
    // @IsOptional() @IsString() invoiceDate: string;
    // @IsOptional() @IsString() withStamps: string;
    @ApiProperty({ type: [ComplectDto] })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ComplectDto)
    complect: ComplectDto[];
    @ApiProperty({ type: SupplyDto, required: false })
    @IsOptional()
    @ValidateNested()
    @Type(() => SupplyDto)
    supply?: SupplyDto;
    @ApiProperty({ type: PriceDto, required: false })
    @IsOptional()
    @ValidateNested()
    @Type(() => PriceDto)
    price?: PriceDto;
    @ApiProperty({ type: ContractDto, required: false })
    @IsOptional()
    @ValidateNested()
    @Type(() => ContractDto)
    contract?: ContractDto;
    @ApiProperty({ type: RegionsDto })
    @ValidateNested()
    @Type(() => RegionsDto)
    regions: RegionsDto;
    @ApiProperty({ type: RegionDto, required: false })
    @IsOptional()
    @ValidateNested()
    @Type(() => RegionDto)
    region?: RegionDto;
    @ApiProperty({ type: OtherProvidersDto })
    @ValidateNested()
    @Type(() => OtherProvidersDto)
    otherProviders: OtherProvidersDto;
    @ApiProperty({ type: ProductRowsItemsDto, required: false })
    @IsOptional()
    @ValidateNested()
    @Type(() => ProductRowsItemsDto)
    rows?: ProductRowsItemsDto;
    @ApiProperty({ type: ProductRowDto })
    @ValidateNested()
    @Type(() => ProductRowDto)
    total: ProductRowDto;
    @ApiProperty({ type: ProductRowSetDto, required: false })
    @IsOptional()
    @ValidateNested()
    @Type(() => ProductRowSetDto)
    productSet?: ProductRowSetDto;
}
export class ZakupkiOfferCreateDto extends CreateOfferDto {}
