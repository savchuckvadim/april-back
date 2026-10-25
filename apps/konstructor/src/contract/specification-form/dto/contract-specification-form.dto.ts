import { Type } from 'class-transformer';
import {
    IsArray,
    IsEnum,
    IsObject,
    IsString,
    ValidateNested,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { ComplectDto } from '@app/konstructor/document-generate/dto/complect/complect.dto';
import { FormFieldDto } from '@app/konstructor/document-generate/dto/form-field/form-field.dto';
import { ProductRowDto } from '@app/konstructor/document-generate/dto/product-row/product-row.dto';
import { ContractSpecificationItemDto } from '@app/konstructor/document-generate/dto/specification/specification.dto';
import { ClientTypeEnum } from '@app/konstructor/document-generate/type/client.type';
import { CONTRACT_LTYPE } from '@app/konstructor/document-generate/type/contract.type';
import { ContractDto } from '@app/konstructor/dto/contract.dto';
import { SupplyDto } from '@app/konstructor/dto/supply.dto';

/** Legal Tech договора: бесплатная часть комплекта и платный пакет — названиями. */
export class ContractSpecificationLtDto {
    @ApiProperty({
        description: 'Бесплатный пакет LT в комплекте (название)',
        type: String,
    })
    @IsString()
    freePacket: string;

    @ApiProperty({ description: 'Сервисы бесплатного LT', type: [String] })
    @IsArray()
    @IsString({ each: true })
    freeServices: string[];

    @ApiProperty({ description: 'Платный пакет LT (название)', type: String })
    @IsString()
    paidPacket: string;

    @ApiProperty({ description: 'Сервисы платного пакета LT', type: [String] })
    @IsArray()
    @IsString({ each: true })
    paidServices: string[];
}

/**
 * Запрос формы договора: те же легаси-формы payload, что уходят в
 * `contract/generate` (ComplectDto, ProductRowDto, SupplyDto, ContractDto).
 * Тексты поставки бэк дорезолвит сам по `supply.code`.
 */
export class ContractSpecificationFormRequestDto {
    @ApiProperty({
        description: 'Тип договора',
        enum: CONTRACT_LTYPE,
        enumName: 'CONTRACT_LTYPE',
    })
    @IsEnum(CONTRACT_LTYPE)
    contractType: CONTRACT_LTYPE;

    @ApiProperty({
        description: 'Тип клиента',
        enum: ClientTypeEnum,
        enumName: 'ClientType',
    })
    @IsEnum(ClientTypeEnum)
    clientType: ClientTypeEnum;

    @ApiProperty({ description: 'Поставка главной строки', type: SupplyDto })
    @IsObject()
    @ValidateNested()
    @Type(() => SupplyDto)
    supply: SupplyDto;

    @ApiProperty({ description: 'Договор главной строки', type: ContractDto })
    @IsObject()
    @ValidateNested()
    @Type(() => ContractDto)
    contract: ContractDto;

    @ApiProperty({ description: 'Строки general-сета', type: [ProductRowDto] })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ProductRowDto)
    rows: ProductRowDto[];

    @ApiProperty({ description: 'Наполнение по группам', type: [ComplectDto] })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ComplectDto)
    complect: ComplectDto[];

    @ApiProperty({
        description: 'Legal Tech договора',
        type: ContractSpecificationLtDto,
    })
    @IsObject()
    @ValidateNested()
    @Type(() => ContractSpecificationLtDto)
    lt: ContractSpecificationLtDto;
}

export class ContractSpecificationFormResponseDto {
    @ApiProperty({
        description: 'Общая форма договора: даты и суммы',
        type: [FormFieldDto],
    })
    contract: FormFieldDto[];

    @ApiProperty({
        description:
            'Спецификация (Приложение) — только применимые к поставке/договору/клиенту строки',
        type: [ContractSpecificationItemDto],
    })
    specification: ContractSpecificationItemDto[];
}
