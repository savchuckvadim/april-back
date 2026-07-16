import {
    BadRequestException,
    ForbiddenException,
    Injectable,
    Logger,
    NotFoundException,
    Optional,
} from '@nestjs/common';
import { TelegramService } from '@lib/telegram';
import { BITRIX_APP_CODES } from '@lib/bitrix-setup/app/enums/bitrix-app.enum';
import { MarketplaceInstallRepository } from '../persistence/marketplace-install.repository';
import {
    computePortalSessionState,
    PortalSessionState,
} from './marketplace-session.service';
import {
    OnboardingApplicationDto,
    OnboardingStateDto,
} from '../dto/marketplace-onboarding.dto';

/**
 * Онбординг клиента (этап 2 задачи
 * ai/tasks/bitrix-marketplace-client-onboarding.md): «заявка, не регистрация».
 *
 * Клиент, установивший приложение, подаёт заявку из двух полей
 * (организация + контактный email) под portal-context сессией. Заявка
 * создаёт Client(status='pending') и привязывает его к порталу по
 * member_id (идемпотентный upsert — повторная подача до одобрения
 * редактирует заявку). Пароль/подтверждение почты НЕ требуются —
 * это зона apps/auth (centralized-auth), позже.
 *
 * Уведомление вендору — Telegram (@lib/telegram, admin-чат) + журнал
 * bitrix_app_events: канал уже существует в инфраструктуре и приходит
 * мгновенно (решение открытого вопроса №4 задачи; email вендору можно
 * добавить с появлением apps/auth). Отправка best-effort: сбой Telegram
 * не роняет заявку (факт остаётся в журнале).
 */
@Injectable()
export class MarketplaceOnboardingService {
    private readonly logger = new Logger(MarketplaceOnboardingService.name);
    private readonly appCode = BITRIX_APP_CODES.GARANT as string;

    constructor(
        private readonly repository: MarketplaceInstallRepository,
        @Optional() private readonly telegramService?: TelegramService,
    ) {}

    /** Текущее состояние допуска + поданная заявка (для экранов фронта) */
    async getState(memberId: string): Promise<OnboardingStateDto> {
        const install = await this.repository.findInstallWithClient(
            memberId,
            this.appCode,
        );
        if (!install || install.uninstalled_at) {
            throw new NotFoundException('Установка приложения не найдена');
        }
        const portal = install.portals;
        const state = computePortalSessionState(
            portal.approval_status,
            portal.client_id,
        );
        return {
            state,
            ...(portal.clients
                ? {
                      organization: {
                          name: portal.clients.name,
                          email: portal.clients.email ?? undefined,
                      },
                  }
                : {}),
        };
    }

    /** Подача/редактирование заявки (идемпотентно; blocked — запрещено) */
    async submitApplication(
        memberId: string,
        dto: OnboardingApplicationDto,
    ): Promise<OnboardingStateDto> {
        const install = await this.repository.findInstallWithClient(
            memberId,
            this.appCode,
        );
        if (!install || install.uninstalled_at) {
            throw new NotFoundException('Установка приложения не найдена');
        }
        const portal = install.portals;
        const state = computePortalSessionState(
            portal.approval_status,
            portal.client_id,
        );
        if (state === PortalSessionState.BLOCKED) {
            throw new ForbiddenException(
                'Доступ портала отключён вендором — заявка невозможна, свяжитесь с поддержкой',
            );
        }
        if (state === PortalSessionState.ACTIVE) {
            // уже одобрен — заявка не нужна, но данные обновить позволим
            this.logger.log(
                `Onboarding: правка данных уже одобренного клиента (member_id=${memberId})`,
            );
        }

        const isNew = portal.client_id === null;
        let clientName: string;
        try {
            const client = await this.repository.linkClient(portal.id, {
                organizationName: dto.organizationName,
                contactEmail: dto.contactEmail,
            });
            clientName = client.name;
        } catch (error) {
            // clients.email имеет unique-индекс — понятная ошибка вместо 500
            if (
                error instanceof Error &&
                error.message.includes('Unique constraint')
            ) {
                throw new BadRequestException(
                    'Этот email уже используется другим клиентом — укажите другой контактный email',
                );
            }
            throw error;
        }

        await this.repository.logEvent({
            memberId,
            domain: portal.domain ?? undefined,
            event: 'ONBOARDING_APPLICATION',
            status: 'processed',
            payload: JSON.stringify({
                organizationName: dto.organizationName,
                contactEmail: dto.contactEmail,
                repeated: !isNew,
            }),
        });

        await this.notifyVendor(
            [
                isNew
                    ? '🆕 Новая заявка на подключение «Менеджер Гарант»'
                    : '✏️ Заявка на подключение обновлена',
                `Организация: ${dto.organizationName}`,
                `Email: ${dto.contactEmail}`,
                `Портал: ${portal.domain ?? '-'}`,
                `member_id: ${memberId}`,
            ].join('\n'),
        );

        this.logger.log(
            `Onboarding application ${isNew ? 'created' : 'updated'}: "${clientName}" (member_id=${memberId})`,
        );
        return this.getState(memberId);
    }

    /** Best-effort уведомление вендора (сбой не роняет заявку) */
    private async notifyVendor(message: string): Promise<void> {
        if (!this.telegramService) {
            this.logger.warn(
                'TelegramService недоступен — уведомление вендору только в журнале',
            );
            return;
        }
        try {
            await this.telegramService.sendMessage(message);
        } catch (error) {
            this.logger.warn(
                `Не удалось отправить Telegram-уведомление вендору: ${error instanceof Error ? error.message : String(error)}`,
            );
        }
    }
}
