import { delay } from '@/lib';
import { BitrixService } from '@/modules/bitrix';
import { randomUUID } from 'crypto';
import { BitrixEntityType } from '@/modules/bitrix/domain/enums/bitrix-constants.enum';
export interface IBxTimelinePusherDto {
    companyId: string;
    dealId?: string;
    userId: string;
    message: string;
}
export class BxTimelinePusherService {
    constructor(private readonly bitrix: BitrixService) {}

    public async push(dto: IBxTimelinePusherDto) {
        const { companyId, dealId, userId, message } = dto;
        const uuid = randomUUID();
        await delay(1000);
        console.log('BitrixEntityType.COMPANY', BitrixEntityType.COMPANY);
        this.bitrix.batch.timeline.addTimelineComment(
            `${uuid}_add_timeline_company_${dto.companyId}`,
            {
                ENTITY_ID: companyId,
                ENTITY_TYPE: BitrixEntityType.COMPANY,
                COMMENT: message,
                AUTHOR_ID: userId,
            },
        );

        if (dealId) {
            this.bitrix.batch.timeline.addTimelineComment(
                `${uuid}_add_timeline_deal_${dto.dealId}`,
                {
                    ENTITY_ID: dealId,
                    ENTITY_TYPE: BitrixEntityType.DEAL,
                    COMMENT: message,
                    AUTHOR_ID: userId,
                },
            );
        }
        await this.bitrix.api.callBatchWithConcurrency(1);
    }
}
