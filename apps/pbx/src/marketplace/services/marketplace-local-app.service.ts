import { Injectable, Logger } from '@nestjs/common';
import { Portal } from 'generated/prisma';
import { MarketplaceAuthRepository } from '@lib/marketplace-core';
import {
    EnumPortalAppCode,
    PortalAppSettingsService,
} from '@lib/portal-lib/store/app-settings';

/** Что известно об установке к моменту сохранения портала. */
export interface PortalInstalledInput {
    portal: Portal;
    /** Портал создан этой установкой (а не найден легаси по домену). */
    created: boolean;
    domain: string;
    memberId?: string;
}

/**
 * Правила ЛОКАЛЬНОГО приложения при установке (решение владельца
 * 07.11.2026, ai/tasks/2026-11-07-local-app-cabinet-auth-analysis.md):
 *
 *  1. Режим авторизации бэкенда (`bitrix_auth_mode`) закрепляется, если
 *     админ его ещё не выбирал: новому порталу (создан установкой, вебхука
 *     нет) — `app`, действующему (найден по домену) — `webhook`, чтобы
 *     установка приложения не увела его кроны и хуки на OAuth. Выбор
 *     админа установка не трогает никогда.
 *  2. Креды локального приложения клиент заводит по домену (до установки
 *     member_id неизвестен) — после установки копируем их под ключ
 *     member_id, чтобы переименование домена не ломало рефреш.
 *
 * Оба шага best-effort: сбой пишется в лог, установка продолжается —
 * настройку можно поправить в админке, а резолв секретов ищет и по домену.
 */
@Injectable()
export class MarketplaceLocalAppService {
    private readonly logger = new Logger(MarketplaceLocalAppService.name);

    constructor(
        private readonly settings: PortalAppSettingsService,
        private readonly authRepository: MarketplaceAuthRepository,
    ) {}

    async onPortalInstalled(input: PortalInstalledInput): Promise<void> {
        await this.pinAuthMode(input);
        if (input.memberId) {
            await this.rebindSecrets(input.domain, input.memberId);
        }
    }

    private async pinAuthMode(input: PortalInstalledInput): Promise<void> {
        const mode = input.created ? 'app' : 'webhook';
        try {
            const { storedKeys } = await this.settings.resolveWithStored(
                input.domain,
                EnumPortalAppCode.portal,
            );
            if (storedKeys.includes('bitrixAuthMode')) {
                return; // админ уже выбрал — не трогаем
            }
            await this.settings.save(
                Number(input.portal.id),
                EnumPortalAppCode.portal,
                { bitrixAuthMode: mode },
            );
            this.logger.log(
                `Portal ${input.domain}: режим авторизации бэкенда закреплён — ${mode}` +
                    (input.created
                        ? ' (портал создан установкой)'
                        : ' (действующий портал)'),
            );
        } catch (error) {
            this.logger.warn(
                `Portal ${input.domain}: режим авторизации (${mode}) не закреплён — ` +
                    `задайте в админке: ${error instanceof Error ? error.message : String(error)}`,
            );
        }
    }

    private async rebindSecrets(
        domain: string,
        memberId: string,
    ): Promise<void> {
        try {
            await this.authRepository.copyLocalSecretToMemberId(
                domain,
                memberId,
            );
        } catch (error) {
            this.logger.warn(
                `Portal ${domain}: секрет локального приложения не перепривязан ` +
                    `к member_id (резолв продолжит искать по домену): ` +
                    `${error instanceof Error ? error.message : String(error)}`,
            );
        }
    }
}
