import { ApiProperty } from '@nestjs/swagger';
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
    ProductRowSupplyDto,
    PriceDto,
    RegionDto,
    RegionsDto,
    ComplectDto,
} from 'src/apps/konstructor/document-generate';
import { ClientTypeEnum } from '../../document-generate/type/client.type';
import { ContractDto } from '../../dto/contract.dto';
import { CONTRACT_LTYPE } from '../../document-generate/type/contract.type';
import { PlacementDto } from '@/apps/event-sales/dto/event-sale-flow/placement.dto';
import { SupplyDto } from '../../dto';
//


export class OfferWordByTemplateGenerateDto {

    @ApiProperty({ description: 'ID of the template' })
    @IsString()
    templateId: string;

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

    @ApiProperty({ description: 'Price of the contract', type: PriceDto })
    @ValidateNested()
    @Type(() => PriceDto)
    price: PriceDto;

    @ApiProperty({ description: 'Contract of the contract', type: ContractDto })
    @ValidateNested()
    @Type(() => ContractDto)
    contract: ContractDto;

    @ApiProperty({ description: 'Regions of the contract', type: RegionsDto })
    @ValidateNested()
    @Type(() => RegionsDto)
    regions: RegionsDto;

    @ApiProperty({ description: 'Region of the contract', type: RegionDto })
    @ValidateNested()
    @Type(() => RegionDto)
    region: RegionDto;

    @ApiProperty({ description: 'Rows of the contract', type: [ProductRowDto] })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ProductRowDto)
    rows: ProductRowDto[];

    @ApiProperty({ description: 'Total of the contract', type: ProductRowDto })
    @ValidateNested()
    @Type(() => ProductRowDto)
    total: ProductRowDto;

    @ApiProperty({
        description: 'Product set of the contract',
        type: ProductRowSetDto,
    })
    @ValidateNested()
    @Type(() => ProductRowSetDto)
    productSet: ProductRowSetDto;



    @ApiProperty({
        description: 'Client type of the contract',
        enum: ClientTypeEnum,
    })
    @IsEnum(ClientTypeEnum)
    clientType: ClientTypeEnum;


}
