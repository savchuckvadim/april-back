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
    ContractDto,
    SupplyDto,
    PriceDto,
    RegionDto,
    RegionsDto,
    ComplectDto,
} from 'src/apps/konstructor/document-generate';
import { ProviderDto } from '../../../../modules/portal-konstructor/provider';

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
    @ValidateNested({ each: true })
    @Type(() => ProviderDto)
    provider: ProviderDto;
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
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ComplectDto)
    complect: ComplectDto[];
    @ValidateNested() @Type(() => SupplyDto) supply: SupplyDto;
    @ValidateNested() @Type(() => PriceDto) price: PriceDto;
    @ValidateNested() @Type(() => ContractDto) contract: ContractDto;
    @ValidateNested() @Type(() => RegionsDto) regions: RegionsDto;
    @ValidateNested() @Type(() => RegionDto) region: RegionDto;
    @ValidateNested()
    @Type(() => OtherProvidersDto)
    otherProviders: OtherProvidersDto;
    @ValidateNested()
    @Type(() => ProductRowsItemsDto)
    rows: ProductRowsItemsDto;
    @ValidateNested() @Type(() => ProductRowDto) total: ProductRowDto;
    @ValidateNested()
    @Type(() => ProductRowSetDto)
    productSet: ProductRowSetDto;
}
export class ZakupkiOfferCreateDto extends CreateOfferDto {}
