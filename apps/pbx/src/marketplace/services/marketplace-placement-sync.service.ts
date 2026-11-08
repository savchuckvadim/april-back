import { Injectable, Logger } from '@nestjs/common';
import { MarketplaceBxClient } from '../clients/marketplace-bx.client';
import { MarketplaceInstallRepository } from '../persistence/marketplace-install.repository';
import { MarketplacePlacementReader } from './marketplace-placement.reader';
import {
    DesiredBinding,
    getDesiredBindingsForWidgets,
    MarketplaceComponentType,
    MarketplaceProduct,
} from '../config/marketplace-manifest';

/**
 * Diff-синхронизация привязок виджетов: желаемое ↔ факт (Битрикс).
 *
 * Желаемое — getDesiredBindingsForWidgets(кодов из настройки портала
 * `app_widgets`): пары «виджет × место встройки» из манифеста. Факт —
 * placement.get на портале (MarketplacePlacementReader — привязки нашего
 * приложения). Синхронизация: bind недостающих пар, unbind лишних НАШИХ
 * (виджет убрали из списка / из манифеста). Идемпотентна — повторный
 * запуск ничего не меняет. Пустой список — полный no-op: ничего не
 * ставим и не снимаем (действующие порталы живут старыми привязками).
 *
 * Вызывается ТОЛЬКО по admin-запросу POST /bitrix-marketplace/admin/
 * placements/refresh (при установке виджеты не ставятся — решение
 * владельца 07.11.2026).
 */

export interface PlacementSyncResult {
    bound: number;
    unbound: number;
    errors: number;
    total: number;
}

export interface PlacementSyncOptions {
    /**
     * Переустановить: сначала снять ВСЕ наши привязки портала, потом
     * поставить выбранные заново. Нужно, когда привязка «есть», но
     * сломана (сменили название вкладки, Битрикс потерял обработчик).
     */
    force?: boolean;
}

interface ActualBinding {
    placement: string;
    handler: string;
}

@Injectable()
export class MarketplacePlacementSyncService {
    private readonly logger = new Logger(MarketplacePlacementSyncService.name);

    constructor(
        private readonly bxClient: MarketplaceBxClient,
        private readonly repository: MarketplaceInstallRepository,
        private readonly reader: MarketplacePlacementReader,
    ) {}

    handlerFor(code: string): string {
        return `${this.reader.apiPublicUrl}/api/bitrix-marketplace/placement/${code}`;
    }

    /**
     * Выравнивает привязки портала под выбранные виджеты.
     * @param widgetCodes коды виджетов, которые должны стоять (настройка
     *   портала `app_widgets`); пусто — ничего не делаем
     * @throws Error если хотя бы один bind не удался (unbind-ошибки — warn)
     */
    async syncPlacements(
        domain: string,
        accessToken: string,
        installId: string,
        portalId: bigint,
        widgetCodes: readonly string[],
        options: PlacementSyncOptions = {},
    ): Promise<PlacementSyncResult> {
        if (widgetCodes.length === 0) {
            this.logger.log(
                `Placements sync: domain=${domain} — список виджетов пуст, привязки не трогаем`,
            );
            return { bound: 0, unbound: 0, errors: 0, total: 0 };
        }
        const desired = getDesiredBindingsForWidgets(widgetCodes);
        const fetched = await this.fetchActualBindings(domain, accessToken);

        const desiredKeys = new Set(
            desired.map(item =>
                this.bindingKey(item.place, this.handlerFor(item.widget.code)),
            ),
        );

        const result: PlacementSyncResult = {
            bound: 0,
            unbound: 0,
            errors: 0,
            total: desired.length,
        };

        // Переустановка: снимаем все свои привязки — дальше ставим с нуля.
        const actual = options.force
            ? await this.unbindAllOurs(domain, accessToken, fetched, result)
            : fetched;
        const actualKeys = new Set(
            actual.map(item => this.bindingKey(item.placement, item.handler)),
        );

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
            `Placements sync${options.force ? ' (переустановка)' : ''}: domain=${domain} bound=${result.bound} unbound=${result.unbound} errors=${result.errors} total=${result.total}`,
        );

        if (bindErrors.length > 0) {
            throw new Error(`placement.bind failed: ${bindErrors.join('; ')}`);
        }
        return result;
    }

    /**
     * Снять все НАШИ привязки (чужие обработчики не трогаем). Возвращает
     * то, что осталось на портале (чужое и то, что снять не удалось).
     */
    private async unbindAllOurs(
        domain: string,
        accessToken: string,
        actual: ActualBinding[],
        result: PlacementSyncResult,
    ): Promise<ActualBinding[]> {
        const left: ActualBinding[] = [];
        for (const item of actual) {
            if (!this.isOurHandler(item.handler)) {
                left.push(item);
                continue;
            }
            const unbound = await this.bxClient.unbindPlacement(
                domain,
                accessToken,
                item.placement,
                item.handler,
            );
            if (unbound.ok) {
                result.unbound += 1;
            } else {
                result.errors += 1;
                left.push(item);
                this.logger.warn(
                    `unbind (переустановка) failed: ${item.placement} ${item.handler} — ${unbound.error ?? ''}`,
                );
            }
        }
        return left;
    }

    private async fetchActualBindings(
        domain: string,
        accessToken: string,
    ): Promise<ActualBinding[]> {
        const live = await this.reader.fetch(domain, accessToken);
        if (!live.ok) {
            // список не получен — считаем, что привязок нет (bind идемпотентен)
            this.logger.warn(
                `placement.get failed: domain=${domain} ${live.error ?? ''}`,
            );
        }
        return live.bindings;
    }

    private bindingKey(placement: string, handler: string): string {
        return `${placement}|${handler}`;
    }

    private componentCode(item: DesiredBinding): string {
        return `${item.place}:${item.widget.code}`;
    }

    private isOurHandler(handler: string): boolean {
        return this.reader.isOurHandler(handler);
    }

    private codeFromHandler(handler: string): string {
        return this.reader.widgetOf(handler);
    }

    private productFromHandler(handler: string): string {
        // виджет мог быть удалён из манифеста — продукт восстановить не всегда
        // возможно; для снятых привязок фиксируем sales (текущий продукт v1)
        void handler;
        return MarketplaceProduct.SALES;
    }
}
