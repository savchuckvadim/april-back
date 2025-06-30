import { IsArray, IsNumber, IsEnum, IsString, IsObject, } from "class-validator";
import { Type } from "class-transformer";
import { ValidateNested } from "class-validator";
import { ADDRESS_RQ_ITEM_CODE, BX_ADDRESS_TYPE, RqItem, BANK_RQ_ITEM_CODE, RQ_ITEM_CODE } from "../../type/bx-rq.type";
import { FormFieldDto } from "../form-field/form-field.dto";
import { ApiProperty } from "@nestjs/swagger";


export class RQFieldDto extends FormFieldDto implements RqItem<RQ_ITEM_CODE> {
    @ApiProperty({ description: 'Code of the RQ' })
    @IsEnum(RQ_ITEM_CODE, { message: 'RQFieldDto code must be a valid RQ_ITEM_CODE' })
    code: RQ_ITEM_CODE;

}


export class ARQFieldDto extends FormFieldDto implements RqItem<ADDRESS_RQ_ITEM_CODE> {


    @ApiProperty({ description: 'Code of the RQ' })
    @IsEnum(ADDRESS_RQ_ITEM_CODE, { message: 'ARQFieldDto code must be a valid ADDRESS_RQ_ITEM_CODE' })
    code: ADDRESS_RQ_ITEM_CODE;

}

export class BRQFieldDto extends FormFieldDto implements RqItem<BANK_RQ_ITEM_CODE> {


    @ApiProperty({ description: 'Code of the RQ' })
    @IsEnum(BANK_RQ_ITEM_CODE, { message: 'BRQFieldDto code must be a valid BANK_RQ_ITEM_CODE' })
    code: BANK_RQ_ITEM_CODE;

}


export class AddressRqItemDto {
    @ApiProperty({ description: 'AddressRqItemDto anchor_id must be a number' })
    @IsNumber()
    anchor_id: number;

    @ApiProperty({ description: 'AddressRqItemDto type_id must be a valid BX_ADDRESS_TYPE' })
    @IsEnum(BX_ADDRESS_TYPE, { message: 'AddressRqItemDto type_id must be a valid BX_ADDRESS_TYPE' })    
    type_id: BX_ADDRESS_TYPE;

    @ApiProperty({ description: 'AddressRqItemDto name_type must be a string' })
    @IsString({ message: 'AddressRqItemDto name_type must be a string' })
    name_type: string;

    @ApiProperty({ description: 'AddressRqItemDto fields must be an array' })
    @IsArray({ message: 'AddressRqItemDto fields must be an array' })
    @ValidateNested({ each: true, message: 'AddressRqItemDto fields each item must be a valid ARQFieldDto' })
    @Type(() => ARQFieldDto)
    fields: ARQFieldDto[];
}





export class BxRqAddressDto {

    @ApiProperty({ description: 'Items of the RQ' })
    @IsArray({ message: 'BxRqAddressDto items must be an array' })
    @ValidateNested({ each: true, message: 'BxRqAddressDto items each item must be a valid AddressRqItemDto' })
    @Type(() => AddressRqItemDto)
    items: AddressRqItemDto[];

}




export class BxRqBankItemDto {

    @ApiProperty({ description: 'Id of the RQ' })
    @IsNumber()
    id: number;
    
    @ApiProperty({ description: 'Fields of the RQ' })
    @IsArray({ message: 'BxRqBankDto fields must be an array' })
    @ValidateNested({ each: true, message: 'BxRqBankDto fields each item must be a valid BRQFieldDto' })
    @Type(() => BRQFieldDto)
    fields: BRQFieldDto[];
}

export class BxRqBankDto {

    @ApiProperty({ description: 'Current of the RQ' })
    @IsObject()
    @ValidateNested({ message: 'BxRqBankDto current must be a valid BxRqBankItemDto' })
    @Type(() => BxRqBankItemDto)
    current: BxRqBankItemDto;

    @ApiProperty({ description: 'Items of the RQ' })
    @IsArray({ message: 'BxRqBankDto items must be an array' })
    @ValidateNested({ each: true, message: 'BxRqBankDto items each item must be a valid BxRqBankItemDto' })
    @Type(() => BxRqBankItemDto)
    items: BxRqBankItemDto[];
}


export class BxRqDto {
    @ApiProperty({ description: 'Address of the RQ' })
    @IsObject()
    @ValidateNested({ message: 'BxRqDto address must be a valid BxRqAddressDto' })
    @Type(() => BxRqAddressDto)
    address: BxRqAddressDto

    @ApiProperty({ description: 'Bank of the RQ' })
    @IsObject()
    @ValidateNested({ message: 'BxRqDto bank must be a valid BxRqBankDto' })
    @Type(() => BxRqBankDto)
    bank: BxRqBankDto

    @ApiProperty({ description: 'Preset ID of the RQ' })
    @IsNumber()
    preset_id: number

    @ApiProperty({ description: 'Fields of the RQ' })
    @IsArray({ message: 'BxRqDto fields must be an array' })
    @ValidateNested({ each: true, message: 'BxRqDto fields each item must be a valid RQFieldDto' })
    @Type(() => RQFieldDto)
    fields: RQFieldDto[]
}