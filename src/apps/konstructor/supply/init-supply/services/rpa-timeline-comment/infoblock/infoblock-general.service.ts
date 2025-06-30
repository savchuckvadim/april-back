import { ContractSpecificationCodeEnum, ContractSpecificationDto } from "@/apps/konstructor/document-generate/dto/specification/specification.dto"
import { Injectable } from "@nestjs/common"
import {  RpaCommentHelper, RpaIconEnum } from "../lib/rpa-comment-helper.service"
import { IconHelper } from "../lib/icon-helper.service"
@Injectable()
export class InfoblockGeneralService {

    getInfoblockGeneralComment(contractSpecification: ContractSpecificationDto): string {
        const infoblockGeneral = contractSpecification.items.find(item => item.code === ContractSpecificationCodeEnum.IBLOCKS)
        const infoblockGeneralValue = infoblockGeneral?.value as string
        const ersData = contractSpecification.items.find(item => item.code === ContractSpecificationCodeEnum.IERS)

        const ersDataValue = ersData?.value as string


        const ersDataList = ersDataValue.split('\n').map(item => item.trim())


        let comment = ''
        if (infoblockGeneralValue) {
            const iblocks = infoblockGeneralValue.split('\n').map(item => item.trim())

            const list = [...iblocks]
            if (ersDataList) {
                list.push(...ersDataList)
            }


            comment = `
            ${RpaCommentHelper.getHeaderWithIcon(RpaIconEnum.INFOBLOCK, 'Информационные блоки: ')}
            ${RpaCommentHelper.getList(list)}
            `
           
        }
        const packets = this.getErPacketsComment(contractSpecification)
        if (packets) {
            comment += packets
        }
        const freeBlocksComment = this.getFreeBlocksComment(contractSpecification)
        if (freeBlocksComment) {
            comment += freeBlocksComment
        }
        return comment;
    }

    private getFreeBlocksComment(contractSpecification: ContractSpecificationDto): string {
        const freeBlocks = contractSpecification.items.find(item => item.code === ContractSpecificationCodeEnum.IFREE)
        const freeBlocksValue = freeBlocks?.value as string

        if (freeBlocksValue) {
            const list = freeBlocksValue.split('\n').map(item => item.trim())
            return `
            ${RpaCommentHelper.getHeaderWithIcon(RpaIconEnum.INFOBLOCK, 'Бесплатные блоки: ')}
            ${RpaCommentHelper.getList(list)}
            `
        }
        return '';
    }

    private getErPacketsComment(contractSpecification: ContractSpecificationDto): string {

        const packetErsData = contractSpecification.items.find(item => item.code === ContractSpecificationCodeEnum.IERS_PACKETS)
        const ersInPacket = contractSpecification.items.find(item => item.code === ContractSpecificationCodeEnum.IERS_IN_PACKETS)


        const packetErsDataValue = packetErsData?.value as string
        const ersInPacketValue = ersInPacket?.value as string

        const packetErsDataList = packetErsDataValue.split('Пакет').map(item => item.trim()) as string[]
        const ersInPacketList = ersInPacketValue.split('\n').map(item => item.trim())

        let packets = '' as string
        if (packetErsDataList && ersInPacketList) {
            packets = RpaCommentHelper.getListWithBold([{
                head: packetErsDataList.join(', Пакет ').replace(/^,\s*/, ''),
                value: RpaCommentHelper.getList(ersInPacketList)
            }])

        }
        return packets
    }

    
}