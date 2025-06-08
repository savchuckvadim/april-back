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
import { ClientTypeEnum } from '../../../document-generate/type/client.type';
import { BxRqDto } from '../../../document-generate/dto/bx-rq/bx-rq.dto';
import { ContractSpecificationDto } from '../../../document-generate/dto/specification/specification.dto';
import { CONTRACT_LTYPE } from '../../../document-generate/type/contract.type';
import { ApiProperty } from '@nestjs/swagger';

class PlacementDto {
    @ApiProperty({ description: 'Placement of the contract' })
    @IsString() placement: string;
    @ApiProperty({ description: 'Options of the placement', type: Object })
    @IsObject() options: { ID: number };
}

export class ContractGenerateDto {
    @ApiProperty({ description: 'Domain of the company' })
    @IsString() domain: string;

    @ApiProperty({ description: 'ID of the company' })
    @IsString() companyId: string;

    @ApiProperty({ description: 'Placement of the contract' })
    @ValidateNested() @Type(() => PlacementDto) placement: PlacementDto;

    @ApiProperty({ description: 'Is the contract a product' })
    @IsBoolean() isProd: boolean;

    @ApiProperty({ description: 'ID of the deal' })
    @IsString() dealId: string;

    @ApiProperty({ description: 'ID of the provider' })
    @IsNumber() providerId: number;

    @ApiProperty({ description: 'ID of the user' })
    @IsNumber() userId: number;



    @ApiProperty({
        description: 'Type of the contract',
        enum: CONTRACT_LTYPE
    })
    @IsEnum(CONTRACT_LTYPE) contractType: CONTRACT_LTYPE;


    @ApiProperty({ description: 'Complect of the contract', type: [ComplectDto] })
    @IsArray() @ValidateNested({ each: true }) @Type(() => ComplectDto)
    complect: ComplectDto[];


    @ApiProperty({ description: 'Supply of the contract', type: SupplyDto })
    @ValidateNested() @Type(() => SupplyDto) supply: SupplyDto;


    @ApiProperty({ description: 'Price of the contract', type: PriceDto })
    @ValidateNested() @Type(() => PriceDto)
    price: PriceDto;


    @ApiProperty({ description: 'Contract of the contract', type: ContractDto })
    @ValidateNested() @Type(() => ContractDto)
    contract: ContractDto;


    @ApiProperty({ description: 'Regions of the contract', type: RegionsDto })
    @ValidateNested() @Type(() => RegionsDto)
    regions: RegionsDto;


    @ApiProperty({ description: 'Region of the contract', type: RegionDto })
    @ValidateNested() @Type(() => RegionDto)
    region: RegionDto;


    @ApiProperty({ description: 'Rows of the contract', type: [ProductRowDto] })
    @IsArray() @ValidateNested({ each: true }) @Type(() => ProductRowDto)
    rows: ProductRowDto[];


    @ApiProperty({ description: 'Total of the contract', type: ProductRowDto })
    @ValidateNested() @Type(() => ProductRowDto)
    total: ProductRowDto;


    @ApiProperty({ description: 'Product set of the contract', type: ProductRowSetDto })
    @ValidateNested() @Type(() => ProductRowSetDto)
    productSet: ProductRowSetDto;


    @ApiProperty({ description: 'Contract start of the contract', })
    @IsOptional() @IsString()
    contractStart?: string;


    @ApiProperty({ description: 'Contract end of the contract' })
    @IsOptional() @IsString()
    contractEnd?: string;


    @ApiProperty({ description: 'Contract number of the contract' })
    @IsOptional() @IsString()
    contractNumber?: string;


    @ApiProperty({ description: 'Contract create date of the contract' })
    @IsOptional() @IsString()
    contractCreateDate?: string;


    @ApiProperty({ description: 'Garant client assigned name of the contract' })
    @IsOptional() @IsString()
    garantClientAssignedName?: string;


    @ApiProperty({ description: 'Garant client assigned email of the contract' })
    @IsOptional() @IsString()
    garantClientEmail?: string;


    @ApiProperty({ description: 'First pay date of the contract' })
    @IsOptional() @IsString()
    firstPayDate?: string;


    @ApiProperty({ description: 'Client type of the contract', enum: ClientTypeEnum })
    @IsEnum(ClientTypeEnum)
    clientType: ClientTypeEnum;



    @ApiProperty({ description: 'BxRQ of the contract', type: BxRqDto })
    @IsObject() bxrq: BxRqDto;

    @ApiProperty({ description: 'Contract specification state of the contract', type: ContractSpecificationDto })
    @ValidateNested() @Type(() => ContractSpecificationDto) contractSpecificationState: ContractSpecificationDto;


}


