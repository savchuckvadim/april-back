import { BxTimelinePusherService } from '@/apps/konstructor/bx-timeliene-pusher/bx-timeline-pusher.service';
import { PBXService } from '@/modules/pbx/pbx.service';
import { Injectable } from '@nestjs/common';
import { IResultDocumentLink } from '../../interface/document.interface';

export interface ITimeLineSendData {
    domain: string;
    companyId: string;
    userId: number;
    documents: IResultDocumentLink[];
    dealId?: string;
}
@Injectable()
export class OfferBxTimelineService {
    constructor(private readonly pbx: PBXService) {}
    public async sendDocumentToBitrix(data: ITimeLineSendData) {
        const { bitrix } = await this.pbx.init(data.domain);
        const commentMessage = this.getCommentMessage(data.documents);
        const timelinePusher = new BxTimelinePusherService(bitrix);
        await timelinePusher.push({
            companyId: data.companyId,
            userId: data.userId,
            message: commentMessage,
            dealId: data.dealId,
        });
    }

    private getCommentMessage(documents: IResultDocumentLink[]) {
        return documents
            .map(document =>
                this.getDocumentMessage(
                    document.link,
                    document.name,
                    document.type,
                ),
            )
            .join(' ');
    }
    private getDocumentMessage(
        link: string,
        documentName: string,
        type: 'offer' | 'invoice',
    ) {
        const icon = type === 'offer' ? '📝' : '🧾';

        const message = `${icon} <a href="${link}" target="_blank">${documentName}</a> \n`;
        return message;
    }
}
