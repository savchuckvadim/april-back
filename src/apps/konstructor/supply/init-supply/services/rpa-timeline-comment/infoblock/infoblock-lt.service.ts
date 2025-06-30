import { Injectable } from "@nestjs/common";
import { InitSupplyDto } from "../../../dto/init-supply.dto";
import { ContractSpecificationCodeEnum } from "@/apps/konstructor/document-generate/dto/specification/specification.dto";
import { RpaCommentHelper, RpaIconEnum } from "../lib/rpa-comment-helper.service";

@Injectable()
export class InfoblockLtService {




    getLtComment(dto: InitSupplyDto): string {

        const freeLtComment = this.getLt(dto, 'free')
        const paidLtComment = this.getLt(dto, 'paid')
        let result = ''
        if (freeLtComment) {
            result += freeLtComment
        }
        if (paidLtComment) {
            result += paidLtComment
        }
        return result
    }

    getLt(dto: InitSupplyDto, type: 'free' | 'paid'): string {

        const isFree = type === 'free'
        const packetLt = dto.contractSpecificationState.items.find(item => isFree ? item.code === ContractSpecificationCodeEnum.LT_FREE : item.code === ContractSpecificationCodeEnum.LT_PACKET)
        const packetLtValue = packetLt?.value as string
        if (packetLtValue) {
            // const packetLtList = packetLtValue.split('\n').map(item => item.trim()).filter(item => item !== '')
            // const packetLtString = RpaCommentHelper.getList(packetLtList)
            const packetLtComment = RpaCommentHelper.getHeaderWithIcon(RpaIconEnum.INFOBLOCK, isFree ? 'Бесплатный LegalTech: ' : 'Платный LegalTech: ')


            const servicesData = dto.contractSpecificationState.items.find(item => isFree ? item.code === ContractSpecificationCodeEnum.LT_FREE_SERVICES : item.code === ContractSpecificationCodeEnum.LT_SERVICES)
            const servicesDataValue = servicesData?.value as string
            const servicesList = servicesDataValue.split('\n').map(item => item.trim()).filter(item => item !== '')

            const ltComment = RpaCommentHelper.getListWithBold([{
                head: packetLtValue,
                value: RpaCommentHelper.getList(servicesList)
            }])



            return `${packetLtComment} ${ltComment}`

        }
        return ''
    }
}