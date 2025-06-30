import { IsArray, IsString } from "class-validator";
import { RqItem } from "../../type/bx-rq.type";
import { FormFieldDto } from "../form-field/form-field.dto";
import { Type } from "class-transformer";
import { ValidateNested } from "class-validator";


export enum ContractSpecificationCodeEnum {
    IBIG = 'specification_ibig',
    ISMALL = 'specification_ismall',
    IBLOCKS = 'specification_iblocks',
    IERS = 'specification_ers',
    IERS_PACKETS = 'specification_ers_packets',
    IERS_IN_PACKETS = 'specification_ers_in_packets',
    IFREE = 'specification_ifree',
    LT_FREE = 'specification_lt_free',
    LT_FREE_SERVICES = 'specification_lt_free_services',
    LT_PACKET = 'specification_lt_packet',
    LT_SERVICES = 'specification_lt_services',
    SERVICES = 'specification_services',
    SUPPLY = 'specification_supply',
    SUPPLY_COMMENT = 'specification_supply_comment',
    DISTRIBUTIVE = 'specification_distributive',
    DISTRIBUTIVE_COMMENT = 'specification_distributive_comment',
    DWAY = 'specification_dway',
    DWAY_COMMENT = 'specification_dway_comment',
    SERVICE_PERIOD = 'specification_service_period',
    SUPPLY_QUANTITY = 'specification_supply_quantity',
    KEY_PERIOD = 'specification_key_period',
    ABON_LONG = 'abon_long',
    LIC_LONG = 'lic_long',
    // CONTRACT_INTERNET_EMAIL = 'contract_internet_email',
    EMAIL_COMMENT = 'specification_email_comment',
    PK = 'specification_pk',
    PK_COMMENT1 = 'specification_pk_comment1',
    PK_COMMENT = 'specification_pk_comment',
    COMPLECT_NAME = 'complect_name',
    


   
}
export class ContractSpecificationItemDto extends FormFieldDto implements RqItem<ContractSpecificationCodeEnum> {

    @IsString()
    code: ContractSpecificationCodeEnum;

}

export class ContractSpecificationDto {
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ContractSpecificationItemDto)
    items: ContractSpecificationItemDto[];
} 