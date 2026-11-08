import { Injectable } from '@nestjs/common';
import {
    CabinetTelegramBindingRepository,
    TelegramPerson,
} from '../persistence/cabinet-telegram-binding.repository';
import { ClientTelegramBotClient } from './client-telegram-bot.client';

/**
 * Доставка сообщений клиентам в Telegram — для продуктов (отчёт
 * собственнику, карточки руководителям, алерты): человек на портале →
 * его привязанные чаты. Нет привязки — 0, решение «куда ещё» за продуктом.
 */
@Injectable()
export class CabinetTelegramDeliveryService {
    constructor(
        private readonly bindings: CabinetTelegramBindingRepository,
        private readonly bot: ClientTelegramBotClient,
    ) {}

    /** @returns сколько чатов приняли сообщение */
    async sendToPerson(
        portalId: bigint,
        person: TelegramPerson,
        html: string,
    ): Promise<number> {
        const rows = await this.bindings.listActiveForPerson(portalId, person);
        let delivered = 0;
        for (const row of rows) {
            if (await this.bot.sendMessage(row.chatId, html)) {
                delivered += 1;
            }
        }
        return delivered;
    }
}
