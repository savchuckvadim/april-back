import { Injectable } from '@nestjs/common';
import { BitrixImBridgeConfigService } from '../config/bitrix-im-bridge-config.service';
import { BitrixImEventDataService } from '../parsers/bitrix-im-event-data.service';
import { ImV2Event } from '../../interfaces/bridge.types';

@Injectable()
export class BitrixImEventFilterService {
    constructor(
        private readonly config: BitrixImBridgeConfigService,
        private readonly parser: BitrixImEventDataService,
    ) {}

    shouldProcess(
        domain: string,
        bridgeUserId: string,
        event: ImV2Event,
    ): { allowed: boolean; reason?: string } {
        if (!this.config.isPortalAllowed(domain)) {
            return { allowed: false, reason: 'portal_not_in_whitelist' };
        }
        if (event.type !== 'ONIMV2MESSAGEADD') {
            return { allowed: false, reason: 'unsupported_event_type' };
        }

        const data = event.data || {};
        const authorId = this.parser.extractAuthorId(data);
        if (authorId && authorId === bridgeUserId) {
            return { allowed: false, reason: 'self_message' };
        }
        if (!this.config.isUserAllowed(authorId)) {
            return { allowed: false, reason: 'user_not_in_whitelist' };
        }
        if (
            this.config.shouldIgnoreSystemMessages() &&
            this.parser.isSystemMessage(data, authorId)
        ) {
            return { allowed: false, reason: 'system_message' };
        }
        if (
            this.config.shouldIgnoreBotMessages() &&
            this.parser.isBotMessage(data)
        ) {
            return { allowed: false, reason: 'bot_message' };
        }

        return { allowed: true };
    }
}
