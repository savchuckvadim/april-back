import { IBXMessageAddRequest } from '@/modules/bitrix/domain/chat';
import { PBXService } from '@/modules/pbx';
import { Injectable } from '@nestjs/common';

@Injectable()
export class DealMessageService {
    constructor(private readonly pbx: PBXService) {}

    async sendToUser(domain: string, userId: string, message: string) {
        const { bitrix } = await this.pbx.init(domain);
        const payload: IBXMessageAddRequest = {
            DIALOG_ID: userId,
            MESSAGE: message,
            SYSTEM: 'N',
            URL_PREVIEW: 'Y',
        };
        return await bitrix.message.add(payload);
    }
}
