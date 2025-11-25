import { Type } from 'class-transformer';
import {
    IsArray,
    IsBoolean,
    IsNumber,
    IsString,
    ValidateNested,
} from 'class-validator';
import { TemplateDto } from './dto/template.dto';
import { PlacementDto } from 'src/apps/event-sales/dto/event-sale-flow/placement.dto';
import {
    ComplectDto,

    PriceDto,
    RecipientDto,
    RegionDto,
    RegionsDto,
    ProductRowSupplyDto,
} from '../document-generate';
import { OfferSettingSDto } from './dto/offer-settings.dto';
import { ProviderDto } from '../../../modules/portal-konstructor/provider/provider.dto';
import { InvoiceSettingsDto } from './dto/invoice-settings.dto';
import { ContractDto } from '../dto/contract.dto';

export class OfferDto {
    @IsString() domain: string;
    @IsString() companyId: string;
    @ValidateNested() @Type(() => PlacementDto) placement: PlacementDto;
    @IsBoolean() isProd: boolean;
    @IsString() dealId: string;
    @ValidateNested() @Type(() => TemplateDto) template: TemplateDto;
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ComplectDto)
    complect: ComplectDto[];

    @ValidateNested() @Type(() => ProductRowSupplyDto) supply: ProductRowSupplyDto;

    @ValidateNested() @Type(() => ContractDto) contract: ContractDto;
    @ValidateNested() @Type(() => RegionDto) region: RegionDto;
    @ValidateNested() @Type(() => RegionsDto) regions: RegionsDto;
    @ValidateNested() @Type(() => OfferSettingSDto) settings: OfferSettingSDto;

    @ValidateNested({ each: true })
    @Type(() => ProviderDto)
    provider: ProviderDto;
    @ValidateNested() @Type(() => RecipientDto) recipient: RecipientDto;
    @ValidateNested() @Type(() => PriceDto) price: PriceDto;
    @IsNumber() userId: number;
    @IsBoolean() isOffer: boolean;
    @IsBoolean() isInvoice: boolean;
    @IsBoolean() manager: boolean;
    @ValidateNested()
    @Type(() => InvoiceSettingsDto)
    invoice: InvoiceSettingsDto;

    @IsBoolean() isPublic: boolean;
    // @IsString() salePhrase: string;
    @IsString() invoiceDate: string;
    // withStamps: boolean;
    @IsBoolean() isWord: boolean;
    // withHook: boolean;
    // presentation: boolean;
    // isFromPresentation: boolean;
}
