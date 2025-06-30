import { Injectable } from "@nestjs/common";
import { InitSupplyDto } from "../../dto/init-supply.dto";
import { InfoblockOtherService } from "./infoblock/infoblock-other.service";
import { InfoblockLtService } from "./infoblock/infoblock-lt.service";
import { InfoblockGeneralService } from "./infoblock/infoblock-general.service";

@Injectable()
export class InfoblocksCommentService {

    constructor(
        private readonly infoblockGeneralService: InfoblockGeneralService,
        private readonly infoblockOtherService: InfoblockOtherService,
        private readonly infoblockLtService: InfoblockLtService
    ) { }

    getInfoblocksComment(dto: InitSupplyDto): string {
        let timelineComment = '';
        const infoblockGeneralComment = this.infoblockGeneralService.getInfoblockGeneralComment(dto.contractSpecificationState)
        if (infoblockGeneralComment) {
            timelineComment += infoblockGeneralComment
        }
        const infoblockOtherComment = this.infoblockOtherService.getInfoblockOtherComment(dto)
        if (infoblockOtherComment) {
            timelineComment += infoblockOtherComment
        }
        const infoblockLtComment = this.infoblockLtService.getLtComment(dto)
        if (infoblockLtComment) {
            timelineComment += infoblockLtComment
        }
        return timelineComment;
    }
}