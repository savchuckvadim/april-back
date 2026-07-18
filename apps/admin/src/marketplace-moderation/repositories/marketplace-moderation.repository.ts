import {
    Client,
    marketplace_install_components,
    marketplace_installs,
    Portal,
} from 'generated/prisma';

/** Портал-заявка с клиентом и установками (модерация онбординга) */
export type ModerationPortal = Portal & {
    clients: Client | null;
    marketplace_installs: marketplace_installs[];
};

/**
 * Абстракция хранилища модерации маркетплейс-подключений
 * (паттерн admin: abstract class token + prisma-реализация).
 */
export abstract class MarketplaceModerationRepository {
    /** Заявки: порталы source='marketplace' (+ фильтр по допуску) */
    abstract findApplications(filter: {
        approvalStatus?: string;
    }): Promise<ModerationPortal[]>;

    /** Портал с клиентом и установками по id */
    abstract findPortalById(portalId: bigint): Promise<ModerationPortal | null>;

    /** Смена статуса клиента (pending → active | disabled) */
    abstract updateClientStatus(
        clientId: bigint,
        status: 'active' | 'disabled',
    ): Promise<void>;

    /** Блокировка портала (approval_status='blocked') */
    abstract setPortalBlocked(portalId: bigint): Promise<void>;

    /** Компоненты установок портала (статусы установки по осям) */
    abstract findComponentsByPortal(
        portalId: bigint,
    ): Promise<marketplace_install_components[]>;

    /** Журнал действий модерации в bitrix_app_events (best-effort) */
    abstract logModerationEvent(input: {
        memberId?: string;
        domain?: string;
        event: string;
        status: 'processed' | 'error';
        payload?: string;
        errorDetail?: string;
    }): Promise<void>;
}
