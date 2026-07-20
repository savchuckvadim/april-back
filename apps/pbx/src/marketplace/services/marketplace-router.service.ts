import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BITRIX_APP_CODES } from '@lib/bitrix-setup/app/enums/bitrix-app.enum';
import {
    MarketplaceComponentStateRepository,
    MarketplaceComponentType,
} from '@lib/marketplace-core';
import {
    BitrixInstallRequestSource,
    BitrixOpenPayload,
    parseOpenParams,
} from '../lib/parse-install-params.util';
import { renderWidgetStubPage } from '../lib/widget-stub-page.util';
import { MarketplaceInstallService } from './marketplace-install.service';
import { MarketplaceSessionService } from './marketplace-session.service';
import { MarketplaceInstallRepository } from '../persistence/marketplace-install.repository';
import { MarketplaceRouteResultDto } from '../dto/marketplace-router.dto';
import {
    findWidgetByCode,
    isKnownWidgetCode,
    WidgetManifestItem,
} from '../config/marketplace-manifest';

/**
 * Маршрутизация открытий маркетплейс-приложения «Менеджер Гарант».
 *
 * Битрикс открывает и основное приложение, и все виджеты POST-ом
 * (в теле — AUTH_ID/REFRESH_ID/member_id/DOMAIN/PLACEMENT). Сервис:
 *  1) сохраняет/обновляет токены из каждого открытия (бесплатный refresh);
 *  2) строит redirect на фронт. Фронты виджетов живут на РАЗНЫХ доменах:
 *     цель берётся из эталона-манифеста (frontUrl виджета) и подменяется
 *     env-переменной MARKETPLACE_WIDGET_URL_<КОД> (дефисы → подчёркивания,
 *     напр. MARKETPLACE_WIDGET_URL_EVENT_SALES) БЕЗ деплоя. В Битриксе
 *     зарегистрированы только стабильные URL бэка — перерегистрация
 *     привязок при смене фронтов не нужна.
 */
@Injectable()
export class MarketplaceRouterService {
    private readonly logger = new Logger(MarketplaceRouterService.name);

    /** Фронт основного приложения (кабинет в левом меню Битрикса) */
    readonly appRedirectUrl: string;

    constructor(
        private readonly installService: MarketplaceInstallService,
        private readonly sessionService: MarketplaceSessionService,
        private readonly configService: ConfigService,
        private readonly repository: MarketplaceInstallRepository,
        private readonly componentState: MarketplaceComponentStateRepository,
    ) {
        this.appRedirectUrl =
            this.configService.get<string>('MARKETPLACE_APP_REDIRECT_URL') ??
            'https://bitrix.april-app.ru/cabinet';
    }

    /** Целевой URL фронта виджета: env-подмена приоритетнее манифеста */
    resolveWidgetFrontUrl(code: string, manifestUrl: string): string {
        const envKey = `MARKETPLACE_WIDGET_URL_${code.toUpperCase().replace(/-/g, '_')}`;
        const override = this.configService.get<string>(envKey);
        if (override) {
            this.logger.log(
                `Widget "${code}": frontUrl подменён через ${envKey}`,
            );
            return override;
        }
        return manifestUrl;
    }

    /**
     * Открытие основного приложения (левое меню Битрикса).
     *
     * Гейт + сессия (этап 1 онбординга): запрос верифицируется
     * (member_id + application_token + REST profile), состояние допуска
     * (onboarding/pending/active/blocked) и ОДНОРАЗОВЫЙ код сессии уезжают
     * на фронт в query; сырые member_id/т.п. фронту больше не передаются —
     * контекст он получает обменом кода (POST /session/exchange).
     * Непройденная верификация → redirect state=unauthorized (без кода).
     */
    async handleAppOpen(
        body: BitrixInstallRequestSource,
        query: BitrixInstallRequestSource,
    ): Promise<MarketplaceRouteResultDto> {
        const payload = parseOpenParams(body, query);
        const stored = await this.installService.storeFromPayload(payload);
        const session = await this.sessionService.openSession(payload);

        const state = session.ok ? (session.state as string) : 'unauthorized';
        return {
            status: session.ok ? stored.status : 'fail',
            redirectUrl: this.buildRedirectUrl(
                this.appRedirectUrl,
                payload,
                {
                    status: session.ok ? stored.status : 'fail',
                    state,
                    code: session.code,
                    reason: session.ok ? undefined : session.reason,
                },
                { omitMemberId: true },
            ),
            domain: payload.domain,
            memberId: payload.member_id,
            placement: payload.placement,
            state,
        };
    }

    /**
     * Открытие виджета по НАШЕМУ коду из эталона-манифеста
     * (SalesWidgetCode: event-sales | konstructor | report-sales).
     * Один виджет открывается из ЛЮБОГО из своих мест встройки —
     * конкретное место приходит в POST-поле PLACEMENT.
     * Неизвестный код = рассинхрон эталона с привязками на порталах:
     * warning в лог + redirect в кабинет с reason=unknown_placement.
     */
    async handlePlacementOpen(
        code: string,
        body: BitrixInstallRequestSource,
        query: BitrixInstallRequestSource,
    ): Promise<MarketplaceRouteResultDto> {
        const payload = parseOpenParams(body, query);

        if (!isKnownWidgetCode(code)) {
            this.logger.warn(
                `Unknown placement code="${code}" domain=${payload.domain ?? '-'} member_id=${payload.member_id ?? '-'} — код отсутствует в манифесте`,
            );
            return {
                status: 'fail',
                redirectUrl: this.buildRedirectUrl(
                    this.appRedirectUrl,
                    payload,
                    { status: 'fail', reason: 'unknown_placement' },
                ),
                domain: payload.domain,
                memberId: payload.member_id,
                placement: payload.placement ?? code,
            };
        }
        const widget = findWidgetByCode(code);
        const stored = await this.installService.storeFromPayload(payload);

        // Readiness-гейт: пока pbx-сущности продукта не установлены
        // (или портал blocked/удалён) — same-origin заглушка вместо
        // redirect: без сущностей виджет сломается.
        const stubHtml = widget
            ? await this.buildReadinessStub(widget, payload)
            : undefined;
        if (stubHtml) {
            return {
                status: stored.status,
                redirectUrl: '',
                stubHtml,
                domain: payload.domain,
                memberId: payload.member_id,
                placement: payload.placement ?? code,
            };
        }

        const target = this.resolveWidgetFrontUrl(
            code,
            widget?.frontUrl ?? this.appRedirectUrl,
        );
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
     * HTML-заглушка, если виджет открывать рано/нельзя; undefined — виджет
     * готов, выполняем обычный redirect.
     *
     * Готовность = агрегатный компонент pbx_entities продукта виджета
     * (component_code='' — его ведёт install-пайплайн и воркер provisioning)
     * в статусе installed. ЛЕГАСИ-порталы (approval_status IS NULL или
     * source!='marketplace') гейт пропускает: их сущности ставились вручную
     * в старом мире, marketplace-компонентов у них нет.
     */
    private async buildReadinessStub(
        widget: WidgetManifestItem,
        payload: BitrixOpenPayload,
    ): Promise<string | undefined> {
        const appCode = BITRIX_APP_CODES.GARANT as string;
        const install = payload.member_id
            ? await this.repository.findInstallByMemberId(
                  payload.member_id,
                  appCode,
              )
            : payload.domain
              ? await this.repository.findInstallByDomain(
                    payload.domain,
                    appCode,
                )
              : null;

        // Нет marketplace-установки — легаси-мир (виджет привязан старым
        // способом): гейт не вмешивается.
        if (!install) {
            return undefined;
        }
        const portal = install.portals;
        if (
            portal.source !== 'marketplace' ||
            portal.approval_status === null
        ) {
            return undefined; // легаси-доверие (как в session-state)
        }

        // ФОРМУЛИРОВКИ заглушек: приложение подаётся в Маркет как
        // клиентский интерфейс ВНЕШНЕГО СЕРВИСА April. Тексты описывают
        // отсутствие подключения к внешней инфраструктуре, а НЕ
        // «выключенный функционал» (правило Маркета: функционал не должен
        // включаться/выключаться по дополнительным условиям или оплате).
        if (portal.approval_status === 'blocked') {
            return renderWidgetStubPage({
                title: 'Портал отключён от сервиса',
                message:
                    'Обмен данными между этим порталом и внешним сервисом April приостановлен. Чтобы возобновить подключение, напишите на april-app@mail.ru.',
            });
        }
        if (install.uninstalled_at) {
            return renderWidgetStubPage({
                title: 'Приложение удалено',
                message:
                    'Приложение «Менеджер Гарант» удалено с портала. Установите его заново из Маркета.',
            });
        }

        const components = await this.componentState.findComponents({
            installId: install.id,
            productCode: widget.product,
            componentType: MarketplaceComponentType.PBX_ENTITIES,
        });
        const aggregate = components.find(item => item.component_code === '');
        if (aggregate?.status === 'installed') {
            return undefined; // сущности установлены — виджет готов
        }

        const awaitingApproval =
            !aggregate || aggregate.reason_code === 'awaiting_approval';
        return renderWidgetStubPage({
            title: 'Портал не подключён к сервису April',
            message: awaitingApproval
                ? '«Менеджер Гарант» — клиентский интерфейс внешнего сервиса April. Обмен данными начнётся после подключения портала к серверной инфраструктуре April в рамках договора на настройку и сопровождение. Заявку можно оставить в кабинете приложения или написать на april-app@mail.ru.'
                : 'Идёт подключение портала к внешнему сервису April: на портале создаются необходимые поля, смарт-процессы и справочники. Обычно это занимает несколько минут.',
            showRetry: true,
        });
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
        options: { omitMemberId?: boolean } = {},
    ): string {
        const url = new URL(target);
        if (payload.domain) {
            url.searchParams.set('domain', payload.domain);
        }
        // Кабинет контекст получает обменом кода сессии — сырой member_id
        // в его query не передаём; виджетам (легаси-фронты) оставляем.
        if (payload.member_id && !options.omitMemberId) {
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
