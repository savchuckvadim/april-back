import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MarketplaceBxClient } from '../clients/marketplace-bx.client';

/** Привязка виджета на портале — как её видит Битрикс (placement.get). */
export interface LivePlacementBinding {
    placement: string;
    handler: string;
    title: string | null;
    /** Привязка нашего приложения (обработчик — роутер api.pbx). */
    ours: boolean;
    /** Код виджета из адреса обработчика; null — чужая привязка. */
    widget: string | null;
}

export interface LivePlacements {
    ok: boolean;
    error: string | null;
    bindings: LivePlacementBinding[];
}

/**
 * Живой список привязок виджетов портала — `placement.get` (обработчики,
 * которые приложение зарегистрировало через placement.bind). НЕ
 * `placement.list`: тот отдаёт лишь коды мест, куда МОЖНО встроиться, и
 * синхронизация по нему не видела ни одной привязки (исправлено 08.11.2026).
 */
@Injectable()
export class MarketplacePlacementReader {
    /** Публичный URL этого API — база HANDLER-URL наших виджетов. */
    readonly apiPublicUrl: string;

    constructor(
        private readonly bxClient: MarketplaceBxClient,
        configService: ConfigService,
    ) {
        this.apiPublicUrl = (
            configService.get<string>('MARKETPLACE_API_PUBLIC_URL') ??
            'https://api.pbx.april-app.ru'
        ).replace(/\/+$/, '');
    }

    async fetch(domain: string, accessToken: string): Promise<LivePlacements> {
        const response = await this.bxClient.listPlacements(
            domain,
            accessToken,
        );
        if (!response.ok || !Array.isArray(response.result)) {
            return {
                ok: false,
                error: response.error ?? 'placement.get вернул не список',
                bindings: [],
            };
        }
        const bindings = (response.result as unknown[])
            .map(item => this.toBinding(item))
            .filter((item): item is LivePlacementBinding => item !== null);
        return { ok: true, error: null, bindings };
    }

    isOurHandler(handler: string): boolean {
        return handler.startsWith(
            `${this.apiPublicUrl}/api/bitrix-marketplace/placement/`,
        );
    }

    /** `…/api/bitrix-marketplace/placement/event-sales` → `event-sales`. */
    widgetOf(handler: string): string {
        return handler.split('/').pop() ?? handler;
    }

    private toBinding(item: unknown): LivePlacementBinding | null {
        if (typeof item !== 'object' || item === null) return null;
        const record = item as Record<string, unknown>;
        const placement =
            typeof record.placement === 'string' ? record.placement : '';
        const handler =
            typeof record.handler === 'string' ? record.handler : '';
        if (!placement || !handler) return null;
        const ours = this.isOurHandler(handler);
        return {
            placement,
            handler,
            title:
                typeof record.title === 'string' && record.title
                    ? record.title
                    : null,
            ours,
            widget: ours ? this.widgetOf(handler) : null,
        };
    }
}
