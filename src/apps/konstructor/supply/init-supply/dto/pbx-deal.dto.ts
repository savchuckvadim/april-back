import { EntityFormFieldDto } from "@/apps/konstructor/document-generate/dto/entity-form-field/entity-form-field.dto";
import { Type } from "class-transformer";
import { ValidateNested } from "class-validator";


/**
 * contract_end
 * contract_start
 * first_pay_date
 * supply_comment
 * supply_date
 */

export enum PbxDealEnum{
    // contract_create_date = 'contract_create_date',
    first_pay_date = "first_pay_date", //Дата первой оплаты
    supply_date = "supply_date",
    contract_start = "contract_start", //Дейстивие договора с
    contract_end = "contract_end", //Действие договора до
    garant_client_assigned_name = 'garant_client_assigned_name', //Ответственный за получ справочника
    garant_client_assigned_phone = 'garant_client_assigned_phone',
    // garant_client_assigned_email = 'garant_client_assigned_email',
  
    // contract_present_start = 'contract_present_start',
    // contract_present_end = 'contract_present_end',
  
    garant_client_email = 'garant_client_email',
    // supply_comment = 'supply_comment',
  
    //supply
    // supply_is_contract_done = 'is_contract_done',
    // supply_contract_number = 'contract_number',
    // supply_contract_result = 'contract_result',
    // supply_is_invoice_done = 'is_invoice_done',
    // supply_invoice_number = 'invoice_number',
    // supply_invoice_result = 'invoice_result',
    // supply_current_contract = 'current_contract',
    // supply_current_invoice = 'current_invoice',
    // supply_situation_comments = 'situation_comments',
    // supply_sale_date = 'sale_date',
    // supply_client_call_date = 'client_call_date',
    // PROVIDER = "document_provider",
}

export class PbxDealDto {

    // @ValidateNested()
    // @Type(() => EntityFormFieldDto)
    // [PbxDealEnum.contract_create_date]: EntityFormFieldDto;

    @ValidateNested()
    @Type(() => EntityFormFieldDto)
    [PbxDealEnum.first_pay_date]: EntityFormFieldDto;

    @ValidateNested()
    @Type(() => EntityFormFieldDto)
    [PbxDealEnum.supply_date]: EntityFormFieldDto;

    @ValidateNested()
    @Type(() => EntityFormFieldDto)
    [PbxDealEnum.contract_start]: EntityFormFieldDto;

    @ValidateNested()
    @Type(() => EntityFormFieldDto)
    [PbxDealEnum.contract_end]: EntityFormFieldDto;

    @ValidateNested()
    @Type(() => EntityFormFieldDto)
    [PbxDealEnum.garant_client_assigned_name]: EntityFormFieldDto;

    @ValidateNested()
    @Type(() => EntityFormFieldDto)
    [PbxDealEnum.garant_client_assigned_phone]: EntityFormFieldDto;

    // @ValidateNested()
    // @Type(() => EntityFormFieldDto)
    // [PbxDealEnum.garant_client_assigned_email]: EntityFormFieldDto;

    // @ValidateNested()
    // @Type(() => EntityFormFieldDto)
    // [PbxDealEnum.contract_present_start]: EntityFormFieldDto;

    // @ValidateNested()
    // @Type(() => EntityFormFieldDto)
    // [PbxDealEnum.contract_present_end]: EntityFormFieldDto;

    @ValidateNested()
    @Type(() => EntityFormFieldDto)
    [PbxDealEnum.garant_client_email]: EntityFormFieldDto;

    // @ValidateNested()
    // @Type(() => EntityFormFieldDto)
    // [PbxDealEnum.supply_comment]: EntityFormFieldDto;

    // @ValidateNested()
    // @Type(() => EntityFormFieldDto)
    // [PbxDealEnum.supply_is_contract_done]: EntityFormFieldDto;

    // @ValidateNested()
    // @Type(() => EntityFormFieldDto)
    // [PbxDealEnum.supply_contract_number]: EntityFormFieldDto;

    // @ValidateNested()
    // @Type(() => EntityFormFieldDto)
    // [PbxDealEnum.supply_contract_result]: EntityFormFieldDto;

    // @ValidateNested()
    // @Type(() => EntityFormFieldDto)
    // [PbxDealEnum.supply_is_invoice_done]: EntityFormFieldDto;

    // @ValidateNested()
    // @Type(() => EntityFormFieldDto)
    // [PbxDealEnum.supply_invoice_number]: EntityFormFieldDto;

    // @ValidateNested()
    // @Type(() => EntityFormFieldDto)
    // [PbxDealEnum.supply_invoice_result]: EntityFormFieldDto;

    // @ValidateNested()
    // @Type(() => EntityFormFieldDto)
    // [PbxDealEnum.supply_current_contract]: EntityFormFieldDto;

    // @ValidateNested()
    // @Type(() => EntityFormFieldDto)
    // [PbxDealEnum.supply_current_invoice]: EntityFormFieldDto;

    // @ValidateNested()
    // @Type(() => EntityFormFieldDto)
    // [PbxDealEnum.supply_situation_comments]: EntityFormFieldDto;
}

