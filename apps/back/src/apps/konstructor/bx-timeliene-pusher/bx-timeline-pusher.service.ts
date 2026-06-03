import { BitrixService, IBXTimelineComment } from '@/modules/bitrix';
import { randomUUID } from 'crypto';
import { BitrixEntityType } from '@/modules/bitrix/domain/enums/bitrix-constants.enum';
export interface IBxTimelinePusherDto {
    companyId: string;
    dealId?: string;
    userId: number | string;
    message: string;
    files?: [string, string][]; // [['file name', 'file content'], ['file name', 'file content']];
}
export class BxTimelinePusherService {
    constructor(private readonly bitrix: BitrixService) {}

    public async push(dto: IBxTimelinePusherDto, isError?: boolean) {
        const { companyId, dealId, userId, message } = dto;
        const uuid = randomUUID();

        const data: IBXTimelineComment = {
            ENTITY_ID: companyId,
            ENTITY_TYPE: BitrixEntityType.COMPANY,
            COMMENT: `${message}`,
            AUTHOR_ID: userId.toString(),
        };
        if (isError) {
            data.COMMENT = `❌ ${message}`;
        } else {
            if (dto.files) {
                data.FILES = dto.files;
            }
            this.bitrix.batch.timeline.addTimelineComment(
                `${uuid}_add_timeline_company_${dto.companyId}`,
                data,
            );
        }
        if (dealId) {
            data.ENTITY_ID = dealId;
            data.ENTITY_TYPE = BitrixEntityType.DEAL;
            this.bitrix.batch.timeline.addTimelineComment(
                `${uuid}_add_timeline_deal_${dto.dealId}`,
                data,
            );
        }
        await this.bitrix.api.callBatchWithConcurrency(1);
    }
}
