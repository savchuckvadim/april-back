import { Injectable, Logger } from '@nestjs/common';
import { PBXService } from '@/modules/pbx';
import {
    DialogMessagesGetResponse,
    ImV2EventGetResponse,
} from '../../interfaces/bridge.types';

@Injectable()
export class BitrixImApiService {
    private readonly logger = new Logger(BitrixImApiService.name);

    constructor(private readonly pbx: PBXService) {}

    async subscribe(domain: string): Promise<void> {
        this.logger.log(`Subscribe to IM events for ${domain}`);
        const { bitrix } = await this.pbx.init(domain);
        await bitrix.imV2Event.subscribe({});
        this.logger.log(`Subscription completed for ${domain}`);
    }

    async getEvents(
        domain: string,
        limit: number,
        offset?: number,
    ): Promise<ImV2EventGetResponse> {
        const { bitrix } = await this.pbx.init(domain);
        const response = (await bitrix.imV2Event.get({
            limit,
            offset,
        })) as ImV2EventGetResponse;
        const count = response.result?.events?.length || 0;
        this.logger.debug(
            `Fetched IM events for ${domain}: count=${count}, offset=${String(offset)}, nextOffset=${String(response.result?.nextOffset)}`,
        );
        return response;
    }

    async getDialogMessages(
        domain: string,
        dialogId: string,
        limit: number,
    ): Promise<DialogMessagesGetResponse> {
        const { bitrix } = await this.pbx.init(domain);
        const response = (await bitrix.dialogMessage.get({
            DIALOG_ID: dialogId,
            LIMIT: limit,
        })) as DialogMessagesGetResponse;
        this.logger.debug(
            `Loaded dialog messages for ${domain}, dialog=${dialogId}, count=${response.result?.messages?.length || 0}`,
        );
        return response;
    }

    async sendMessage(
        domain: string,
        dialogId: string,
        text: string,
        replyMessageId?: number,
    ): Promise<void> {
        const { bitrix } = await this.pbx.init(domain);
        const payload = {
            DIALOG_ID: dialogId,
            MESSAGE: text,
            SYSTEM: 'N' as const,
            URL_PREVIEW: 'Y' as const,
            REPLY_ID:
                typeof replyMessageId === 'number' ? replyMessageId : undefined,
        };

        this.logger.debug(
            `Send message to Bitrix: domain=${domain}, dialog=${dialogId}, replyId=${String(replyMessageId)}`,
        );
        await bitrix.message.add(payload);
    }
}
