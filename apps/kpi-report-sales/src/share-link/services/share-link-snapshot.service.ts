import { Injectable, Logger } from '@nestjs/common';
import { PBXService } from '@/modules/pbx';
import { AppCacheService } from '@lib/app-cache';
import { ShareLink } from 'generated/prisma';
import { ReportKpiUseCase } from '../../report/use-cases/kpi-report.use-case';
import { CallingStatisticUseCase } from '../../report/use-cases/kpi-calling-statistic.use-case';
import { ReportData } from '../../shared/dto/kpi.dto';
import { ShareLinkFilterSnapshotDto } from '../dto/share-link.dto';

/** Пространство центрального кэша для снимков публичных ссылок. */
export const SHARE_LINK_CACHE_APP = 'kpi-share';

/** Данные снимка, лежащие в AppCache по ключу token. */
export interface ShareLinkSnapshotData {
    generatedAt: string;
    report: ReportData[];
    callings: unknown[];
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

        const reportUseCase = new ReportKpiUseCase();
        await reportUseCase.init(link.domain, this.pbx);
        const report = await reportUseCase.generateKpiReport(
            snapshot.reportFilters,
        );

        // Звонки не валят снимок целиком: KPI-часть ценнее, а статистика
        // звонков может быть недоступна (нет телефонии на портале).
        let callings: unknown[] = [];
        try {
            const { bitrix } = await this.pbx.init(link.domain);
            const callingUseCase = new CallingStatisticUseCase(bitrix.api);
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
        };

        await this.store(link, data);
        return data;
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

    private ttlSeconds(expiresAt: Date): number {
        return Math.max(
            60,
            Math.floor((expiresAt.getTime() - Date.now()) / 1000),
        );
    }
}
