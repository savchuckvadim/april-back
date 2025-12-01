import { BxRqDto } from '@/apps/konstructor/document-generate/dto/bx-rq/bx-rq.dto';
import { ContractSpecificationDto } from '@/apps/konstructor/document-generate/dto/specification/specification.dto';
import { ApiProperty } from '@nestjs/swagger';
import {
    IsArray,
    IsEnum,
    IsNumber,
    IsObject,
    IsOptional,
    IsString,
    ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ContractDto } from '@/apps/konstructor/dto/contract.dto';
import { RegionsDto } from '@/apps/konstructor/document-generate/dto/region.dto';
import { RegionDto } from '@/apps/konstructor/document-generate/dto/region.dto';
import { PbxDealDto } from './pbx-deal.dto';
import { PbxCompanyDto } from './pbx-company.dto';
import { SupplyReportDto } from './supply-fields/supply-fields.dto';
import { ClientTypeEnum } from '@/apps/konstructor/document-generate/type/client.type';
import { CONTRACT_LTYPE } from '@/apps/konstructor/document-generate/type/contract.type';
import { ProductRowDto, ProductRowSupplyDto } from '@/apps/konstructor/document-generate';
import { SupplyDto } from '@/apps/konstructor/dto';

export class ClientTypeDto {
    @ApiProperty({ description: 'Client type', type: String })
    @IsString({ message: 'clientType must be a string' })
    code: ClientTypeEnum;

    @ApiProperty({ description: 'Client type', type: String })
    @IsString({ message: 'clientType must be a string' })
    name: string;
}
export class ContactIdDto {
    @ApiProperty({ description: 'Contacts ID', type: String })
    @IsString({ message: 'contacts must be a string' })
    ID: string;
}

export class InitSupplyDto {
    @ApiProperty({ description: 'Domain of the supply' })
    @IsString({ message: 'domain must be a string' })
    domain: string;

    @ApiProperty({ description: 'RPA ID of the supply' })
    @IsOptional()
    @IsNumber()
    rpa_id: number | null;

    @ApiProperty({ description: 'ID of the provider' })
    @IsOptional()
    @IsNumber()
    providerId: number;

    @ApiProperty({ description: 'User ID of the supply' })
    @IsOptional()
    @IsNumber()
    userId: number | null;

    @ApiProperty({ description: 'Company ID of the supply' })
    @IsOptional()
    @IsNumber()
    companyId: number | null;

    @ApiProperty({ description: 'Company name of the supply' })
    @IsOptional()
    @IsString()
    companyName: string = '';

    @ApiProperty({ description: 'Base deal ID of the supply' })
    @IsOptional()
    @IsNumber()
    dealId: number | null;

    @ApiProperty({ description: 'Service smart ID of the supply' })
    @IsOptional()
    @IsNumber()
    serviceSmartId: number | null;

    @ApiProperty({ description: 'Contacts ', type: ContactIdDto })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ContactIdDto)
    bxContacts: ContactIdDto[];

    @ApiProperty({ description: 'Contract ', type: ContractDto })
    @ValidateNested({ message: 'contract must be a valid ContractDto' })
    @Type(() => ContractDto)
    contract: ContractDto;

    @ApiProperty({
        description: 'Contract type',
        enum: CONTRACT_LTYPE,
        enumName: 'CONTRACT_LTYPE',
    })
    @IsEnum(CONTRACT_LTYPE)
    contractType: CONTRACT_LTYPE;

    @ApiProperty({ description: 'Regions ', type: RegionsDto })
    @ValidateNested()
    @Type(() => RegionsDto)
    regions: RegionsDto;

    @ApiProperty({ description: 'Region ', type: RegionDto })
    @ValidateNested()
    @Type(() => RegionDto)
    region: RegionDto;

    @ApiProperty({ description: 'BxRQ of client', type: BxRqDto })
    @ValidateNested({ message: 'bxrq must be a valid BxRqDto' })
    @Type(() => BxRqDto)
    bxrq: BxRqDto;

    @ApiProperty({ description: 'Client type', type: ClientTypeDto })
    @ValidateNested()
    @Type(() => ClientTypeDto)
    clientType: ClientTypeDto;

    @ApiProperty({
        description: 'Contract specification state of the contract',
        type: ContractSpecificationDto,
    })
    @ValidateNested()
    @Type(() => ContractSpecificationDto)
    contractSpecificationState: ContractSpecificationDto;

    @ApiProperty({
        description: 'Supply report form fields',
        type: SupplyReportDto,
    })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => SupplyReportDto)
    supplyReport: SupplyReportDto[];

    @ApiProperty({
        description: 'PbxDealDto of the supply report',
        type: PbxDealDto,
    })
    @ValidateNested()
    @Type(() => PbxDealDto)
    bxDealItems: PbxDealDto;

    @ApiProperty({
        description: 'PbxCompanyDto of the supply report',
        type: PbxCompanyDto,
    })
    @ValidateNested({ message: 'bxCompanyItems must be a valid PbxCompanyDto' })
    @Type(() => PbxCompanyDto)
    bxCompanyItems: PbxCompanyDto;

    @ApiProperty({ description: 'File of current supply report', type: String })
    @IsString()
    file: string;

    @ApiProperty({ description: 'Complect arm ids', type: [String] })
    @IsArray({ message: 'complectArmIds must be an array' })
    @IsString({ each: true, message: 'each item must be a string' })
    complectArmIds: string[];

    @ApiProperty({ description: 'Client arm id', type: String })
    @IsString({ message: 'clientArmId must be a string' })
    clientArmId: string;

    @ApiProperty({ description: 'Supply', type: ProductRowSupplyDto })
    @ValidateNested()
    @Type(() => SupplyDto)
    supply: SupplyDto;

    @ApiProperty({ description: 'Total sum', type: Number })
    @IsArray()
    @ValidateNested({
        each: true,
        message: 'total must be a valid Array of ProductRowDto',
    })
    @Type(() => ProductRowDto)
    total: ProductRowDto[];
}
