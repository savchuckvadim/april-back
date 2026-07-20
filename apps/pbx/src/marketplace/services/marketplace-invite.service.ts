import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    HttpException,
    HttpStatus,
    Injectable,
    Logger,
    NotFoundException,
} from '@nestjs/common';
import { BITRIX_APP_CODES } from '@lib/bitrix-setup/app/enums/bitrix-app.enum';
import { hashInviteCode } from '@lib/marketplace-core';
import { RedisService } from '@/core/redis/redis.service';
import { MarketplaceInstallRepository } from '../persistence/marketplace-install.repository';
import { MarketplaceProductService } from './marketplace-product.service';
import {
    computePortalSessionState,
    PortalSessionState,
} from './marketplace-session.service';
import { MarketplaceProduct } from '../config/marketplace-manifest';
import {
    InstallProductResultDto,
    RedeemInviteResultDto,
} from '../dto/marketplace-invite.dto';

/**
 * Погашение кода подключения портала к внешнему сервису April.
 *
 * Приложение — клиентский интерфейс внешнего сервиса: партнёр получает код
 * по договору (письмом из админки) и вводит его в кабинете. Погашение
 * привязывает портал к организации и открывает допуск; установка сущностей
 * запускается сразу или отдельной кнопкой клиента — см. auto_provision
 * (переключатель на случай, когда перед установкой нужно провести клиента
 * по мастеру вопросов).
 *
 * Контекст портала берётся ТОЛЬКО из portal-context токена (member_id),
 * никаких domain/member_id из тела запроса.
 */

/** Окно и лимит попыток ввода кода — защита от перебора */
const ATTEMPTS_WINDOW_SECONDS = 15 * 60;
const MAX_ATTEMPTS_PER_WINDOW = 5;
const ATTEMPTS_KEY_PREFIX = 'mp:invite:attempts:';

@Injectable()
export class MarketplaceInviteService {
    private readonly logger = new Logger(MarketplaceInviteService.name);
    private readonly appCode = BITRIX_APP_CODES.GARANT as string;

    constructor(
        private readonly repository: MarketplaceInstallRepository,
        private readonly productService: MarketplaceProductService,
        private readonly redisService: RedisService,
    ) {}

    /** Ввод кода подключения из кабинета */
    async redeemCode(
        memberId: string,
        rawCode: string,
    ): Promise<RedeemInviteResultDto> {
        await this.assertNotThrottled(memberId);

        const install = await this.requireActiveInstall(memberId);
        const portal = install.portals;

        if (portal.approval_status === 'blocked') {
            throw new ForbiddenException(
                'Подключение этого портала приостановлено — свяжитесь с нами: april-app@mail.ru',
            );
        }

        const invite = await this.repository.findRedeemableInvite(
            hashInviteCode(rawCode),
        );
        if (!invite) {
            // Причину (нет такого / истёк / отозван / уже погашен) НЕ
            // раскрываем — иначе код можно перебирать по ответам.
            await this.repository.logEvent({
                memberId,
                domain: portal.domain ?? undefined,
                event: 'INVITE_REDEEM_FAILED',
                status: 'error',
                errorDetail: 'код не найден, истёк или уже использован',
            });
            throw new BadRequestException(
                'Код не найден или больше не действует. Проверьте код из письма или запросите новый.',
            );
        }

        if (
            invite.client_id !== null &&
            portal.client_id !== null &&
            portal.client_id !== invite.client_id
        ) {
            throw new ConflictException(
                'Портал уже подключён к другой организации. Напишите на april-app@mail.ru — поможем перепривязать.',
            );
        }

        if (invite.client_id !== null && portal.client_id === null) {
            await this.repository.attachClientToPortal(
                portal.id,
                invite.client_id,
            );
        }

        const productCode = invite.product_code as MarketplaceProduct;

        if (invite.auto_provision) {
            // Полный сценарий: допуск + продукт active + запуск установки
            await this.productService.activateProduct({
                memberId,
                productCode,
                approvedBy: `invite:${invite.id}`,
            });
        } else {
            // Установку запустит клиент сам (кнопка/мастер настройки):
            // допуск открываем, продукт заводим неактивным, очередь не трогаем
            await this.repository.setApprovalStatus(
                portal.id,
                'approved',
                `invite:${invite.id}`,
            );
            await this.repository.upsertPortalProduct(
                portal.id,
                productCode,
                'inactive',
            );
        }

        await this.repository.markInviteRedeemed(invite.id, portal.id);
        await this.repository.logEvent({
            memberId,
            domain: portal.domain ?? undefined,
            event: 'INVITE_REDEEMED',
            status: 'processed',
            // сам код в журнал не пишем — только идентификатор записи
            payload: JSON.stringify({
                inviteId: invite.id,
                productCode,
                autoProvision: invite.auto_provision,
            }),
        });
        await this.resetAttempts(memberId);

        this.logger.log(
            `Invite redeemed: portal=${portal.id} invite=${invite.id} product=${productCode} auto=${invite.auto_provision}`,
        );

        const state = computePortalSessionState(
            'approved',
            invite.client_id ?? portal.client_id,
        );
        return {
            state,
            productCode,
            provisionStarted: invite.auto_provision,
            organizationName: invite.organization ?? undefined,
        };
    }

    /**
     * Клиентский запуск установки продукта (кнопка в кабинете).
     * Нужен при auto_provision=false и как точка входа будущего мастера
     * настройки: мастер соберёт данные и в финале дёрнет этот же метод.
     */
    async installProduct(
        memberId: string,
        productCode: MarketplaceProduct,
    ): Promise<InstallProductResultDto> {
        const install = await this.requireActiveInstall(memberId);
        const portal = install.portals;

        const state = computePortalSessionState(
            portal.approval_status,
            portal.client_id,
        );
        if (state !== PortalSessionState.ACTIVE) {
            throw new ForbiddenException(
                'Портал не подключён к сервису April — сначала введите код подключения.',
            );
        }

        const result = await this.productService.activateProduct({
            memberId,
            productCode,
            approvedBy: 'client:cabinet',
        });

        return {
            productCode,
            provisionStarted: result.provisionDispatched,
        };
    }

    /** Активная установка приложения на портале (иначе понятная ошибка) */
    private async requireActiveInstall(memberId: string) {
        const install = await this.repository.findInstallWithClient(
            memberId,
            this.appCode,
        );
        if (!install) {
            throw new NotFoundException('Установка приложения не найдена');
        }
        if (install.uninstalled_at) {
            throw new BadRequestException(
                'Приложение удалено с портала — установите его заново из Маркета',
            );
        }
        return install;
    }

    /** Счётчик попыток ввода: код короткий, перебор реален */
    private async assertNotThrottled(memberId: string): Promise<void> {
        const key = `${ATTEMPTS_KEY_PREFIX}${memberId}`;
        try {
            const redis = this.redisService.getClient();
            const attempts = await redis.incr(key);
            if (attempts === 1) {
                await redis.expire(key, ATTEMPTS_WINDOW_SECONDS);
            }
            if (attempts > MAX_ATTEMPTS_PER_WINDOW) {
                throw new HttpException(
                    'Слишком много попыток ввода кода. Попробуйте через 15 минут.',
                    HttpStatus.TOO_MANY_REQUESTS,
                );
            }
        } catch (error) {
            if (error instanceof HttpException) {
                throw error;
            }
            // Redis недоступен — не блокируем подключение из-за счётчика
            this.logger.warn(
                `Счётчик попыток недоступен (${memberId}): ${
                    error instanceof Error ? error.message : String(error)
                }`,
            );
        }
    }

    /** Успешное погашение обнуляет счётчик */
    private async resetAttempts(memberId: string): Promise<void> {
        try {
            await this.redisService
                .getClient()
                .del(`${ATTEMPTS_KEY_PREFIX}${memberId}`);
        } catch {
            // счётчик сам истечёт по TTL
        }
    }
}
