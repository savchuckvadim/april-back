import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BitrixAppService } from '@lib/bitrix-setup/app/services/bitrix-app.service';
import {
    BITRIX_APP_CODES,
    BITRIX_APP_GROUPS,
    BITRIX_APP_STATUSES,
    BITRIX_APP_TYPES,
} from '@lib/bitrix-setup/app/enums/bitrix-app.enum';
import { CreateBitrixAppWithTokenDto } from '@lib/bitrix-setup/app/dto/bitrix-app.dto';
import { BitrixTokenDto } from '@lib/bitrix-setup/token/dto/bitrix-token.dto';
import {
    BitrixInstallRequestSource,
    BitrixInstallTokenPayload,
    getExpiresAtIso,
    InstallChannel,
    isInstallable,
    parseInstallParams,
} from '../lib/parse-install-params.util';
import { MarketplaceInstallResultDto } from '../dto/marketplace-install.dto';

/**
 * Установка тиражного маркетплейс-приложения («Менеджер Гарант»).
 *
 * Отличия от легаси-флоу (apps/back/bitrix-app-client — НЕ трогаем):
 *  - портал НЕ обязан существовать заранее: storeOrUpdateAppWithToken
 *    сам создаёт запись портала по домену (provisioning при установке);
 *  - status=success только если токены реально сохранены;
 *  - application_token при установке СОХРАНЯЕТСЯ (не сверяется — при
 *    переустановке Битрикс выдаёт новый; сверка нужна для событий
 *    жизненного цикла, это следующий этап);
 *  - код приложения единый (BITRIX_APP_CODES.GARANT), продукты — внутри.
 */
@Injectable()
export class MarketplaceInstallService {
    private readonly logger = new Logger(MarketplaceInstallService.name);

    /** Куда редиректить iframe мастера установки после сохранения токенов */
    readonly installRedirectUrl: string;

    constructor(
        private readonly bitrixAppService: BitrixAppService,
        private readonly configService: ConfigService,
    ) {
        this.installRedirectUrl =
            this.configService.get<string>(
                'MARKETPLACE_INSTALL_REDIRECT_URL',
            ) ?? 'https://bitrix.april-app.ru/install';
    }

    /**
     * Приём установки напрямую от Битрикса (оба канала:
     * ONAPPINSTALL и iframe PLACEMENT=DEFAULT). Идемпотентно.
     */
    async installFromBitrixRequest(
        body: BitrixInstallRequestSource,
        query: BitrixInstallRequestSource,
    ): Promise<MarketplaceInstallResultDto> {
        const payload = parseInstallParams(body, query);
        const base: MarketplaceInstallResultDto = {
            status: 'fail',
            channel: payload.channel,
            domain: payload.domain,
            memberId: payload.member_id,
        };

        if (!isInstallable(payload)) {
            this.logger.warn(
                `Install rejected: channel=${payload.channel} domain=${payload.domain ?? '-'} — не хватает токенов`,
            );
            return {
                ...base,
                message: 'Не хватает токенов в запросе установки',
            };
        }

        return this.storeInstall(this.buildDtoFromPayload(payload), base);
    }

    /**
     * Сохранение/обновление токенов из УЖЕ разобранного payload
     * (используется роутером открытий: каждый запуск iframe приносит
     * свежую пару AUTH_ID/REFRESH_ID — обновляем сохранённую).
     */
    async storeFromPayload(
        payload: BitrixInstallTokenPayload,
    ): Promise<MarketplaceInstallResultDto> {
        const base: MarketplaceInstallResultDto = {
            status: 'fail',
            channel: payload.channel,
            domain: payload.domain,
            memberId: payload.member_id,
        };
        if (!isInstallable(payload)) {
            return {
                ...base,
                message: 'Не хватает токенов в запросе открытия',
            };
        }
        return this.storeInstall(this.buildDtoFromPayload(payload), base);
    }

    private buildDtoFromPayload(
        payload: BitrixInstallTokenPayload,
    ): CreateBitrixAppWithTokenDto {
        return {
            code: BITRIX_APP_CODES.GARANT,
            domain: payload.domain as string,
            group: BITRIX_APP_GROUPS.GENERAL,
            type: BITRIX_APP_TYPES.FULL,
            status: BITRIX_APP_STATUSES.ACTIVE,
            token: {
                access_token: payload.access_token,
                refresh_token: payload.refresh_token,
                expires_at: getExpiresAtIso(payload.expires_in),
                application_token: payload.application_token,
                member_id: payload.member_id,
            } as BitrixTokenDto,
        };
    }

    /**
     * Приём установки от фронта (front/apps/bitrix шлёт DTO перед
     * installFinish) — маркетплейс-аналог легаси sales-manager.
     */
    async installFromFront(
        dto: CreateBitrixAppWithTokenDto,
    ): Promise<MarketplaceInstallResultDto> {
        const base: MarketplaceInstallResultDto = {
            status: 'fail',
            channel: InstallChannel.FRONT,
            domain: dto.domain,
            memberId: dto.token?.member_id,
        };
        return this.storeInstall(dto, base);
    }

    private async storeInstall(
        dto: CreateBitrixAppWithTokenDto,
        base: MarketplaceInstallResultDto,
    ): Promise<MarketplaceInstallResultDto> {
        try {
            const existingAppId = await this.findExistingAppId(
                dto.domain,
                dto.code,
            );
            const result =
                await this.bitrixAppService.storeOrUpdateAppWithToken(
                    dto,
                    existingAppId,
                );
            this.logger.log(
                `Install stored: domain=${dto.domain} code=${dto.code} appId=${String(result.app.id)}`,
            );
            return {
                ...base,
                status: 'success',
                appId: String(result.app.id),
            };
        } catch (error) {
            this.logger.error(
                `Install failed: domain=${dto.domain} code=${dto.code}`,
                error instanceof Error ? error.stack : String(error),
            );
            return {
                ...base,
                message: error instanceof Error ? error.message : String(error),
            };
        }
    }

    /** Ищет существующую запись приложения, чтобы upsert не плодил дубли. */
    private async findExistingAppId(
        domain: string,
        code: BITRIX_APP_CODES,
    ): Promise<bigint | undefined> {
        try {
            const app = await this.bitrixAppService.getApp({ domain, code });
            return app?.id ? BigInt(app.id) : undefined;
        } catch (error) {
            if (error instanceof NotFoundException) {
                return undefined;
            }
            throw error;
        }
    }
}
