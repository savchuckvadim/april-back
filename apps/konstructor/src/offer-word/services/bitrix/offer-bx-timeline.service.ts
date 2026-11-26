import { BxTimelinePusherService } from '@app/konstructor/bx-timeliene-pusher/bx-timeline-pusher.service';
import { toBatchSafeText } from '@lib/bitrix/consts/batch.consts';
import { PBXService } from '@lib/pbx/pbx.service';
import { Injectable } from '@nestjs/common';
import { IResultDocumentLink } from '../../interface/document.interface';

export interface ITimeLineSendData {
    domain: string;
    companyId: string;
    userId: number;
    documents: IResultDocumentLink[];
    dealId?: string;
    files?: [string, string][];
}

/** Сообщение об ошибке генерации для таймлайна сделки. */
export interface ITimeLineErrorData {
    domain: string;
    companyId: string;
    userId: number;
    dealId?: string;
    /**
     * Готовая строка для менеджера: что не вышло, на каком шаге и почему
     * (`describeOfferFailure(...).comment`).
     */
    reason: string;
}
@Injectable()
export class OfferBxTimelineService {
    constructor(private readonly pbx: PBXService) {}

    public async sendErrorToBitrix(data: ITimeLineErrorData) {
        const { bitrix } = await this.pbx.init(data.domain);
        const timelinePusher = new BxTimelinePusherService(bitrix);
        await timelinePusher.push(
            {
                companyId: data.companyId,
                userId: data.userId,
                // в тексте бывает ответ Битрикса со знаками «&», «+», «%»:
                // без экранирования команда пачки обрывается на них
                message: toBatchSafeText(data.reason),
                dealId: data.dealId,
            },
            true,
        );
    }

    public async sendDocumentToBitrix(data: ITimeLineSendData) {
        const { bitrix } = await this.pbx.init(data.domain);
        const commentMessage = this.getCommentMessage(data.documents);
        const timelinePusher = new BxTimelinePusherService(bitrix);
        await timelinePusher.push({
            companyId: data.companyId,
            userId: data.userId,
            message: commentMessage,
            dealId: data.dealId,
            files: data.files,
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
            .join('%0A'); // разрыв строки в Bitrix batch
    }

    private getDocumentMessage(
        link: string,
        documentName: string,
        type: 'offer' | 'invoice',
    ) {
        const icon = type === 'offer' ? '📝' : '🧾';
        return `${icon} <a href="${link}" target="_blank">${documentName}</a>`;
    }
}
