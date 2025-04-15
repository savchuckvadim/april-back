// application/dto/generate-supply-report.dto.ts

import {
    IsArray,
    IsBoolean,
    IsInt,
    IsObject,
    IsOptional,
    IsString,
    ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { SupplyDto } from './supply.dto';
import { ContractDto } from './contract.dto';
import { ProductDto } from './product.dto';
import { RowDto } from './row.dto';

export class GenerateSupplyReportDto {
    @IsString()
    domain: string;

    @IsInt()
    companyId: number;

    @IsOptional()
    @IsInt()
    dealId?: number;

    @IsString()
    contractType: string;

    @IsObject()
    @ValidateNested()
    @Type(() => SupplyDto)
    supply: SupplyDto;

    @IsObject()
    @ValidateNested()
    @Type(() => ContractDto)
    contract: ContractDto;

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ProductDto)
    products: ProductDto[];

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => RowDto)
    arows: RowDto[];

    @IsObject()
    clientType: any;

    @IsObject()
    contractBaseState: any;

    @IsObject()
    bxrq: any;

    @IsArray()
    bxCompanyItems: any[];

    @IsArray()
    bxDealItems: any[];

    @IsArray()
    bxContacts: any[];

    @IsObject()
    contractProviderState: any;

    @IsObject()
    contractSpecificationState: any;

    @IsArray()
    total: any[];

    @IsInt()
    userId: number;

    @IsBoolean()
    isSupplyReport: boolean;
}
