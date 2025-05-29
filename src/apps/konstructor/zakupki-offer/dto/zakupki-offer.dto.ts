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
import { ProviderDto } from './provider.dto';
import { RecipientDto } from './recipient.dto';
import { ContractDto } from './contract.dto';
import { SupplyDto } from './supply.dto';
import { PriceDto } from './price-cells.dto';
import { RegionDto, RegionsDto } from './region.dto';
import { ComplectDto } from './complect.dto';
import { ProductRowDto, ProductRowsItemsDto } from './product-row/product-row.dto';
import { ProductRowSetDto } from './product-row-set/product-row-set.dto';


class TemplateFieldDto {
    @IsNumber() id: number;
    @IsNumber() number: number;
    @IsArray() items: any[];
    @IsString() name: string;
    @IsString() code: string;
    @IsString() type: string;
    @IsNumber() isGeneral: number;
    @IsNumber() isDefault: number;
    @IsNumber() isRequired: number;
    @IsOptional() @IsString() value: string;
    @IsOptional() @IsString() description: string;
    @IsOptional() @IsString() bitixId: string;
    @IsOptional() @IsString() bitrixTemplateId: string;
    @IsNumber() isActive: number;
    @IsNumber() isPlural: number;
    @IsNumber() isClient: number;
}

class TemplateDto {
    @IsNumber() id: number;
    @IsString() name: string;
    @IsString() code: string;
    @IsString() type: string;
    @IsString() portal: string;
    @IsArray() @ValidateNested({ each: true }) @Type(() => ProviderDto) providers: ProviderDto[];
    @IsArray() @ValidateNested({ each: true }) @Type(() => TemplateFieldDto) fields: TemplateFieldDto[];
    @IsArray() counters: any[];
    @IsNumber() number: number;
}

class PlacementDto {
    @IsString() placement: string;
    @IsObject() options: { ID: number };
}








export class CreateOfferDto {
    @IsString() domain: string;
    @IsString() companyId: string;
    @ValidateNested() @Type(() => PlacementDto) placement: PlacementDto;
    @IsBoolean() isProd: boolean;
    @IsString() dealId: string;
    // @ValidateNested() @Type(() => TemplateDto) template: TemplateDto;
    @ValidateNested({ each: true }) @Type(() => ProviderDto) provider: ProviderDto;
    @ValidateNested() @Type(() => RecipientDto) recipient: RecipientDto;
    @IsNumber() userId: number;
    @IsString() contractStart: string;
    @IsString() contractEnd: string;
    // @IsBoolean() isOffer: boolean;
    // @IsBoolean() isInvoice: boolean;
    // @IsBoolean() isPublic: boolean;
    // @IsBoolean() isFromPresentation: boolean;
    // @IsBoolean() withHook: boolean;
    // @IsOptional() @IsBoolean() isWord: boolean;
    // @IsOptional() @IsString() invoiceDate: string;
    // @IsOptional() @IsString() withStamps: string;
    @IsArray() @ValidateNested({ each: true }) @Type(() => ComplectDto) complect: ComplectDto[];
    @ValidateNested() @Type(() => SupplyDto) supply: SupplyDto;
    @ValidateNested() @Type(() => PriceDto) price: PriceDto;
    @ValidateNested() @Type(() => ContractDto) contract: ContractDto;
    @ValidateNested() @Type(() => RegionsDto) regions: RegionsDto;
    @ValidateNested() @Type(() => RegionDto) region: RegionDto;
    @ValidateNested() @Type(() => OtherProvidersDto) otherProviders: OtherProvidersDto;
    @ValidateNested() @Type(() => ProductRowsItemsDto) rows: ProductRowsItemsDto;
    @ValidateNested() @Type(() => ProductRowDto) total: ProductRowDto;
    @ValidateNested() @Type(() => ProductRowSetDto) productSet: ProductRowSetDto;



}
export class ZakupkiOfferCreateDto extends CreateOfferDto {

}
