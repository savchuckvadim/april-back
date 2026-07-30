import { Injectable, Logger } from '@nestjs/common';
import { PBXService } from '@/modules/pbx';
import { AppCacheService } from '@lib/app-cache';
import { ShareLink } from 'generated/prisma';
import { ReportKpiUseCase } from '../../report/use-cases/kpi-report.use-case';
import { CallingStatisticUseCase } from '../../report/use-cases/kpi-calling-statistic.use-case';
import { ReportResultCacheService } from '../../report/cache/report-result-cache.service';
import { ClosedSalesUseCase } from '../../sales-finance/domain/use-cases/closed-sales.use-case';
import { HotClientsUseCase } from '../../sales-finance/domain/use-cases/hot-clients.use-case';
import { SalesFinanceCacheService } from '../../sales-finance/cache/sales-finance-cache.service';
import { SALES_HOT_THRESHOLDS } from '../../sales-finance/constants/sales-finance.const';
import { AirtimeStatisticUseCase } from '../../airtime/use-cases/kpi-airtime.use-case';
import { AirtimeCacheService } from '../../airtime/cache/airtime-cache.service';
import { ReportData } from '../../shared/dto/kpi.dto';
import { ShareLinkFilterSnapshotDto } from '../dto/share-link.dto';

/** Пространство центрального кэша для снимков публичных ссылок. */
export const SHARE_LINK_CACHE_APP = 'kpi-share';

/** Финансовая часть снимка: закрытые продажи + горячие по обоим порогам. */
export interface ShareLinkSnapshotFinance {
    closed: unknown;
    /** presentation/document — переключатель порога работает офлайн. */
    hotByThreshold: Record<string, unknown>;
}

/** Данные снимка, лежащие в AppCache по ключу token. */
export interface ShareLinkSnapshotData {
    generatedAt: string;
    report: ReportData[];
    callings: unknown[];
    finance?: ShareLinkSnapshotFinance | null;
    airtime?: unknown;
}

/**
 * Генерация и хранение снимка данных публичной ссылки.
 *
 * Генерация — реплей тех же запросов, что фронт делает при загрузке отчёта
 * (KPI + статистика звонков), от имени портала через PBXService.init(domain).
 * Use-case'ы создаются per-вызов через `new` — см. CLAUDE.md про race
 * condition c this.bitrix.
 *
 * Хранение — центральный кэш AppCache (Redis + app_cache в MySQL):
 * снимок переживает перезагрузку Redis, TTL = срок жизни ссылки.
 */
@Injectable()
export class ShareLinkSnapshotService {
    private readonly logger = new Logger(ShareLinkSnapshotService.name);

    constructor(
        private readonly pbx: PBXService,
        private readonly appCache: AppCacheService,
    ) {}

    /** Полная регенерация снимка + запись в кэш. */
    async generate(
        link: Pick<ShareLink, 'token' | 'domain' | 'expiresAt'>,
        snapshot: ShareLinkFilterSnapshotDto,
    ): Promise<ShareLinkSnapshotData> {
        this.logger.log(`Генерация снимка ${link.token} (${link.domain})`);

        // Write-through: реплей снапшота заодно греет конверт-кэш очереди
        // (прецедент — ручные new SalesFinanceCacheService/AirtimeCacheService ниже).
        const resultCache = new ReportResultCacheService(this.appCache);

        const reportUseCase = new ReportKpiUseCase();
        await reportUseCase.init(link.domain, this.pbx, resultCache);
        const report = await reportUseCase.generateKpiReport(
            snapshot.reportFilters,
        );

        // Звонки не валят снимок целиком: KPI-часть ценнее, а статистика
        // звонков может быть недоступна (нет телефонии на портале).
        let callings: unknown[] = [];
        try {
            const { bitrix } = await this.pbx.init(link.domain);
            const callingUseCase = new CallingStatisticUseCase(
                bitrix.api,
                resultCache,
            );
            callings = (await callingUseCase.get({
                domain: link.domain,
                filters: snapshot.callingFilters,
            })) as unknown[];
        } catch (error) {
            this.logger.warn(
                `Снимок ${link.token}: статистика звонков не собралась — ${
                    error instanceof Error ? error.message : String(error)
                }`,
            );
        }

        const data: ShareLinkSnapshotData = {
            generatedAt: new Date().toISOString(),
            report,
            callings,
            finance: await this.generateFinance(link, snapshot),
            airtime: await this.generateAirtime(link, snapshot),
        };

        await this.store(link, data);
        return data;
    }

    /**
     * Вкладка «Финансы»: закрытые продажи + горячие клиенты по обоим
     * порогам (переключатель на публичной странице работает без запросов).
     * Некритично — ошибка не валит снимок.
     */
    private async generateFinance(
        link: Pick<ShareLink, 'token' | 'domain'>,
        snapshot: ShareLinkFilterSnapshotDto,
    ): Promise<ShareLinkSnapshotFinance | null> {
        const filters = snapshot.financeFilters;
        if (!filters?.assignedIds?.length) return null;

        try {
            const cache = new SalesFinanceCacheService(this.appCache);
            const closed = await new ClosedSalesUseCase(
                this.pbx,
                cache,
            ).execute({
                domain: link.domain,
                forceRefresh: false,
                filters: {
                    assignedIds: filters.assignedIds,
                    dateFrom: filters.dateFrom,
                    dateTo: filters.dateTo,
                },
            });

            const hotByThreshold: Record<string, unknown> = {};
            for (const threshold of SALES_HOT_THRESHOLDS) {
                hotByThreshold[threshold] = await new HotClientsUseCase(
                    this.pbx,
                    cache,
                ).execute({
                    domain: link.domain,
                    forceRefresh: false,
                    threshold,
                    assignedIds: filters.assignedIds,
                });
            }

            return { closed, hotByThreshold };
        } catch (error) {
            this.logger.warn(
                `Снимок ${link.token}: финансы не собрались — ${
                    error instanceof Error ? error.message : String(error)
                }`,
            );
            return null;
        }
    }

    /** Эфирное время команды. Некритично — ошибка не валит снимок. */
    private async generateAirtime(
        link: Pick<ShareLink, 'token' | 'domain'>,
        snapshot: ShareLinkFilterSnapshotDto,
    ): Promise<unknown> {
        const filters = snapshot.airtimeFilters;
        if (!filters?.departament?.length) return null;

        try {
            const { bitrix } = await this.pbx.init(link.domain);
            // Кэш месячных ячеек ускоряет и генерацию, и 15-минутный refresh
            // снимков (прецедент ручного new — SalesFinanceCacheService выше).
            const airtimeCache = new AirtimeCacheService(this.appCache);
            const useCase = new AirtimeStatisticUseCase(
                bitrix.api,
                airtimeCache,
                link.domain,
            );
            return await useCase.get({
                domain: link.domain,
                filters: {
                    dateFrom: filters.dateFrom,
                    dateTo: filters.dateTo,
                    departament: filters.departament.map(user => ({
                        ID: String(user.ID ?? ''),
                        NAME: user.NAME ?? '',
                        LAST_NAME: user.LAST_NAME ?? '',
                    })),
                },
            });
        } catch (error) {
            this.logger.warn(
                `Снимок ${link.token}: эфирное время не собралось — ${
                    error instanceof Error ? error.message : String(error)
                }`,
            );
            return null;
        }
    }

    async store(
        link: Pick<ShareLink, 'token' | 'domain' | 'expiresAt'>,
        data: ShareLinkSnapshotData,
    ): Promise<void> {
        await this.appCache.set({
            app: SHARE_LINK_CACHE_APP,
            domain: link.domain,
            key: link.token,
            group: 'snapshot',
            data,
            ttlSeconds: this.ttlSeconds(link.expiresAt),
        });
    }

    async load(
        link: Pick<ShareLink, 'token' | 'domain'>,
    ): Promise<ShareLinkSnapshotData | null> {
        return this.appCache.get<ShareLinkSnapshotData>({
            app: SHARE_LINK_CACHE_APP,
            domain: link.domain,
            key: link.token,
        });
    }

    async drop(link: Pick<ShareLink, 'token' | 'domain'>): Promise<void> {
        await this.appCache.delete({
            app: SHARE_LINK_CACHE_APP,
            domain: link.domain,
            key: link.token,
        });
    }

    /**
     * Сброс снимков из кэша (метаданные ссылок в share_link не трогаются):
     * token — один снимок, без token — все снимки портала. Следующий
     * просмотр публичной страницы синхронно перегенерирует данные, а
     * обновляемую ссылку пересчитает и ближайший cron-тик.
     */
    async resetCache(
        domain: string,
        token?: string,
    ): Promise<{ deletedDb: number; deletedRedis: number }> {
        return this.appCache.reset({
            app: SHARE_LINK_CACHE_APP,
            domain,
            ...(token ? { keyPrefix: token } : {}),
        });
    }

    private ttlSeconds(expiresAt: Date): number {
        return Math.max(
            60,
            Math.floor((expiresAt.getTime() - Date.now()) / 1000),
        );
    }
}
