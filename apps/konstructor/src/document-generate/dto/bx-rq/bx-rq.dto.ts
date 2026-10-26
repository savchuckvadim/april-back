import { IsArray, IsNumber, IsEnum, IsString, IsObject } from 'class-validator';
import { Type } from 'class-transformer';
import { ValidateNested } from 'class-validator';
import {
    ADDRESS_RQ_ITEM_CODE,
    BX_ADDRESS_TYPE,
    RqItem,
    BANK_RQ_ITEM_CODE,
    RQ_ITEM_CODE,
} from '../../type/bx-rq.type';
import { FormFieldDto } from '../form-field/form-field.dto';
import { ApiProperty } from '@nestjs/swagger';

export class RQFieldDto extends FormFieldDto implements RqItem<RQ_ITEM_CODE> {
    @ApiProperty({
        description: 'Code of the RQ',
        enum: RQ_ITEM_CODE,
        enumName: 'RqItemCode',
    })
    @IsEnum(RQ_ITEM_CODE, {
        message: 'RQFieldDto code must be a valid RQ_ITEM_CODE',
    })
    code: RQ_ITEM_CODE;
}

export class ARQFieldDto
    extends FormFieldDto
    implements RqItem<ADDRESS_RQ_ITEM_CODE>
{
    @ApiProperty({
        description: 'Code of the RQ',
        enum: ADDRESS_RQ_ITEM_CODE,
        enumName: 'AddressRqItemCode',
    })
    @IsEnum(ADDRESS_RQ_ITEM_CODE, {
        message: 'ARQFieldDto code must be a valid ADDRESS_RQ_ITEM_CODE',
    })
    code: ADDRESS_RQ_ITEM_CODE;
}

export class BRQFieldDto
    extends FormFieldDto
    implements RqItem<BANK_RQ_ITEM_CODE>
{
    @ApiProperty({
        description: 'Code of the RQ',
        enum: BANK_RQ_ITEM_CODE,
        enumName: 'BankRqItemCode',
    })
    @IsEnum(BANK_RQ_ITEM_CODE, {
        message: 'BRQFieldDto code must be a valid BANK_RQ_ITEM_CODE',
    })
    code: BANK_RQ_ITEM_CODE;
}

export class AddressRqItemDto {
    @ApiProperty({ description: 'ID реквизита-владельца адреса', type: Number })
    @IsNumber()
    anchor_id: number;

    @ApiProperty({
        description: 'Тип адреса Bitrix',
        enum: BX_ADDRESS_TYPE,
        enumName: 'BxAddressType',
    })
    @IsEnum(BX_ADDRESS_TYPE, {
        message: 'AddressRqItemDto type_id must be a valid BX_ADDRESS_TYPE',
    })
    type_id: BX_ADDRESS_TYPE;

    @ApiProperty({ description: 'Название типа адреса', type: String })
    @IsString({ message: 'AddressRqItemDto name_type must be a string' })
    name_type: string;

    @ApiProperty({ description: 'Поля адреса', type: [ARQFieldDto] })
    @IsArray({ message: 'AddressRqItemDto fields must be an array' })
    @ValidateNested({
        each: true,
        message:
            'AddressRqItemDto fields each item must be a valid ARQFieldDto',
    })
    @Type(() => ARQFieldDto)
    fields: ARQFieldDto[];
}

export class BxRqAddressDto {
    @ApiProperty({ description: 'Адреса реквизита', type: [AddressRqItemDto] })
    @IsArray({ message: 'BxRqAddressDto items must be an array' })
    @ValidateNested({
        each: true,
        message:
            'BxRqAddressDto items each item must be a valid AddressRqItemDto',
    })
    @Type(() => AddressRqItemDto)
    items: AddressRqItemDto[];
}

export class BxRqBankItemDto {
    @ApiProperty({ description: 'Id of the RQ' })
    @IsNumber()
    id: number;

    @ApiProperty({ description: 'Поля банка', type: [BRQFieldDto] })
    @IsArray({ message: 'BxRqBankDto fields must be an array' })
    @ValidateNested({
        each: true,
        message: 'BxRqBankDto fields each item must be a valid BRQFieldDto',
    })
    @Type(() => BRQFieldDto)
    fields: BRQFieldDto[];
}

export class BxRqBankDto {
    @ApiProperty({ description: 'Текущий банк', type: BxRqBankItemDto })
    @IsObject()
    @ValidateNested({
        message: 'BxRqBankDto current must be a valid BxRqBankItemDto',
    })
    @Type(() => BxRqBankItemDto)
    current: BxRqBankItemDto;

    @ApiProperty({ description: 'Банки реквизита', type: [BxRqBankItemDto] })
    @IsArray({ message: 'BxRqBankDto items must be an array' })
    @ValidateNested({
        each: true,
        message: 'BxRqBankDto items each item must be a valid BxRqBankItemDto',
    })
    @Type(() => BxRqBankItemDto)
    items: BxRqBankItemDto[];
}

export class BxRqDto {
    @ApiProperty({ description: 'Адреса', type: BxRqAddressDto })
    @IsObject()
    @ValidateNested({
        message: 'BxRqDto address must be a valid BxRqAddressDto',
    })
    @Type(() => BxRqAddressDto)
    address: BxRqAddressDto;

    @ApiProperty({ description: 'Банки', type: BxRqBankDto })
    @IsObject()
    @ValidateNested({ message: 'BxRqDto bank must be a valid BxRqBankDto' })
    @Type(() => BxRqBankDto)
    bank: BxRqBankDto;

    @ApiProperty({ description: 'Preset ID of the RQ' })
    @IsNumber()
    preset_id: number;

    @ApiProperty({ description: 'Базовые поля реквизита', type: [RQFieldDto] })
    @IsArray({ message: 'BxRqDto fields must be an array' })
    @ValidateNested({
        each: true,
        message: 'BxRqDto fields each item must be a valid RQFieldDto',
    })
    @Type(() => RQFieldDto)
    fields: RQFieldDto[];
}
