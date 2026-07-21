import {
    bitrix_app_events,
    Client,
    marketplace_install_components,
    marketplace_installs,
    Portal,
    portal_products,
} from 'generated/prisma';

/** Портал-заявка с клиентом и установками (модерация онбординга) */
export type ModerationPortal = Portal & {
    clients: Client | null;
    marketplace_installs: marketplace_installs[];
};

/** Установка с порталом и счётчиком компонентов (обзор установок) */
export type InstallWithPortal = marketplace_installs & {
    portals: Portal;
    _count: { marketplace_install_components: number };
};

/** Установка с порталом и компонентами (деталь) */
export type InstallWithComponents = marketplace_installs & {
    portals: Portal;
    marketplace_install_components: marketplace_install_components[];
};

/** Фильтры обзора установок */
export interface InstallsFilter {
    domain?: string;
    memberId?: string;
    installStatus?: string;
}

/** Фильтры журнала событий */
export interface EventsFilter {
    memberId?: string;
    domain?: string;
    event?: string;
    status?: string;
    take: number;
    skip: number;
}

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

    /**
     * Отвязка портала: допуск → pending, организация отвязана
     * (client_id=null), продукты портала → inactive. Клиент НЕ трогается —
     * у организации могут быть другие порталы.
     */
    abstract detachPortal(portalId: bigint): Promise<void>;

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

    /** Обзор всех установок с фильтрами (новые сверху) */
    abstract findInstalls(filter: InstallsFilter): Promise<InstallWithPortal[]>;

    /** Деталь установки с порталом и компонентами */
    abstract findInstallById(
        installId: string,
    ): Promise<InstallWithComponents | null>;

    /** Журнал bitrix_app_events с фильтрами и пагинацией (+ total) */
    abstract findEvents(
        filter: EventsFilter,
    ): Promise<{ items: bitrix_app_events[]; total: number }>;

    /** Продукты портала (portal_products) */
    abstract findPortalProducts(portalId: bigint): Promise<portal_products[]>;
}
