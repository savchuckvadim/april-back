import {
    BadRequestException,
    ForbiddenException,
    HttpException,
    HttpStatus,
    Injectable,
    Logger,
    NotFoundException,
    Optional,
} from '@nestjs/common';
import { TelegramService } from '@lib/telegram';
import { BITRIX_APP_CODES } from '@lib/bitrix-setup/app/enums/bitrix-app.enum';
import { RedisService } from '@/core/redis/redis.service';
import { MarketplaceInstallRepository } from '../persistence/marketplace-install.repository';
import { MarketplaceClientRepository } from '../persistence/marketplace-client.repository';
import { maskEmail } from '../lib/mask-email.util';
import {
    computePortalSessionState,
    PortalSessionState,
} from './marketplace-session.service';
import {
    OnboardingApplicationDto,
    OnboardingStateDto,
    RequestInviteCodeDto,
    RequestInviteCodeResultDto,
} from '../dto/marketplace-onboarding.dto';

/** Окно и лимит запросов кода подключения по одному порталу */
const REQUEST_WINDOW_SECONDS = 3600;
const MAX_REQUESTS_PER_WINDOW = 3;

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
        private readonly clientRepository: MarketplaceClientRepository,
        private readonly redisService: RedisService,
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
                          emailMasked: maskEmail(portal.clients.email),
                      },
                  }
                : {}),
        };
    }

    /** Подача/редактирование заявки (идемпотентно; blocked — запрещено) */
    async submitApplication(
        memberId: string,
        dto: OnboardingApplicationDto,
        bitrixUserId?: string,
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
            const client = await this.clientRepository.linkClientWithRootUser(
                portal.id,
                {
                    organizationName: dto.organizationName,
                    contactEmail: dto.contactEmail,
                    lastName: dto.lastName,
                    firstName: dto.firstName,
                    bitrixUserId,
                },
            );
            clientName = client.name;
        } catch (error) {
            // clients.email и users.email имеют unique-индексы — понятная
            // ошибка вместо 500 от Prisma
            if (
                error instanceof Error &&
                error.message.includes('Unique constraint')
            ) {
                throw new BadRequestException(
                    'Этот email уже используется другой организацией — укажите другой контактный email',
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
                contactPerson: `${dto.lastName} ${dto.firstName}`,
                bitrixUserId,
                repeated: !isNew,
            }),
        });

        await this.notifyVendor(
            [
                isNew
                    ? '🆕 Новая заявка на подключение «Менеджер Гарант»'
                    : '✏️ Заявка на подключение обновлена',
                `Организация: ${dto.organizationName}`,
                `Контакт: ${dto.lastName} ${dto.firstName}`,
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

    /**
     * Запрос кода подключения: «пришлите ещё раз» или «пришлите на другой
     * адрес». Сам код выпускает вендор в админке — здесь мы фиксируем запрос,
     * проверяем права и уведомляем.
     *
     * Контактный email организации НЕ переписывается: адрес доставки относится
     * к конкретному коду (ai/tasks/bitrix-marketplace-client-identity.md,
     * «доставка ≠ идентичность»). Поэтому потеря доступа к почте ничего
     * необратимого не делает.
     */
    async requestCode(
        memberId: string,
        dto: RequestInviteCodeDto,
        actor: { isAdmin?: boolean; bitrixUserId?: string },
    ): Promise<RequestInviteCodeResultDto> {
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
                'Доступ портала отключён вендором — свяжитесь с поддержкой',
            );
        }
        if (!portal.clients) {
            throw new BadRequestException(
                'Сначала заполните данные организации — тогда мы сможем выслать код',
            );
        }

        const contactEmail = portal.clients.email ?? '';
        const deliveryEmail = dto.deliveryEmail?.trim() || contactEmail;
        if (!deliveryEmail) {
            throw new BadRequestException(
                'У организации не указан контактный email — укажите адрес доставки',
            );
        }

        const toAnotherAddress =
            deliveryEmail.toLowerCase() !== contactEmail.toLowerCase();

        // Отправку на посторонний адрес вправе запросить только администратор
        // портала: он и так владеет порталом целиком, новых прав это не даёт,
        // а рядового сотрудника, который увёл бы код себе, отсекает.
        if (toAnotherAddress && !actor.isAdmin) {
            throw new ForbiddenException(
                'Отправить код на другой адрес может только администратор портала Битрикс24',
            );
        }

        await this.assertRequestRateLimit(memberId);

        await this.repository.logEvent({
            memberId,
            domain: portal.domain ?? undefined,
            event: 'INVITE_CODE_REQUESTED',
            status: 'processed',
            payload: JSON.stringify({
                deliveryEmail,
                contactEmail,
                toAnotherAddress,
                bitrixUserId: actor.bitrixUserId,
                isAdmin: actor.isAdmin === true,
            }),
        });

        await this.notifyVendor(
            [
                toAnotherAddress
                    ? '📨 Запрос кода подключения НА ДРУГОЙ АДРЕС'
                    : '📨 Запрос кода подключения',
                `Организация: ${portal.clients.name}`,
                `Отправить на: ${deliveryEmail}`,
                ...(toAnotherAddress
                    ? [`Контактный email организации: ${contactEmail}`]
                    : []),
                `Портал: ${portal.domain ?? '-'}`,
                `Запросил bitrix_id: ${actor.bitrixUserId ?? '-'}`,
                `member_id: ${memberId}`,
            ].join('\n'),
        );

        this.logger.log(
            `Invite code requested (member_id=${memberId}, another_address=${toAnotherAddress})`,
        );

        return {
            accepted: true,
            deliveryEmailMasked: maskEmail(deliveryEmail),
        };
    }

    /**
     * Лимит запросов кода по порталу: 3 в час.
     *
     * Держит в узде и назойливые «пришлите ещё раз», и перебор адресов
     * доставки. Redis недоступен — запрос не блокируем (лимит вспомогательный,
     * а не защитный: право на смену адреса проверено отдельно).
     */
    private async assertRequestRateLimit(memberId: string): Promise<void> {
        const key = `mp:invite:requests:${memberId}`;
        try {
            const client = this.redisService.getClient();
            const attempts = await client.incr(key);
            if (attempts === 1) {
                await client.expire(key, REQUEST_WINDOW_SECONDS);
            }
            if (attempts > MAX_REQUESTS_PER_WINDOW) {
                throw new HttpException(
                    'Слишком много запросов кода — попробуйте через час или напишите нам на april-app@mail.ru',
                    HttpStatus.TOO_MANY_REQUESTS,
                );
            }
        } catch (error) {
            if (error instanceof HttpException) throw error;
            this.logger.warn(
                `Redis недоступен — лимит запросов кода не проверен: ${error instanceof Error ? error.message : String(error)}`,
            );
        }
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
