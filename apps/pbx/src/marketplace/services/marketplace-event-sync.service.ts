import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MarketplaceBxClient } from '../clients/marketplace-bx.client';
import { MARKETPLACE_LIFECYCLE_EVENTS } from '../config/marketplace-manifest';

/**
 * Diff-синхронизация lifecycle-событий: эталон ↔ факт (event.get).
 *
 * Эталон — MARKETPLACE_LIFECYCLE_EVENTS × наш handler-URL. Факт —
 * event.get (Битрикс возвращает обработчики ЭТОГО приложения).
 * Bind только недостающих (повторная установка не делает лишних вызовов
 * и не падает), unbind устаревших НАШИХ handler'ов (смена
 * MARKETPLACE_API_PUBLIC_URL). Идемпотентна; страховка от гонок двойного
 * POST установки — предикат «already binded» в MarketplaceBxClient.
 *
 * В отличие от placement-sync НЕ пишет в marketplace_install_components:
 * события — не компоненты продукта.
 */

export interface EventSyncResult {
    bound: number;
    unbound: number;
    errors: number;
    total: number;
}

interface ActualEventBinding {
    /** Имя события в верхнем регистре */
    event: string;
    handler: string;
}

@Injectable()
export class MarketplaceEventSyncService {
    private readonly logger = new Logger(MarketplaceEventSyncService.name);

    /** Публичный URL этого API — база handler-URL событий */
    readonly apiPublicUrl: string;

    constructor(
        private readonly bxClient: MarketplaceBxClient,
        private readonly configService: ConfigService,
    ) {
        this.apiPublicUrl =
            this.configService.get<string>('MARKETPLACE_API_PUBLIC_URL') ??
            'https://api.pbx.april-app.ru';
    }

    handlerUrl(): string {
        return `${this.apiPublicUrl}/api/bitrix-marketplace/event`;
    }

    /**
     * Выравнивает lifecycle-события портала под эталон.
     * @throws Error если хотя бы один bind не удался (unbind-ошибки — warn)
     */
    async syncEvents(
        domain: string,
        accessToken: string,
    ): Promise<EventSyncResult> {
        const handler = this.handlerUrl();
        const actual = await this.fetchActualEvents(domain, accessToken);
        const actualKeys = new Set(
            actual.map(item => this.eventKey(item.event, item.handler)),
        );

        const result: EventSyncResult = {
            bound: 0,
            unbound: 0,
            errors: 0,
            total: MARKETPLACE_LIFECYCLE_EVENTS.length,
        };

        // 1) bind недостающих событий (ошибка bind — фатальна для установки)
        const bindErrors: string[] = [];
        for (const event of MARKETPLACE_LIFECYCLE_EVENTS) {
            if (actualKeys.has(this.eventKey(event, handler))) {
                continue;
            }
            const bindResult = await this.bxClient.bindEvent(
                domain,
                accessToken,
                event,
                handler,
            );
            if (bindResult.ok) {
                result.bound += 1;
            } else {
                result.errors += 1;
                bindErrors.push(
                    `${event}: ${bindResult.error ?? ''} ${bindResult.errorDescription ?? ''}`.trim(),
                );
            }
        }

        // 2) unbind устаревших НАШИХ handler'ов (смена apiPublicUrl);
        // чужие обработчики не трогаем, ошибки не фатальны
        for (const item of actual) {
            const isLifecycleEvent = (
                MARKETPLACE_LIFECYCLE_EVENTS as readonly string[]
            ).includes(item.event);
            if (
                !isLifecycleEvent ||
                item.handler === handler ||
                !this.isOurHandler(item.handler)
            ) {
                continue;
            }
            const unbindResult = await this.bxClient.unbindEvent(
                domain,
                accessToken,
                item.event,
                item.handler,
            );
            if (unbindResult.ok) {
                result.unbound += 1;
            } else {
                result.errors += 1;
                this.logger.warn(
                    `event.unbind failed: ${item.event} ${item.handler} — ${unbindResult.error ?? ''}`,
                );
            }
        }

        this.logger.log(
            `Events sync: domain=${domain} bound=${result.bound} unbound=${result.unbound} errors=${result.errors} total=${result.total}`,
        );

        if (bindErrors.length > 0) {
            throw new Error(`event.bind failed: ${bindErrors.join('; ')}`);
        }
        return result;
    }

    private async fetchActualEvents(
        domain: string,
        accessToken: string,
    ): Promise<ActualEventBinding[]> {
        const response = await this.bxClient.listEvents(domain, accessToken);
        if (!response.ok || !Array.isArray(response.result)) {
            // event.get не удался — считаем, что привязок нет
            // (bind идемпотентен благодаря предикату клиента)
            if (!response.ok) {
                this.logger.warn(
                    `event.get failed: domain=${domain} ${response.error ?? ''}`,
                );
            }
            return [];
        }
        return (response.result as unknown[])
            .map(item => {
                const record = item as Record<string, unknown>;
                const event =
                    typeof record.event === 'string'
                        ? record.event.toUpperCase()
                        : undefined;
                const handler =
                    typeof record.handler === 'string'
                        ? record.handler
                        : undefined;
                return event && handler ? { event, handler } : null;
            })
            .filter((item): item is ActualEventBinding => item !== null);
    }

    private eventKey(event: string, handler: string): string {
        return `${event.toUpperCase()}|${handler}`;
    }

    private isOurHandler(handler: string): boolean {
        return handler.includes('/api/bitrix-marketplace/event');
    }
}
