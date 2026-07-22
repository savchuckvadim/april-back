import { Client, Portal, portal_invites } from 'generated/prisma';

/** Код подключения с клиентом и порталом, который его погасил */
export type InviteWithRelations = portal_invites & {
    clients: Client | null;
    portals: Portal | null;
};

/** Фильтры списка кодов подключения */
export interface InvitesFilter {
    status?: string;
    email?: string;
}

/** Данные для создания кода подключения (хэш уже посчитан вызывающим) */
export interface CreateInviteInput {
    codeHash: string;
    codePrefix: string;
    clientId: bigint;
    email: string;
    organization?: string;
    productCode: string;
    autoProvision: boolean;
    expiresAt: Date;
    issuedBy?: string;
    note?: string;
}

/**
 * Абстракция хранилища кодов подключения портала
 * (паттерн admin: abstract class token + prisma-реализация).
 */
export abstract class MarketplaceInviteRepository {
    /** Список кодов с фильтрами (новые сверху) */
    abstract findInvites(filter: InvitesFilter): Promise<InviteWithRelations[]>;

    /** Код подключения по id */
    abstract findInviteById(id: string): Promise<InviteWithRelations | null>;

    /** Клиент по email (используется для повторной выдачи тому же клиенту) */
    abstract findClientByEmail(email: string): Promise<Client | null>;

    /**
     * Организация, уже привязанная к порталу. Приоритетнее поиска по email:
     * код по заявке должен достаться организации портала, иначе погашение
     * упрётся в 409 «портал подключён к другой организации».
     */
    abstract findClientByPortalId(portalId: bigint): Promise<Client | null>;

    /** Создание клиента под нового получателя кода */
    abstract createClient(input: {
        name: string;
        email: string;
    }): Promise<Client>;

    /** Создание записи кода подключения (хранится только хэш) */
    abstract createInvite(
        input: CreateInviteInput,
    ): Promise<InviteWithRelations>;

    /** Отметка успешной отправки письма (status='sent', sent_at) */
    abstract markInviteSent(id: string, sentAt: Date): Promise<void>;

    /** Отзыв кода (status='revoked', revoked_at, revoked_by) */
    abstract revokeInvite(
        id: string,
        revokedAt: Date,
        revokedBy?: string,
    ): Promise<void>;

    /**
     * Физическое удаление записи кода — чистка мусорных/тестовых выпусков.
     * Погашенные коды сервис к удалению не допускает (аудит подключения).
     */
    abstract deleteInvite(id: string): Promise<void>;
}
