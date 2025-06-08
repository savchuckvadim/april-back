import { PBXService } from "src/modules/pbx/pbx.servise";
import { ContractGenerateDto } from "../dto/contract-generate.dto";
import { BitrixEntityType } from "src/modules/bitrix";
import { Injectable } from "@nestjs/common";

@Injectable()
export class ContractBitrixPushService {
    constructor(
        private readonly pbx: PBXService
    ) { }



    public async setInBitrix(
        dto: ContractGenerateDto,
        link: string,
        documentName: string,
    ) {

        const companyId = dto.companyId;
        const userId = dto.userId;
        const dealId = dto.dealId;

        const { bitrix } = await this.pbx.init(dto.domain)
        const commentMessage = this.getCommentMessage(link, documentName);

        bitrix.batch.timeline.addTimelineComment(
            `add_timeline_company_${companyId}`,
            {
                ENTITY_ID: companyId,
                ENTITY_TYPE: BitrixEntityType.COMPANY,
                COMMENT: commentMessage,
                AUTHOR_ID: userId.toString(),
            }
        );

        if (dealId) {
            bitrix.batch.timeline.addTimelineComment(
                `add_timeline_deal_${dealId}`,
                {
                    ENTITY_ID: dealId,
                    ENTITY_TYPE: BitrixEntityType.DEAL,
                    COMMENT: commentMessage,
                    AUTHOR_ID: userId.toString(),
                }
            );
        }

        await bitrix.api.callBatchWithConcurrency(1);
    }

    private getCommentMessage(link: string, documentName: string) {
        const message = `📝 <a href="${link}" target="_blank">${documentName}</a>`;
        return message;
    }
}
