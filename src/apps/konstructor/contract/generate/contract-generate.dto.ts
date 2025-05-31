import { Type } from 'class-transformer';
import {
    IsArray,
    IsBoolean,
    IsEnum,
    IsNumber,
    IsObject,
    IsOptional,
    IsString,
    ValidateNested,
} from 'class-validator';
import {
    ProductRowDto,
    ProductRowSetDto,
    ContractDto,
    SupplyDto,
    PriceDto,
    RegionDto,
    RegionsDto,
    ComplectDto
} from 'src/apps/konstructor/document-generate';
//      
import { ClientTypeEnum } from '../../document-generate/type/client.type';
import { BxRqDto } from '../../document-generate/dto/bx-rq/bx-rq.dto';
import { ContractSpecificationDto } from '../../document-generate/dto/specification/specification.dto';
import { CONTRACT_LTYPE } from '../../document-generate/type/contract.type';

class PlacementDto {
    @IsString() placement: string;
    @IsObject() options: { ID: number };
}

export class ContractGenerateDto {
    @IsString() domain: string;
    @IsString() companyId: string;
    @ValidateNested() @Type(() => PlacementDto) placement: PlacementDto;
    @IsBoolean() isProd: boolean;
    @IsString() dealId: string;
    @IsNumber() providerId: number;
    @IsNumber() userId: number;
    // @IsBoolean() isSupplyReport: boolean;
    @IsEnum(CONTRACT_LTYPE) contractType: CONTRACT_LTYPE;

    @IsArray() @ValidateNested({ each: true }) @Type(() => ComplectDto) complect: ComplectDto[];
    @ValidateNested() @Type(() => SupplyDto) supply: SupplyDto;
    @ValidateNested() @Type(() => PriceDto) price: PriceDto;
    @ValidateNested() @Type(() => ContractDto) contract: ContractDto;
    @ValidateNested() @Type(() => RegionsDto) regions: RegionsDto;
    @ValidateNested() @Type(() => RegionDto) region: RegionDto;
    @IsArray() @ValidateNested({ each: true }) @Type(() => ProductRowDto) rows: ProductRowDto[];
    @ValidateNested() @Type(() => ProductRowDto) total: ProductRowDto;
    @ValidateNested() @Type(() => ProductRowSetDto) productSet: ProductRowSetDto;

    // @IsOptional()  @Type(() => BxCompanyItemsDto) bxCompanyItems?: BxCompanyItemsDto;
    // @IsOptional()  @Type(() => BxDealItemsDto) bxDealItems?: BxDealItemsDto;
    @IsOptional() @IsString() contractStart?: string;
    @IsOptional() @IsString() contractEnd?: string;
    @IsOptional() @IsString() contractNumber?: string;
    @IsOptional() @IsString() contractCreateDate?: string;
    @IsOptional() @IsString() garantClientAssignedName?: string;
    @IsOptional() @IsString() garantClientAssignedEmail?: string;
    @IsOptional() @IsString() garantClientEmail?: string;
    @IsOptional() @IsString() firstPayDate?: string;
    // @IsOptional() @IsArray() bxContacts?: any[];
    @IsEnum(ClientTypeEnum) clientType: ClientTypeEnum;
    // @IsOptional() @IsObject() contractBaseState?: any;
    @IsObject() bxrq: BxRqDto;
    // @IsOptional() @IsObject() contractProviderState?: any;
    @ValidateNested() @Type(() => ContractSpecificationDto) contractSpecificationState: ContractSpecificationDto;
    // @IsOptional() @IsArray() totalRows?: any[];
}


