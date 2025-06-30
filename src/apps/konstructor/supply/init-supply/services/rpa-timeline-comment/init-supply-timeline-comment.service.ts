import { PortalModel } from "@/modules/portal/services/portal.model"
import { InitSupplyDto } from "../../dto/init-supply.dto"

import { Injectable } from "@nestjs/common"
import { ArmCommentService } from "./arm-comment.service"
import { ProviderCommentService } from "./provider-comment.service"
import { RqCommentService } from "./rq-comment.service"
import { ComplectCommentService } from "./complect-comment.service"
import { InfoblockConsaltingService } from "./infoblock/infoblock-consalting.service"
import { InfoblocksCommentService } from "./infoblocks-comment.service"
import { ContractCommentService } from "./contract-comment.service"
import { TotalSumCommentService } from "./total-comment.service"



@Injectable()
export class InitSupplyTimelineCommentService {
    constructor(
        private readonly armCommentService: ArmCommentService,
        private readonly providerCommentService: ProviderCommentService,
        private readonly rqCommentService: RqCommentService,
        private readonly infoblockConsaltingService: InfoblockConsaltingService,
        private readonly complectCommentService: ComplectCommentService,
        private readonly infoblocksCommentService: InfoblocksCommentService,
        private readonly contractCommentService: ContractCommentService,
        private readonly totalSumCommentService: TotalSumCommentService
    ) { }

    public async getTimelineComment(dto: InitSupplyDto, PortalModel: PortalModel): Promise<string> {
        let timelineComment = ''
        const armComment = this.armCommentService.getArmString(dto.clientArmId, dto.complectArmIds)

        if (armComment) {
            timelineComment += armComment
        }
        const providerComment = await this.providerCommentService.getProviderComment(dto)
        if (providerComment) {
            timelineComment += providerComment
        }
        const rqComment = this.rqCommentService.getRqComment(dto)
        if (rqComment) {
            timelineComment += rqComment
        }
        /*
        COMPLECT
        */
        const complectComment = this.complectCommentService.getComplectComment(dto)
        if (complectComment) {
            timelineComment += complectComment
        }
        /*
        CONSULTING
        */
        const infoblockConsaltingComment = this.infoblockConsaltingService.getInfoblockConsaltingComment(dto.contractSpecificationState)
        if (infoblockConsaltingComment) {
            timelineComment += infoblockConsaltingComment
        }

        /*
        INFOBLOCKS
        */
        const infoblocksComment = this.infoblocksCommentService.getInfoblocksComment(dto)
        if (infoblocksComment) {
            timelineComment += infoblocksComment
        }


        /*
        CONTRACT
        */
        const contractComment = this.contractCommentService.getContractComment(dto)
        if (contractComment) {
            timelineComment += contractComment
        }
        /*
        TOTAL SUM
        */
        const totalSumComment = this.totalSumCommentService.getTotalSumComment(dto)
        if (totalSumComment) {
            timelineComment += totalSumComment
        }

        return timelineComment
    }


}