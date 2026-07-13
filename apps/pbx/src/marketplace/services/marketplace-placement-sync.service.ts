import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MarketplaceBxClient } from '../clients/marketplace-bx.client';
import { MarketplaceInstallRepository } from '../persistence/marketplace-install.repository';
import {
    DesiredBinding,
    getDesiredBindings,
    MarketplaceComponentType,
    MarketplaceProduct,
} from '../config/marketplace-manifest';

/**
 * Diff-синхронизация привязок виджетов: эталон (манифест) ↔ факт (Битрикс).
 *
 * Эталон — getDesiredBindings(products): пары «виджет × место встройки».
 * Факт — placement.list на портале (Битрикс возвращает привязки нашего
 * приложения). Синхронизация: bind недостающих пар, unbind лишних
 * (виджет убрали из места / удалили из манифеста). Идемпотентна —
 * повторный запуск ничего не меняет.
 *
 * Вызывается: (1) при установке приложения; (2) по admin-запросу
 * POST /bitrix-marketplace/admin/placements/refresh — раскатка изменений
 * манифеста на уже установленные порталы без переустановки.
 */

export interface PlacementSyncResult {
    bound: number;
    unbound: number;
    errors: number;
    total: number;
}

interface ActualBinding {
    placement: string;
    handler: string;
}

@Injectable()
export class MarketplacePlacementSyncService {
    private readonly logger = new Logger(MarketplacePlacementSyncService.name);

    /** Публичный URL этого API — база HANDLER-URL виджетов */
    readonly apiPublicUrl: string;

    constructor(
        private readonly bxClient: MarketplaceBxClient,
        private readonly repository: MarketplaceInstallRepository,
        private readonly configService: ConfigService,
    ) {
        this.apiPublicUrl =
            this.configService.get<string>('MARKETPLACE_API_PUBLIC_URL') ??
            'https://api.pbx.april-app.ru';
    }

    handlerFor(code: string): string {
        return `${this.apiPublicUrl}/api/bitrix-marketplace/placement/${code}`;
    }

    /**
     * Выравнивает привязки портала под эталон манифеста.
     * @throws Error если хотя бы один bind не удался (unbind-ошибки — warn)
     */
    async syncPlacements(
        domain: string,
        accessToken: string,
        installId: string,
        portalId: bigint,
        products: readonly MarketplaceProduct[] = [MarketplaceProduct.SALES],
    ): Promise<PlacementSyncResult> {
        const desired = getDesiredBindings(products);
        const actual = await this.fetchActualBindings(domain, accessToken);

        const desiredKeys = new Set(
            desired.map(item =>
                this.bindingKey(item.place, this.handlerFor(item.widget.code)),
            ),
        );
        const actualKeys = new Set(
            actual.map(item => this.bindingKey(item.placement, item.handler)),
        );

        const result: PlacementSyncResult = {
            bound: 0,
            unbound: 0,
            errors: 0,
            total: desired.length,
        };

        // 1) bind недостающих пар (идемпотентно: «уже привязано» = успех)
        const bindErrors: string[] = [];
        for (const item of desired) {
            const handler = this.handlerFor(item.widget.code);
            const key = this.bindingKey(item.place, handler);
            const alreadyBound = actualKeys.has(key);

            let ok = true;
            let errorDetail: string | undefined;
            if (!alreadyBound) {
                const bindResult = await this.bxClient.bindPlacement(
                    domain,
                    accessToken,
                    item.place,
                    handler,
                    item.widget.title,
                    item.widget.description,
                );
                ok = bindResult.ok;
                if (ok) {
                    result.bound += 1;
                } else {
                    result.errors += 1;
                    errorDetail =
                        `${bindResult.error ?? ''} ${bindResult.errorDescription ?? ''}`.trim();
                    bindErrors.push(
                        `${item.place}/${item.widget.code}: ${errorDetail}`,
                    );
                }
            }

            await this.repository.upsertComponents(installId, portalId, [
                {
                    productCode: item.widget.product,
                    componentType: MarketplaceComponentType.PLACEMENT,
                    componentCode: this.componentCode(item),
                    status: ok ? 'installed' : 'error',
                    reasonCode: ok ? undefined : 'bitrix_error',
                    errorDetail,
                },
            ]);
        }

        // 2) unbind лишних (только НАШИ handler'ы; ошибки не фатальны)
        for (const item of actual) {
            const key = this.bindingKey(item.placement, item.handler);
            if (desiredKeys.has(key) || !this.isOurHandler(item.handler)) {
                continue;
            }
            const unbindResult = await this.bxClient.unbindPlacement(
                domain,
                accessToken,
                item.placement,
                item.handler,
            );
            if (unbindResult.ok) {
                result.unbound += 1;
                await this.repository.upsertComponents(installId, portalId, [
                    {
                        productCode: this.productFromHandler(item.handler),
                        componentType: MarketplaceComponentType.PLACEMENT,
                        componentCode: `${item.placement}:${this.codeFromHandler(item.handler)}`,
                        status: 'skipped',
                        reasonCode: 'unbound',
                        errorDetail:
                            'Привязка снята синхронизацией (убрана из эталона)',
                    },
                ]);
            } else {
                result.errors += 1;
                this.logger.warn(
                    `unbind failed: ${item.placement} ${item.handler} — ${unbindResult.error ?? ''}`,
                );
            }
        }

        this.logger.log(
            `Placements sync: domain=${domain} bound=${result.bound} unbound=${result.unbound} errors=${result.errors} total=${result.total}`,
        );

        if (bindErrors.length > 0) {
            throw new Error(`placement.bind failed: ${bindErrors.join('; ')}`);
        }
        return result;
    }

    private async fetchActualBindings(
        domain: string,
        accessToken: string,
    ): Promise<ActualBinding[]> {
        const response = await this.bxClient.listPlacements(
            domain,
            accessToken,
        );
        if (!response.ok || !Array.isArray(response.result)) {
            // list не удался — считаем, что привязок нет (bind идемпотентен)
            if (!response.ok) {
                this.logger.warn(
                    `placement.list failed: domain=${domain} ${response.error ?? ''}`,
                );
            }
            return [];
        }
        return (response.result as unknown[])
            .map(item => {
                const record = item as Record<string, unknown>;
                const placement =
                    typeof record.placement === 'string'
                        ? record.placement
                        : undefined;
                const handler =
                    typeof record.handler === 'string'
                        ? record.handler
                        : undefined;
                return placement && handler ? { placement, handler } : null;
            })
            .filter((item): item is ActualBinding => item !== null);
    }

    private bindingKey(placement: string, handler: string): string {
        return `${placement}|${handler}`;
    }

    private componentCode(item: DesiredBinding): string {
        return `${item.place}:${item.widget.code}`;
    }

    private isOurHandler(handler: string): boolean {
        return handler.startsWith(
            `${this.apiPublicUrl}/api/bitrix-marketplace/placement/`,
        );
    }

    private codeFromHandler(handler: string): string {
        return handler.split('/').pop() ?? handler;
    }

    private productFromHandler(handler: string): string {
        // виджет мог быть удалён из манифеста — продукт восстановить не всегда
        // возможно; для снятых привязок фиксируем sales (текущий продукт v1)
        void handler;
        return MarketplaceProduct.SALES;
    }
}
