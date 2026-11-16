import { randomBytes } from 'node:crypto';
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from 'generated/prisma';
import {
    envOnlyReader,
    VENDOR_SETTINGS_READER,
    vendorSettingOf,
    type VendorSettingKey,
    type VendorSettingsReader,
} from '@lib/vendor-settings';
import { AiEntityDto } from '../ai/dto/ai-entity.dto';
import { AiService } from '../ai/services/ai.service';
import {
    buildCallPageToken,
    CALL_PAGE_LINK_TYPE,
    callPageMarkOf,
    callPageSecretOf,
    callPageSiteOf,
    callPageUrl,
    isCallPageTokenValid,
    parseCallPageToken,
    type CallPageLinkRecordView,
} from './call-page-link.util';

/** Настройка адреса сайта «Отчёта»: на нём живёт страница разбора звонка. */
const REPORT_SITE_SETTING: VendorSettingKey =
    'MARKETPLACE_WIDGET_URL_REPORT_SALES';

/**
 * С какого момента искать отзывы ссылок: страница разбора появилась в
 * ноябре 2026, раньше записей отзыва быть не может.
 */
const CALL_PAGE_LINKS_SINCE = new Date('2026-11-01T00:00:00.000Z');

/** Звонок, на который ведёт проверенная ссылка, и его записи `ais`. */
export interface ResolvedCallPageLink {
    transcriptionId: string;
    records: AiEntityDto[];
}

/** Поля записи отзыва ссылки в `ais`. */
const CALL_PAGE_LINK_RECORD = {
    provider: 'april',
    app: 'call-page',
    status: 'done',
    result: 'Ссылка на страницу разбора звонка отозвана',
} as const;

/**
 * Ссылки-пропуска на страницу разбора звонка: выпуск, проверка и отзыв.
 *
 * Выпускает event-sales (ссылка в карточке разбора и в сделке), проверяет
 * kpi-report-sales (страница на сайте «Отчёта») — секрет у приложений общий,
 * из корневого окружения. Секрет не задан — ссылки не выпускаются и не
 * открываются, приложение при этом работает.
 */
@Injectable()
export class CallPageLinkService {
    private readonly logger = new Logger(CallPageLinkService.name);
    private warned = false;

    private readonly settings: VendorSettingsReader;

    constructor(
        private readonly config: ConfigService,
        private readonly aiService: AiService,
        @Optional()
        @Inject(VENDOR_SETTINGS_READER)
        settings?: VendorSettingsReader,
    ) {
        this.settings =
            settings ?? envOnlyReader(key => config.get<string>(key));
    }

    /**
     * Полный адрес страницы разбора звонка на сайте «Отчёта». Сайт — из
     * настройки адреса виджета «Отчёт ОП KPI» («Настройки приложения»),
     * не задана — адрес по умолчанию. Нет секрета или адрес сайта битый —
     * null: ссылку не пишем.
     */
    async urlFor(transcriptionId: string): Promise<string | null> {
        const token = await this.issue(transcriptionId);
        if (token === null) return null;
        const site = await this.site();
        return site === null ? null : callPageUrl(site, token);
    }

    /**
     * Адреса страниц разбора сразу для нескольких звонков одного портала
     * (списки в приложении «Отчёт»). Отзывы читаются одним узким запросом —
     * только записи отзыва портала, сами разборы звонков не загружаются.
     * Нет секрета или адрес сайта битый — пустой набор.
     */
    async urlsFor(
        domain: string,
        transcriptionIds: readonly string[],
    ): Promise<Map<string, string>> {
        const urls = new Map<string, string>();
        const secret = this.secret();
        if (secret === null || transcriptionIds.length === 0) return urls;
        const site = await this.site();
        if (site === null) return urls;

        const revocations = await this.aiService.findByDomainTypesInPeriod(
            domain,
            [CALL_PAGE_LINK_TYPE],
            CALL_PAGE_LINKS_SINCE,
            new Date(),
        );
        for (const transcriptionId of transcriptionIds) {
            const token = buildCallPageToken(
                secret,
                transcriptionId,
                callPageMarkOf(
                    revocations.filter(
                        record => record.transcription_id === transcriptionId,
                    ),
                ),
            );
            // Номер не годится для ссылки — звонок остаётся без неё.
            if (token !== null) {
                urls.set(transcriptionId, callPageUrl(site, token));
            }
        }
        return urls;
    }

    private async site(): Promise<string | null> {
        const configured = await this.settings
            .get(REPORT_SITE_SETTING)
            .catch(() => null);
        return (
            callPageSiteOf(configured) ??
            callPageSiteOf(vendorSettingOf(REPORT_SITE_SETTING).example)
        );
    }

    /** Ссылка-пропуск по уже прочитанным записям звонка; нет секрета — null. */
    tokenFor(
        transcriptionId: string,
        records: readonly CallPageLinkRecordView[],
    ): string | null {
        const secret = this.secret();
        if (secret === null) return null;
        return buildCallPageToken(
            secret,
            transcriptionId,
            callPageMarkOf(records),
        );
    }

    /** Ссылка-пропуск звонка с чтением его записей. */
    async issue(transcriptionId: string): Promise<string | null> {
        if (this.secret() === null) return null;
        const records = await this.aiService.findByTranscriptionIds([
            transcriptionId,
        ]);
        return this.tokenFor(transcriptionId, records);
    }

    /**
     * Проверка ссылки: чужой формат отсекается без запроса в базу, дальше
     * подпись сверяется с действующей меткой звонка. Не сошлась — null.
     */
    async resolve(token: string): Promise<ResolvedCallPageLink | null> {
        const secret = this.secret();
        const parts = parseCallPageToken(token);
        if (secret === null || parts === null) return null;
        const records = await this.aiService.findByTranscriptionIds([
            parts.transcriptionId,
        ]);
        return isCallPageTokenValid(secret, parts, callPageMarkOf(records))
            ? { transcriptionId: parts.transcriptionId, records }
            : null;
    }

    /**
     * Отзыв: у звонка появляется новая метка, прежние ссылки перестают
     * открываться. Возвращает новую ссылку (её нужно раздать заново).
     */
    async revoke(
        transcriptionId: string,
        domain: string,
    ): Promise<string | null> {
        const secret = this.secret();
        if (secret === null) return null;
        const mark = randomBytes(12).toString('base64url');
        await this.aiService.create({
            ...CALL_PAGE_LINK_RECORD,
            type: CALL_PAGE_LINK_TYPE,
            domain,
            transcription_id: transcriptionId,
            user_result: {
                mark,
                revokedAt: new Date().toISOString(),
            } satisfies Prisma.JsonObject,
        });
        return buildCallPageToken(secret, transcriptionId, mark);
    }

    private secret(): string | null {
        const secret = callPageSecretOf({
            AUTH_JWT_SECRET: this.config.get<string>('AUTH_JWT_SECRET'),
            APP_SECRET_KEY: this.config.get<string>('APP_SECRET_KEY'),
        });
        if (secret === null && !this.warned) {
            this.warned = true;
            this.logger.warn(
                'Ссылки на страницу разбора звонка не работают: в окружении нет AUTH_JWT_SECRET и APP_SECRET_KEY',
            );
        }
        return secret;
    }
}
