import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
    StartBridgeDto,
    TelegramWebhookUpdateDto,
} from '../dto/bitrix-im-bridge.dto';
import { ImV2Event, ImV2EventPayload } from '../interfaces/bridge.types';
import { BitrixImBridgeConfigService } from './config/bitrix-im-bridge-config.service';
import { BitrixImBridgeStateService } from './bitrix-im-bridge-state.service';
import { BitrixImApiService } from './bitrix/bitrix-im-api.service';
import { BridgeUserResolverService } from './bitrix/bridge-user-resolver.service';
import { BitrixImEventDataService } from './parsers/bitrix-im-event-data.service';
import { BitrixImEventFilterService } from './filters/bitrix-im-event-filter.service';
import { TelegramBridgeService } from './telegram-bridge.service';
import { TelegramReplyRouterService } from './telegram/telegram-reply-router.service';
import { BridgeUserNameCacheService } from './bitrix/bridge-user-name-cache.service';
import { PortalStoreService } from '@lib/portal-konstructor/portal/portal-store.service';
import { PortalEntity } from '@lib/portal-konstructor/portal/portal.entity';

@Injectable()
export class BridgeOrchestratorService implements OnModuleInit {
    private readonly logger = new Logger(BridgeOrchestratorService.name);
    private readonly scheduledDomains = new Set<string>();

    constructor(
        private readonly config: BitrixImBridgeConfigService,
        private readonly state: BitrixImBridgeStateService,
        private readonly bitrixApi: BitrixImApiService,
        private readonly userResolver: BridgeUserResolverService,
        private readonly parser: BitrixImEventDataService,
        private readonly filter: BitrixImEventFilterService,
        private readonly telegramBridge: TelegramBridgeService,
        private readonly telegramReplyRouter: TelegramReplyRouterService,
        private readonly userNameCache: BridgeUserNameCacheService,
        private readonly portalStore: PortalStoreService,
    ) {}

    async onModuleInit(): Promise<void> {
        await this.registerWebhookIfConfigured();

        if (!this.config.isSchedulerEnabled()) {
            this.logger.log(
                'Bitrix IM bridge scheduler is disabled (WITH_SCHEDLER=false)',
            );
            return;
        }

        const domains = await this.loadAllPortalDomains();
        this.logger.log(`Loaded ${domains.length} domains`);
        this.logger.log(`Domains: ${domains.join(', ')}`);
        for (const domain of domains) {
            this.scheduledDomains.add(domain);
            try {
                await this.subscribeDomain(
                    domain,
                    this.config.getDefaultBridgeEmail(),
                );
            } catch (error) {
                this.logger.warn(
                    `Skip domain "${domain}" on startup: ${String(error)}`,
                );
            }
        }
    }

    async startDomainPolling(dto: StartBridgeDto): Promise<{
        domain: string;
        bridgeUserId: string;
        scheduled: boolean;
    }> {
        const domain = this.config.normalizeDomain(dto.domain);
        this.logger.log(`Start bridge for domain=${domain}`);
        if (!this.config.isValidBitrixPortalDomain(domain)) {
            this.logger.error(`Invalid portal domain format: ${domain}`);
            throw new Error(`Invalid portal domain format: ${domain}`);
        }
        if (!this.config.isPortalAllowed(domain)) {
            throw new Error(
                `Portal is blocked by whitelist/denylist: ${domain}`,
            );
        }
        const bridgeUserId = await this.subscribeDomain(
            domain,
            dto.email || this.config.getDefaultBridgeEmail(),
        );

        const scheduled = dto.enableScheduledPolling !== false;
        if (scheduled) this.scheduledDomains.add(domain);

        return { domain, bridgeUserId, scheduled };
    }

    async pollDomainNow(
        domain: string,
    ): Promise<{ domain: string; polled: true; processed: number }> {
        const normalized = this.config.normalizeDomain(domain);
        const processed = await this.pollDomain(normalized);
        return { domain: normalized, polled: true, processed };
    }

    async pollScheduledDomains(): Promise<void> {
        if (!this.config.isSchedulerEnabled()) {
            return;
        }
        this.logger.debug(
            `Scheduled poll tick. domains=${Array.from(this.scheduledDomains).join(', ')}`,
        );
        for (const domain of [...this.scheduledDomains]) {
            if (!this.config.isValidBitrixPortalDomain(domain)) {
                this.logger.warn(
                    `Skip scheduled domain "${domain}" due to invalid format`,
                );
                this.scheduledDomains.delete(domain);
                continue;
            }
            if (!this.config.isPortalAllowed(domain)) {
                this.logger.warn(
                    `Skip scheduled domain "${domain}" due to whitelist/denylist`,
                );
                this.scheduledDomains.delete(domain);
                continue;
            }
            try {
                await this.pollDomain(domain);
            } catch (error) {
                this.logger.error(`Polling failed for ${domain}`, error);
            }
        }
    }

    async handleTelegramWebhook(update: TelegramWebhookUpdateDto): Promise<{
        ok: boolean;
        message: string;
    }> {
        this.logger.debug(
            `Incoming Telegram webhook: hasMessage=${Boolean(update.message)}, hasText=${Boolean(update.message?.text)}, hasReply=${Boolean(update.message?.reply_to_message?.message_id)}`,
        );
        const routing = await this.telegramReplyRouter.resolve(update);
        if (!routing.ok || !routing.context || !routing.text) {
            this.logger.debug(`Telegram webhook skipped: ${routing.message}`);
            return { ok: routing.ok, message: routing.message };
        }

        await this.bitrixApi.sendMessage(
            routing.context.domain,
            routing.context.dialogId,
            routing.text,
            routing.context.bitrixMessageId,
        );
        await this.telegramBridge.sendSystemMessage(
            `Ответ отправлен в ${routing.context.domain}, диалог ${routing.context.dialogId}`,
        );
        this.logger.log(
            `Telegram reply relayed to Bitrix: domain=${routing.context.domain}, dialog=${routing.context.dialogId}`,
        );
        return { ok: true, message: routing.message };
    }

    private async subscribeDomain(
        domain: string,
        email: string,
    ): Promise<string> {
        this.logger.log(`Subscribe flow start for domain=${domain}`);
        const bridgeUserId = await this.userResolver.resolve(domain, email);
        this.logger.log(
            `Bridge user resolved for domain=${domain}: userId=${bridgeUserId}`,
        );
        await this.bitrixApi.subscribe(domain);
        this.logger.log(`Subscribe flow completed for domain=${domain}`);
        return bridgeUserId;
    }

    private async pollDomain(domain: string): Promise<number> {
        if (!this.config.isValidBitrixPortalDomain(domain)) {
            this.logger.warn(`Skip poll for invalid domain "${domain}"`);
            return 0;
        }
        if (!this.config.isPortalAllowed(domain)) {
            this.logger.warn(`Skip poll for blocked domain "${domain}"`);
            return 0;
        }

        const bridgeUserId = await this.userResolver.resolve(
            domain,
            this.config.getDefaultBridgeEmail(),
        );
        const offset = await this.state.getOffset(domain);
        this.logger.debug(
            `Polling domain=${domain} with bridgeUser=${bridgeUserId}, offset=${String(offset)}`,
        );
        const eventsResponse = await this.bitrixApi.getEvents(
            domain,
            this.config.getPollLimit(),
            offset,
        );

        const events = eventsResponse.result?.events || [];
        this.logger.debug(
            `Polling domain=${domain} received events=${events.length}`,
        );

        let processed = 0;
        for (const event of events) {
            const handled = await this.processIncomingEvent(
                domain,
                bridgeUserId,
                event,
            );
            if (handled) processed += 1;
        }

        if (typeof eventsResponse.result?.nextOffset === 'number') {
            await this.state.setOffset(
                domain,
                eventsResponse.result.nextOffset,
            );
            this.logger.debug(
                `Saved nextOffset for domain=${domain}: ${eventsResponse.result.nextOffset}`,
            );
        }

        this.logger.log(
            `Polling finished for domain=${domain}: processed=${processed}, total=${events.length}`,
        );
        return processed;
    }

    private async processIncomingEvent(
        domain: string,
        bridgeUserId: string,
        event: ImV2Event,
    ): Promise<boolean> {
        const eventData: ImV2EventPayload = event.data ?? {};
        const authorId = this.parser.extractAuthorId(eventData);
        const dialogIdFromEvent = this.parser.extractDialogId(eventData);
        const payloadShape = this.describeEventPayload(eventData);
        this.logger.debug(
            `Incoming event: domain=${domain}, type=${event.type || 'n/a'}, bridgeUser=${bridgeUserId}, author=${authorId || 'unknown'}, dialog=${dialogIdFromEvent || 'unknown'}, payload=${payloadShape}`,
        );

        const decision = this.filter.shouldProcess(domain, bridgeUserId, event);
        if (!decision.allowed) {
            this.logger.debug(
                `Event skipped: domain=${domain}, reason=${decision.reason ?? 'unknown'}, type=${event.type ?? 'n/a'}, author=${authorId ?? 'unknown'}, chat=${JSON.stringify(eventData.chat ?? null)}, payload=${payloadShape}`,
            );
            return false;
        }

        let dialogId = this.parser.extractDialogId(eventData);
        if (!dialogId && authorId && authorId !== bridgeUserId) {
            // For direct user-to-user events Bitrix may omit dialogId.
            // In that case the dialog can be addressed by author user id.
            dialogId = authorId;
            this.logger.warn(
                `dialogId missing in event payload, fallback to authorId as dialog: domain=${domain}, bridgeUser=${bridgeUserId}, author=${authorId}`,
            );
        }
        if (!dialogId) {
            this.logger.debug(
                `Event skipped for domain=${domain}: dialogId missing`,
            );
            return false;
        }

        const bitrixMessageId = this.parser.extractMessageId(eventData);
        const text = await this.resolveMessageText(
            domain,
            dialogId,
            eventData,
            bitrixMessageId,
        );

        const authorName = authorId
            ? await this.userNameCache.resolveName(domain, authorId)
            : undefined;

        const sendResult = await this.telegramBridge.sendIncomingMessage({
            domain,
            dialogId,
            authorId,
            authorName,
            text,
        });
        if (!sendResult.ok || !sendResult.messageId) {
            this.logger.warn(
                `Telegram forward failed: domain=${domain}, dialog=${dialogId}, author=${authorId || 'unknown'}`,
            );
            return false;
        }

        const context = { domain, dialogId, bitrixMessageId };
        await this.state.setReplyContext(sendResult.messageId, context);
        if (typeof sendResult.chatId === 'number') {
            await this.state.setLastReplyContextByChat(
                sendResult.chatId,
                context,
            );
        }

        this.logger.log(
            `Event forwarded: domain=${domain}, dialog=${dialogId}, author=${authorId || 'unknown'}, bitrixMessageId=${String(bitrixMessageId)}, telegramMessageId=${sendResult.messageId}`,
        );

        return true;
    }

    private describeEventPayload(eventData: ImV2EventPayload): string {
        const topLevelKeys = Object.keys(eventData).slice(0, 12);
        const messageKeys = eventData.message
            ? Object.keys(eventData.message).slice(0, 12)
            : [];
        return `keys=[${topLevelKeys.join(',')}],messageKeys=[${messageKeys.join(',')}]`;
    }

    private async resolveMessageText(
        domain: string,
        dialogId: string,
        eventData: ImV2EventPayload,
        bitrixMessageId?: number,
    ): Promise<string> {
        const directText = this.parser.extractText(eventData);
        if (directText) return directText;

        const response = await this.bitrixApi.getDialogMessages(
            domain,
            dialogId,
            20,
        );
        const messages = response.result?.messages || [];
        const target =
            (typeof bitrixMessageId === 'number'
                ? messages.find(item => item.id === bitrixMessageId)
                : undefined) || messages[0];
        return target?.text || '[без текста]';
    }

    private async registerWebhookIfConfigured(): Promise<void> {
        const webhookUrl = this.config.getBridgeWebhookUrl();
        if (!webhookUrl) return;
        try {
            await this.telegramBridge.registerWebhook(webhookUrl);
        } catch (error) {
            this.logger.error('Ошибка регистрации Telegram webhook', error);
        }
    }

    private async loadAllPortalDomains(): Promise<string[]> {
        // Если whitelist задан явно — используем его как прямой список доменов.
        // На сервере порталы живут в Redis/PBX, а Prisma может вернуть пустоту.
        const whitelist = this.config.getPortalWhitelist();
        if (whitelist.size > 0) {
            this.logger.log(
                `Loading domains from BITRIX_IM_BRIDGE_PORTAL_WHITELIST (${whitelist.size} entries)`,
            );
            const valid: string[] = [];
            for (const domain of whitelist) {
                if (!this.config.isValidBitrixPortalDomain(domain)) {
                    this.logger.warn(
                        `Whitelist domain skipped — invalid format: "${domain}"`,
                    );
                    continue;
                }
                valid.push(domain);
            }
            return valid;
        }

        // Fallback: загружаем из Prisma DB
        this.logger.log(
            'BITRIX_IM_BRIDGE_PORTAL_WHITELIST not set — loading domains from DB',
        );
        let portals: PortalEntity[];
        try {
            portals = (await this.portalStore.getPortals()) ?? [];
        } catch (error) {
            this.logger.error(
                'Failed to load portals from DB — scheduledDomains will be empty. ' +
                    'Set BITRIX_IM_BRIDGE_PORTAL_WHITELIST as a fallback.',
                error,
            );
            return [];
        }

        this.logger.log(`DB returned ${portals.length} portals`);
        const unique = new Set<string>();
        const skipped: Array<{ domain: string; reason: string }> = [];

        for (const portal of portals) {
            const rawDomain = portal.domain?.trim();
            if (!rawDomain) continue;
            const domain = this.config.normalizeDomain(rawDomain);

            if (!this.config.isValidBitrixPortalDomain(domain)) {
                skipped.push({
                    domain,
                    reason: 'invalid format (only *.bitrix24.ru allowed)',
                });
                continue;
            }
            if (!this.config.isPortalAllowed(domain)) {
                skipped.push({
                    domain,
                    reason: 'blocked by whitelist/denylist',
                });
                continue;
            }
            unique.add(domain);
        }

        if (skipped.length > 0) {
            this.logger.warn(
                `Skipped portal domains: ${skipped.map(s => `${s.domain} (${s.reason})`).join(', ')}`,
            );
        }

        return Array.from(unique);
    }
}
