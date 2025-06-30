import { Injectable } from "@nestjs/common";
import { InitSupplyDto } from "../../dto/init-supply.dto";
import { CONTRACT_LTYPE } from "@/apps/konstructor/document-generate/type/contract.type";
import { ContractSpecificationCodeEnum } from "@/apps/konstructor/document-generate/dto/specification/specification.dto";
import { RpaCommentHelper, RpaIconEnum } from "./lib/rpa-comment-helper.service";

@Injectable()
export class ContractCommentService {

    getContractComment(dto: InitSupplyDto): string {
        let comment = ''

        const contractTypeCode = dto.contractType
        if (contractTypeCode === CONTRACT_LTYPE.LIC) {
            

            const licenseLong = dto.contractSpecificationState.items.find(item => item.code === ContractSpecificationCodeEnum.LIC_LONG)
            const licenseLongValue = licenseLong?.value as string
            if (licenseLongValue && licenseLong?.name) {
                const licenseLongList = licenseLongValue.split('\n').map(item => item.trim()).filter(item => item !== '')
             
                const paragrafName = RpaCommentHelper.getHeaderWithIcon(RpaIconEnum.CONTRACT, licenseLong?.name as string)
                const licenseLongString = RpaCommentHelper.getList(licenseLongList)
                comment += `${paragrafName} ${licenseLongString}`
            }

       
        }

        return comment
    }
}