import { Injectable } from '@nestjs/common';
import { ContractSpecificationCodeEnum } from '@/apps/konstructor/document-generate/dto/specification/specification.dto';
import {
    RpaCommentHelper,
    RpaIconEnum,
} from './lib/rpa-comment-helper.service';
import { InitSupplyDto } from '../../dto/init-supply.dto';
import { CONTRACT_LTYPE } from '@/apps/konstructor/document-generate/type/contract.type';
import { ContractTypeService } from './lib/contract-type.service';

@Injectable()
export class ComplectCommentService {
    public getComplectComment(dto: InitSupplyDto): string {
        const supplyName = this.getSupplyNameComment(dto);
        const contractTypeName = this.getContractTypeNameComment(dto);

        const contractSpecification = dto.contractSpecificationState;
        const complectName = contractSpecification.items.find(
            item => item.code === ContractSpecificationCodeEnum.COMPLECT_NAME,
        );
        let complectNameValue = complectName?.value as string;

        if (complectNameValue) {
            if (supplyName) {
                complectNameValue = `${complectNameValue},  ${RpaCommentHelper.getBoldString(supplyName)}`;
            }
            if (contractTypeName) {
                complectNameValue = `${complectNameValue},  ${RpaCommentHelper.getBoldString(contractTypeName)}`;
            }
            const list = [complectNameValue];
            return `
            ${RpaCommentHelper.getHeaderWithIcon(RpaIconEnum.COMPLECT, 'Наименование комплекта: ')}
            ${RpaCommentHelper.getList(list)}
            `;
        }
        return '';
    }
    getSupplyNameComment(dto: InitSupplyDto): string {
        const supplyName = dto.supply.name;
        return RpaCommentHelper.getBoldString(supplyName);
    }
    getContractTypeNameComment(dto: InitSupplyDto): string {
        const contractTypeName = ContractTypeService.getContractTypeName(dto);
        return contractTypeName
            ? RpaCommentHelper.getBoldString(contractTypeName)
            : '';
    }
}
