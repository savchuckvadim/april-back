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
import { ApiProperty } from '@nestjs/swagger';
import { CONTRACT_LTYPE } from '../../document-generate/type/contract.type';
import { ContractDto } from '../../dto/contract.dto';
import { ProductRowDto } from '../../document-generate/dto/product-row/product-row.dto';
import { ProductRowSetDto } from '../../document-generate/dto/product-row-set/product-row-set.dto';
import { ProductDto } from '../../document-generate/dto/product/product.dto';

// LegalTech types
class LegalTechPackageDto {
    @ApiProperty({ description: 'Package number' })
    @IsNumber()
    number: number;

    @ApiProperty({ description: 'Package name' })
    @IsString()
    name: string;

    @ApiProperty({ description: 'Package full name' })
    @IsString()
    fullName: string;

    @ApiProperty({ description: 'Package description' })
    @IsString()
    description: string;

    @ApiProperty({ description: 'Package weight' })
    @IsNumber()
    weight: number;

    @ApiProperty({ description: 'Package type' })
    @IsString()
    type: string;

    @ApiProperty({ description: 'Package price' })
    @IsNumber()
    price: number;

    @ApiProperty({ description: 'Moscow price' })
    @IsNumber()
    msk: number;

    @ApiProperty({ description: 'Regions price' })
    @IsNumber()
    regions: number;

    @ApiProperty({ description: 'Product ID' })
    @IsNumber()
    productId: number;

    @ApiProperty({ description: 'Six month price' })
    @IsOptional()
    @IsNumber()
    six?: number;

    @ApiProperty({ description: 'Eleven month price' })
    @IsOptional()
    @IsNumber()
    eleven?: number;
}

class LegalTechValueItemDto {
    @ApiProperty({ description: 'Item number' })
    @IsNumber()
    number: number;

    @ApiProperty({ description: 'Item name' })
    @IsString()
    name: string;

    @ApiProperty({ description: 'Item code' })
    @IsString()
    code: string;

    @ApiProperty({ description: 'Is checked' })
    @IsBoolean()
    checked: boolean;

    @ApiProperty({ description: 'Item weight' })
    @IsNumber()
    weight: number;

    @ApiProperty({ description: 'Item description' })
    @IsString()
    description: string;
}

class LegalTechDto {
    @ApiProperty({ description: 'Display mode' })
    @IsString()
    display: string;

    @ApiProperty({ description: 'Weight LT' })
    @IsNumber()
    weightLt: number;

    @ApiProperty({ description: 'LT included' })
    @IsNumber()
    ltIncluded: number;

    @ApiProperty({ description: 'Packages', type: Object })
    @IsObject()
    packages: Record<string, LegalTechPackageDto>;

    @ApiProperty({
        description:
            'Current package (can be null or object with different structure)',
        required: false,
    })
    @IsOptional()
    @IsObject()
    current?: Record<string, any> | null;

    @ApiProperty({
        description: 'Product (can be null or object with different structure)',
        required: false,
    })
    @IsOptional()
    @IsObject()
    product?: Record<string, any> | null;

    @ApiProperty({ description: 'Groups name' })
    @IsString()
    groupsName: string;

    @ApiProperty({ description: 'Value items', type: [Object] })
    @IsArray()
    @IsObject({ each: true })
    value: LegalTechValueItemDto[];
}

// Consalting types
class ConsaltingPackageDto {
    @ApiProperty({ description: 'Package number' })
    @IsNumber()
    number: number;

    @ApiProperty({ description: 'Package name' })
    @IsString()
    name: string;

    @ApiProperty({ description: 'Package title' })
    @IsString()
    title: string;

    @ApiProperty({ description: 'Package code' })
    @IsString()
    code: string;

    @ApiProperty({ description: 'Package description' })
    @IsString()
    description: string;

    @ApiProperty({ description: 'ABS value' })
    @IsNumber()
    abs: number;

    @ApiProperty({ description: 'Price', required: false })
    @IsOptional()
    @IsNumber()
    price?: number | null;

    @ApiProperty({ description: 'Contract comment', required: false })
    @IsOptional()
    @IsString()
    contractComment?: string;

    @ApiProperty({ description: 'A contract comment', required: false })
    @IsOptional()
    @IsString()
    acontractComment?: string;

    @ApiProperty({ description: 'L contract comment', required: false })
    @IsOptional()
    @IsString()
    lcontractComment?: string;

    @ApiProperty({ description: 'Contract prop', required: false })
    @IsOptional()
    @IsString()
    contractProp?: string;

    @ApiProperty({ description: 'A contract prop', required: false })
    @IsOptional()
    @IsString()
    acontractProp?: string;

    @ApiProperty({ description: 'L contract prop', required: false })
    @IsOptional()
    @IsString()
    lcontractProp?: string;
}

class ConsaltingValueItemDto {
    @ApiProperty({ description: 'Item code' })
    @IsString()
    code: string;

    @ApiProperty({ description: 'Item name' })
    @IsString()
    name: string;

    @ApiProperty({ description: 'Is checked' })
    @IsBoolean()
    checked: boolean;

    @ApiProperty({ description: 'Item weight' })
    @IsNumber()
    weight: number;

    @ApiProperty({ description: 'ABS value' })
    @IsNumber()
    abs: number;

    @ApiProperty({ description: 'Price' })
    @IsNumber()
    price: number;

    @ApiProperty({ description: 'Description' })
    @IsString()
    description: string;
}

class ConsaltingDto {
    @ApiProperty({ description: 'Groups name' })
    @IsString()
    groupsName: string;

    @ApiProperty({
        description:
            'Current package (can be null or object with different structure)',
        required: false,
    })
    @IsOptional()
    @IsObject()
    current?: Record<string, any> | null;

    @ApiProperty({
        description: 'Product (can be null or object with different structure)',
        required: false,
    })
    @IsOptional()
    @IsObject()
    product?: Record<string, any> | null;

    @ApiProperty({ description: 'Display mode' })
    @IsString()
    display: string;

    @ApiProperty({ description: 'Packages', type: Object })
    @IsObject()
    packages: Record<string, ConsaltingPackageDto>;

    @ApiProperty({ description: 'Value items', type: [Object] })
    @IsArray()
    @IsObject({ each: true })
    value: ConsaltingValueItemDto[];
}

// Star types
class StarValueItemDto {
    @ApiProperty({ description: 'Item number' })
    @IsNumber()
    number: number;

    @ApiProperty({ description: 'Item name' })
    @IsString()
    name: string;

    @ApiProperty({ description: 'Item full name' })
    @IsString()
    fullName: string;

    @ApiProperty({ description: 'Moscow price' })
    @IsNumber()
    msk: number;

    @ApiProperty({ description: 'Regions price' })
    @IsNumber()
    regions: number;

    @ApiProperty({ description: 'Description' })
    @IsString()
    description: string;

    @ApiProperty({ description: 'Item type' })
    @IsString()
    type: string;

    @ApiProperty({ description: 'Item weight' })
    @IsNumber()
    weight: number;

    @ApiProperty({ description: 'Item title' })
    @IsString()
    title: string;

    @ApiProperty({ description: 'Is checked' })
    @IsBoolean()
    checked: boolean;
}

class StarItemDto {
    @ApiProperty({ description: 'Item name' })
    @IsString()
    name: string;

    @ApiProperty({ description: 'Item code' })
    @IsString()
    code: string;

    @ApiProperty({ description: 'Item number' })
    @IsNumber()
    number: number;

    @ApiProperty({ description: 'Is checked' })
    @IsBoolean()
    checked: boolean;

    @ApiProperty({ description: 'Item weight' })
    @IsNumber()
    weight: number;

    @ApiProperty({ description: 'Description' })
    @IsString()
    description: string;

    @ApiProperty({ description: 'Is LA' })
    @IsBoolean()
    isLa: boolean;

    @ApiProperty({ description: 'Item full name', required: false })
    @IsOptional()
    @IsString()
    fullName?: string;

    @ApiProperty({ description: 'Moscow price', required: false })
    @IsOptional()
    @IsNumber()
    msk?: number;

    @ApiProperty({ description: 'Regions price', required: false })
    @IsOptional()
    @IsNumber()
    regions?: number;

    @ApiProperty({ description: 'Item type', required: false })
    @IsOptional()
    @IsString()
    type?: string;

    @ApiProperty({ description: 'Item title', required: false })
    @IsOptional()
    @IsString()
    title?: string;
}

class StarPackageDto {
    @ApiProperty({ description: 'Package number' })
    @IsNumber()
    number: number;

    @ApiProperty({ description: 'Package name' })
    @IsString()
    name: string;

    @ApiProperty({ description: 'Package full name' })
    @IsString()
    fullName: string;

    @ApiProperty({ description: 'Moscow price' })
    @IsNumber()
    msk: number;

    @ApiProperty({ description: 'Regions price' })
    @IsNumber()
    regions: number;

    @ApiProperty({ description: 'Description' })
    @IsString()
    description: string;

    @ApiProperty({ description: 'Package type' })
    @IsString()
    type: string;

    @ApiProperty({ description: 'Package weight' })
    @IsNumber()
    weight: number;
}

class StarDto {
    @ApiProperty({ description: 'Groups name' })
    @IsString()
    groupsName: string;

    @ApiProperty({ description: 'Value items', type: [Object] })
    @IsArray()
    @IsObject({ each: true })
    value: StarValueItemDto[];

    @ApiProperty({ description: 'Items', type: [Object] })
    @IsArray()
    @IsObject({ each: true })
    items: StarItemDto[];

    @ApiProperty({ description: 'Package', type: Object, required: false })
    @IsOptional()
    @IsObject()
    package?: StarPackageDto;

    @ApiProperty({
        description: 'Current (can be null or object with different structure)',
        required: false,
    })
    @IsOptional()
    @IsObject()
    current?: Record<string, any> | null;

    @ApiProperty({
        description: 'Product (can be null or object with different structure)',
        required: false,
    })
    @IsOptional()
    @IsObject()
    product?: Record<string, any> | null;
}

// DocumentInfoblock types
class DocumentInfoblockValueItemDto {
    @ApiProperty({ description: 'Item name' })
    @IsString()
    name: string;

    @ApiProperty({ description: 'Item number' })
    @IsNumber()
    number: number;

    @ApiProperty({ description: 'Item code' })
    @IsString()
    code: string;

    @ApiProperty({ description: 'Is checked' })
    @IsBoolean()
    checked: boolean;

    @ApiProperty({ description: 'Item weight' })
    @IsNumber()
    weight: number;

    @ApiProperty({ description: 'Description' })
    @IsString()
    description: string | boolean;

    @ApiProperty({ description: 'Item title', required: false })
    @IsOptional()
    @IsString()
    title?: string;

    @ApiProperty({ description: 'Is LA', required: false })
    @IsOptional()
    @IsBoolean()
    isLa?: boolean;
}

class DocumentInfoblockDto {
    @ApiProperty({ description: 'Groups name' })
    @IsString()
    groupsName: string;

    @ApiProperty({ description: 'Value items', type: [Object] })
    @IsArray()
    @IsObject({ each: true })
    value: DocumentInfoblockValueItemDto[];

    @ApiProperty({ description: 'Fields', type: [String], required: false })
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    fields?: string[];

    @ApiProperty({ description: 'URL', required: false })
    @IsOptional()
    @IsString()
    url?: string;

    @ApiProperty({
        description: 'Current (can be null or object with different structure)',
        required: false,
    })
    @IsOptional()
    @IsObject()
    current?: Record<string, any> | null;

    @ApiProperty({
        description: 'Product (can be null or object with different structure)',
        required: false,
    })
    @IsOptional()
    @IsObject()
    product?: Record<string, any> | null;

    @ApiProperty({ description: 'Display mode', required: false })
    @IsOptional()
    @IsString()
    display?: string;

    @ApiProperty({
        description:
            'Packages (object with string keys and package objects as values)',
        required: false,
    })
    @IsOptional()
    @IsObject()
    packages?: Record<string, Record<string, any>>;
}

// Complect type
class ComplectDto {
    @ApiProperty({ description: 'Complect name' })
    @IsString()
    name: string;

    @ApiProperty({ description: 'Complect title' })
    @IsString()
    title: string;

    @ApiProperty({ description: 'Full title' })
    @IsString()
    fullTitle: string;

    @ApiProperty({ description: 'Short title' })
    @IsString()
    shortTitle: string;

    @ApiProperty({ description: 'Is changing' })
    @IsBoolean()
    isChanging: boolean;

    @ApiProperty({ description: 'Tag' })
    @IsString()
    tag: string;

    @ApiProperty({ description: 'Class name' })
    @IsString()
    className: string;

    @ApiProperty({ description: 'Complect number' })
    @IsNumber()
    number: number;

    @ApiProperty({ description: 'Weight' })
    @IsNumber()
    weight: number;

    @ApiProperty({ description: 'With consalting' })
    @IsBoolean()
    withConsalting: boolean;

    @ApiProperty({ description: 'Filling', type: [String] })
    @IsArray()
    @IsString({ each: true })
    filling: string[];

    @ApiProperty({ description: 'Packets ER', type: [Number] })
    @IsArray()
    @IsNumber({}, { each: true })
    packetsEr: number[];

    @ApiProperty({ description: 'ERS in packet', type: [Number] })
    @IsArray()
    @IsNumber({}, { each: true })
    ersInPacket: number[];

    @ApiProperty({ description: 'ERS', type: [Number] })
    @IsArray()
    @IsNumber({}, { each: true })
    ers: number[];

    @ApiProperty({ description: 'LT', type: [Number] })
    @IsArray()
    @IsNumber({}, { each: true })
    lt: number[];

    @ApiProperty({ description: 'LT in packet', type: [Number] })
    @IsArray()
    @IsNumber({}, { each: true })
    ltInPacket: number[];

    @ApiProperty({ description: 'Free blocks', type: [Number] })
    @IsArray()
    @IsNumber({}, { each: true })
    freeBlocks: number[];

    @ApiProperty({ description: 'Consalting', type: [Number] })
    @IsArray()
    @IsNumber({}, { each: true })
    consalting: number[];

    @ApiProperty({ description: 'Consalting product', type: [Number] })
    @IsArray()
    @IsNumber({}, { each: true })
    consaltingProduct: number[];

    @ApiProperty({ description: 'Complect type' })
    @IsString()
    type: string;

    @ApiProperty({ description: 'With star' })
    @IsBoolean()
    withStar: boolean;

    @ApiProperty({ description: 'Star', type: [Number] })
    @IsArray()
    @IsNumber({}, { each: true })
    star: number[];

    @ApiProperty({ description: 'Regions', type: [Number] })
    @IsArray()
    @IsNumber({}, { each: true })
    regions: number[];
}

export class DocumentSupplyInitFormDto {
    @ApiProperty({ description: 'Domain of the company' })
    @IsString()
    domain: string;

    @ApiProperty({ description: 'ID of the company' })
    @IsString()
    companyId: string;

    @ApiProperty({
        description: 'Type of the contract',
        enum: CONTRACT_LTYPE,
    })
    @IsEnum(CONTRACT_LTYPE)
    contractType: CONTRACT_LTYPE;

    @ApiProperty({
        description: 'Contract data',
        type: ContractDto,
        required: false,
    })
    @IsOptional()
    @ValidateNested()
    @Type(() => ContractDto)
    contract?: ContractDto;

    @ApiProperty({
        description: 'Product set',
        type: ProductRowSetDto,
    })
    @ValidateNested()
    @Type(() => ProductRowSetDto)
    productSet: ProductRowSetDto;

    @ApiProperty({
        description: 'Products array',
        type: [ProductDto],
    })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ProductDto)
    products: ProductDto[];

    @ApiProperty({
        description: 'Product rows (arows)',
        type: [ProductRowDto],
    })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ProductRowDto)
    arows: ProductRowDto[];

    @ApiProperty({
        description: 'Total row',
        type: ProductRowDto,
        required: false,
    })
    @IsOptional()
    @ValidateNested()
    @Type(() => ProductRowDto)
    total?: ProductRowDto | ProductRowDto[];

    @ApiProperty({
        description: 'Current complect',
        type: ComplectDto,
    })
    @ValidateNested()
    @Type(() => ComplectDto)
    complect: ComplectDto;

    @ApiProperty({
        description: 'Consalting data',
        type: ConsaltingDto,
    })
    @ValidateNested()
    @Type(() => ConsaltingDto)
    consalting: ConsaltingDto;

    @ApiProperty({
        description: 'Legal tech data',
        type: LegalTechDto,
        required: false,
    })
    @IsOptional()
    @ValidateNested()
    @Type(() => LegalTechDto)
    legalTech?: LegalTechDto;

    @ApiProperty({
        description: 'Star data',
        type: StarDto,
    })
    @ValidateNested()
    @Type(() => StarDto)
    star: StarDto;

    @ApiProperty({
        description: 'Document infoblocks',
        type: [DocumentInfoblockDto],
        required: false,
    })
    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => DocumentInfoblockDto)
    documentInfoblocks?: DocumentInfoblockDto[];

    @ApiProperty({
        description: 'Is supply report',
        required: false,
        default: false,
    })
    @IsOptional()
    @IsBoolean()
    isSupplyReport?: boolean;
}
