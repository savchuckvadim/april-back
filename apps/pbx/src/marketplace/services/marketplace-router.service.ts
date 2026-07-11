import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
    BitrixInstallRequestSource,
    BitrixOpenPayload,
    parseOpenParams,
} from '../lib/parse-install-params.util';
import { MarketplaceInstallService } from './marketplace-install.service';
import { MarketplaceRouteResultDto } from '../dto/marketplace-router.dto';

/**
 * Маршрутизация открытий маркетплейс-приложения «Менеджер Гарант».
 *
 * Битрикс открывает и основное приложение, и все плейсменты POST-ом
 * (в теле — AUTH_ID/REFRESH_ID/member_id/DOMAIN/PLACEMENT). Сервис:
 *  1) сохраняет/обновляет токены из каждого открытия (бесплатный refresh);
 *  2) строит redirect на фронт; URL фронта подменяется через env —
 *     в Битриксе зарегистрирован стабильный URL бэка, маршрутизация
 *     за ним меняется без перерегистрации в карточке/placement.bind.
 */
@Injectable()
export class MarketplaceRouterService {
    private readonly logger = new Logger(MarketplaceRouterService.name);

    /** Фронт основного приложения (кабинет в левом меню Битрикса) */
    readonly appRedirectUrl: string;
    /** База фронта плейсментов: `${base}/<code>` */
    readonly placementRedirectBase: string;

    constructor(
        private readonly installService: MarketplaceInstallService,
        private readonly configService: ConfigService,
    ) {
        this.appRedirectUrl =
            this.configService.get<string>('MARKETPLACE_APP_REDIRECT_URL') ??
            'https://bitrix.april-app.ru/bitrix/cabinet';
        this.placementRedirectBase =
            this.configService.get<string>(
                'MARKETPLACE_PLACEMENT_REDIRECT_BASE',
            ) ?? 'https://bitrix.april-app.ru/portal/placement';
    }

    /** Открытие основного приложения (левое меню Битрикса). */
    async handleAppOpen(
        body: BitrixInstallRequestSource,
        query: BitrixInstallRequestSource,
    ): Promise<MarketplaceRouteResultDto> {
        const payload = parseOpenParams(body, query);
        const stored = await this.installService.storeFromPayload(payload);
        return {
            status: stored.status,
            redirectUrl: this.buildRedirectUrl(this.appRedirectUrl, payload, {
                status: stored.status,
            }),
            domain: payload.domain,
            memberId: payload.member_id,
            placement: payload.placement,
        };
    }

    /** Открытие плейсмента (виджета) по коду места встройки. */
    async handlePlacementOpen(
        code: string,
        body: BitrixInstallRequestSource,
        query: BitrixInstallRequestSource,
    ): Promise<MarketplaceRouteResultDto> {
        const payload = parseOpenParams(body, query);
        const stored = await this.installService.storeFromPayload(payload);
        const target = `${this.placementRedirectBase}/${encodeURIComponent(code)}`;
        return {
            status: stored.status,
            redirectUrl: this.buildRedirectUrl(target, payload, {
                status: stored.status,
                placement_options: payload.placementOptions,
            }),
            domain: payload.domain,
            memberId: payload.member_id,
            placement: payload.placement ?? code,
        };
    }

    /**
     * Хук, вызываемый из универсальных списков (и прочих механик Битрикса,
     * дергающих URL). Заглушка-приёмник: журналирует и отвечает 200 —
     * обработчики по кодам добавляются по мере появления сценариев.
     */
    handleListHook(
        code: string,
        body: BitrixInstallRequestSource,
        query: BitrixInstallRequestSource,
    ): { status: 'ok'; code: string } {
        const payload = parseOpenParams(body, query);
        this.logger.log(
            `List hook received: code=${code} domain=${payload.domain ?? '-'} member_id=${payload.member_id ?? '-'}`,
        );
        return { status: 'ok', code };
    }

    private buildRedirectUrl(
        target: string,
        payload: BitrixOpenPayload,
        extra: Record<string, string | undefined>,
    ): string {
        const url = new URL(target);
        if (payload.domain) {
            url.searchParams.set('domain', payload.domain);
        }
        if (payload.member_id) {
            url.searchParams.set('member_id', payload.member_id);
        }
        if (payload.lang) {
            url.searchParams.set('lang', payload.lang);
        }
        for (const [key, value] of Object.entries(extra)) {
            if (value) {
                url.searchParams.set(key, value);
            }
        }
        return url.toString();
    }
}
