import { TelegramService } from "@/modules/telegram/telegram.service";
import { Injectable } from "@nestjs/common";

@Injectable()
export class MoveDealStagesService {

    constructor(private readonly telegramService: TelegramService) {

    }

    async moveDealStages() {
        const now = new Date()
        const hours = now.getHours()
        const minutes = now.getMinutes()
        const seconds = now.getSeconds()
        await this.telegramService.sendMessage(`⏰ SCHEDLER MoveDealStagesService ${hours}:${minutes}:${seconds}`);
    }
}