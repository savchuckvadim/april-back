import { IsArray, IsNumber, IsEnum, IsString, } from "class-validator";
import { Type } from "class-transformer";
import { ValidateNested } from "class-validator";
import { ADDRESS_RQ_ITEM_CODE, BX_ADDRESS_TYPE, RqItem, BANK_RQ_ITEM_CODE, RQ_ITEM_CODE } from "../../type/bx-rq.type";
import { FormFieldDto } from "../form-field/form-field.dto";


export class RQFieldDto extends FormFieldDto implements RqItem<RQ_ITEM_CODE> {

    @IsString()
    code: RQ_ITEM_CODE;

}


export class ARQFieldDto extends FormFieldDto implements RqItem<ADDRESS_RQ_ITEM_CODE> {


    @IsString()
    code: ADDRESS_RQ_ITEM_CODE;

}

export class BRQFieldDto extends FormFieldDto implements RqItem<BANK_RQ_ITEM_CODE> {


    @IsString()
    code: BANK_RQ_ITEM_CODE;

}


export class AddressRqItemDto {
    @IsNumber()
    anchor_id: number;

    @IsEnum(BX_ADDRESS_TYPE)
    type_id: BX_ADDRESS_TYPE;

    @IsString()
    name_type: string; // Можно добавить кастомный валидатор на значения если нужно

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ARQFieldDto)
    fields: ARQFieldDto[];
}





export class BxRqAddressDto {

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => AddressRqItemDto)
    items: AddressRqItemDto[];

}


export class BxRqBankDto {
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => BRQFieldDto)
    fields: BRQFieldDto[];
}


export class BxRqDto {
    address: BxRqAddressDto
    bank: BxRqBankDto
    preset_id: number
    fields: RQFieldDto[]
}