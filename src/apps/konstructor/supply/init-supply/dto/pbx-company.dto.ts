import { EntityFormFieldDto } from "@/apps/konstructor/document-generate/dto/entity-form-field/entity-form-field.dto";
import { Type } from "class-transformer";
import { ValidateNested } from "class-validator";


export enum PbxCompanyEnum{
    op_client_type = "op_client_type",
    op_category = 'op_category',
    STATUS = "op_client_status",
    op_source_select = "op_source_select",
    CONCURENT = "op_concurents",
    SINFORMATION = "supply_information",
    manager_op = "manager_op",
    manager_tmc = "manager_tmc",
}

export class PbxCompanyDto {
    @ValidateNested({ message: 'op_client_type must be a valid EntityFormFieldDto' })
    @Type(() => EntityFormFieldDto)
    [PbxCompanyEnum.op_client_type]: EntityFormFieldDto;
    
    @ValidateNested({ message: 'op_category must be a valid EntityFormFieldDto' })
    @Type(() => EntityFormFieldDto)
    [PbxCompanyEnum.op_category]: EntityFormFieldDto;
    
    @ValidateNested({ message: 'STATUS must be a valid EntityFormFieldDto' })
    @Type(() => EntityFormFieldDto)
    [PbxCompanyEnum.STATUS]: EntityFormFieldDto;
    
    @ValidateNested({ message: 'op_source_select must be a valid EntityFormFieldDto' })
    @Type(() => EntityFormFieldDto)
    [PbxCompanyEnum.op_source_select]: EntityFormFieldDto;
    
    @ValidateNested({ message: 'CONCURENT must be a valid EntityFormFieldDto' })
    @Type(() => EntityFormFieldDto)
    [PbxCompanyEnum.CONCURENT]: EntityFormFieldDto;
    
    @ValidateNested({ message: 'supply_information must be a valid EntityFormFieldDto' })
    @Type(() => EntityFormFieldDto)
    [PbxCompanyEnum.SINFORMATION]: EntityFormFieldDto;
    
    @ValidateNested({ message: 'manager_op must be a valid EntityFormFieldDto' })
    @Type(() => EntityFormFieldDto)
    [PbxCompanyEnum.manager_op]: EntityFormFieldDto;
    
    @ValidateNested({ message: 'manager_tmc must be a valid EntityFormFieldDto' })
    @Type(() => EntityFormFieldDto)
    [PbxCompanyEnum.manager_tmc]: EntityFormFieldDto;
}

