import { IsString } from "class-validator";
import { FormFieldDto } from "@/apps/konstructor/document-generate/dto/form-field/form-field.dto";
import { RqItem } from "@/apps/konstructor/document-generate/type/bx-rq.type";



export enum SupplyReportCodeEnum {
    situation_comments = 'situation_comments',
    sale_date = 'sale_date',
    in_ork = 'in_ork',
    client_call_date = 'client_call_date',
    in_arm = 'in_arm',
    invoice_pay_type = 'invoice_pay_type',
    finance = 'finance',
    is_contract_done = 'is_contract_done',
    contract_number = 'contract_number',
    contract_result = 'contract_result',
    current_contract = 'current_contract',
    is_invoice_done = 'is_invoice_done',
    invoice_result = 'invoice_result',
    current_invoice = 'current_invoice',



   
}
export class SupplyReportDto extends FormFieldDto implements RqItem<SupplyReportCodeEnum> {

    @IsString()
    code: SupplyReportCodeEnum;

 

}

