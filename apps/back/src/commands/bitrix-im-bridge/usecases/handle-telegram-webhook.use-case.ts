import { Injectable } from '@nestjs/common';
import { TelegramWebhookUpdateDto } from '../dto/bitrix-im-bridge.dto';
import { BridgeOrchestratorService } from '../services/bridge-orchestrator.service';

@Injectable()
export class HandleTelegramWebhookUseCase {
    constructor(private readonly orchestrator: BridgeOrchestratorService) {}

    async execute(update: TelegramWebhookUpdateDto) {
        return await this.orchestrator.handleTelegramWebhook(update);
    }
}
