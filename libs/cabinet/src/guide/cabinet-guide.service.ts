import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from 'generated/prisma';
import { PrismaService } from '@lib/core/prisma/prisma.service';
import { CabinetConfig } from '../config/cabinet.config';
import type { CabinetRole } from '../domain/cabinet.constants';
import { ClientTelegramBotClient } from '../telegram/client-telegram-bot.client';
import {
    buildCabinetChecklist,
    CABINET_GUIDE_PAGES,
} from './cabinet-guide.checklist';
import {
    CABINET_GUIDE_SECTIONS,
    CABINET_GUIDE_SUMMARY,
} from './cabinet-guide.content';
import type {
    CabinetGuide,
    CabinetGuideCounters,
    CabinetGuideFacts,
} from './cabinet-guide.types';

const OWNER: CabinetRole = 'owner';
const MEMBER: CabinetRole = 'member';
const PENDING: CabinetRole = 'pending';

/** Таблицы нет — миграция не применена (Prisma P2021). */
const TABLE_MISSING = 'P2021';

/** `CORS_ORIGIN` — список через запятую; сравниваем без хвостового «/». */
export function corsAllows(corsOrigin: string, siteUrl: string): boolean {
    const site = siteUrl.replace(/\/+$/, '');
    return corsOrigin
        .split(',')
        .map(origin => origin.trim().replace(/\/+$/, ''))
        .includes(site);
}

/**
 * Путеводитель «Кабинет клиента» для админки: тексты + живой чек-лист.
 * Окружение — admin (корневой .env общий для pbx, bot и admin), бот —
 * настройка «Telegram-боты» с проверкой у Telegram, счётчики — из БД.
 */
@Injectable()
export class CabinetGuideService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly cabinetConfig: CabinetConfig,
        private readonly config: ConfigService,
        private readonly bot: ClientTelegramBotClient,
    ) {}

    async build(): Promise<CabinetGuide> {
        const [counters, botTokenSet, botUsername] = await Promise.all([
            this.counters(),
            this.bot.isConfigured(),
            this.bot.botUsername(),
        ]);
        const facts: CabinetGuideFacts = {
            tablesReady: counters !== null,
            authJwtSecretSet: Boolean(this.env('AUTH_JWT_SECRET')),
            authEnabled: this.env('AUTH_ENABLED') === 'true',
            cookieDomain: this.cabinetConfig.cookieDomain(),
            corsAllowsSite: corsAllows(
                this.env('CORS_ORIGIN'),
                this.cabinetConfig.siteUrl(),
            ),
            siteUrl: this.cabinetConfig.siteUrl(),
            botTokenSet,
            botUsername,
            webhookUrl: this.cabinetConfig.telegramWebhookUrl(),
            mailHost: this.env('MAIL_HOST'),
        };
        return {
            summary: CABINET_GUIDE_SUMMARY,
            counters,
            checklist: buildCabinetChecklist(facts),
            sections: [...CABINET_GUIDE_SECTIONS],
            links: [
                CABINET_GUIDE_PAGES.clients,
                CABINET_GUIDE_PAGES.portals,
                CABINET_GUIDE_PAGES.vendorSettings,
                CABINET_GUIDE_PAGES.secrets,
                { title: 'Сайт кабинета', href: facts.siteUrl },
            ],
        };
    }

    /** null — таблицы кабинета ещё не созданы. */
    private async counters(): Promise<CabinetGuideCounters | null> {
        const active = { revokedAt: null };
        try {
            const [
                portals,
                portalsWithClient,
                owners,
                members,
                pending,
                telegramBindings,
            ] = await Promise.all([
                this.prisma.portal.count(),
                this.prisma.portal.count({
                    where: { client_id: { not: null } },
                }),
                this.prisma.portalUser.groupBy({
                    by: ['portalId'],
                    where: { ...active, role: OWNER },
                }),
                this.prisma.portalUser.count({
                    where: { ...active, role: { in: [OWNER, MEMBER] } },
                }),
                this.prisma.portalUser.count({
                    where: { ...active, role: PENDING },
                }),
                this.prisma.telegramBinding.count({ where: active }),
            ]);
            return {
                portals,
                portalsWithClient,
                portalsWithOwner: owners.length,
                members,
                pending,
                telegramBindings,
            };
        } catch (error) {
            if (
                error instanceof Prisma.PrismaClientKnownRequestError &&
                error.code === TABLE_MISSING
            ) {
                return null;
            }
            throw error;
        }
    }

    private env(key: string): string {
        return (this.config.get<string>(key) ?? '').trim();
    }
}
