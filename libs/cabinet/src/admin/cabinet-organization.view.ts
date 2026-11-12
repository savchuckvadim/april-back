import { User } from 'generated/prisma';

/** Владелец портала в сводке организации. */
export interface CabinetOrganizationOwner {
    name: string;
    email: string | null;
    /** Пароль задан — может входить с сайта. */
    hasPassword: boolean;
}

/** Портал организации: кто владелец, сколько людей, есть ли приложение. */
export interface CabinetOrganizationPortal {
    portalId: number;
    domain: string | null;
    approvalStatus: string | null;
    /** Приложение April установлено. */
    appInstalled: boolean;
    /** Чем бэкенд ходит в портал: webhook | app | auto. */
    bitrixAuthMode: string;
    owner: CabinetOrganizationOwner | null;
    /** Действующие участники (с владельцем), без заявок. */
    members: number;
    /** Заявки на доступ, ждут подтверждения. */
    pending: number;
    /** Привязанные Telegram-чаты. */
    telegram: number;
}

export interface CabinetOrganizationPersonPortal {
    portalId: number;
    domain: string | null;
    /** owner | member. */
    role: string;
}

/** Человек организации и его доступы. */
export interface CabinetOrganizationPerson {
    userId: number;
    name: string;
    email: string | null;
    hasPassword: boolean;
    portals: CabinetOrganizationPersonPortal[];
}

/** Сводка организации-клиента для админки. */
export interface CabinetOrganizationOverview {
    clientId: number;
    name: string;
    email: string | null;
    status: string | null;
    isActive: boolean;
    portals: CabinetOrganizationPortal[];
    people: CabinetOrganizationPerson[];
}

/** «Фамилия Имя» учётки; пусто — email. */
export function personName(user: User): string {
    const full = [user.surname, user.name].filter(Boolean).join(' ').trim();
    return full || user.email || `учётка #${user.id}`;
}
