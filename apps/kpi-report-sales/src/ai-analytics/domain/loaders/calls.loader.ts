import { Injectable } from '@nestjs/common';
import { CallReportAnalyticsDataService } from '@lib/call-lib';
import { DatedLiteRow, hasCallDate } from './lite-row.mapper';

/**
 * Загрузчик звонков: lite-выборка call-lib (транскрипции без текста +
 * нужные поля разбора) за UTC-окно. Кэш call-lib не используется —
 * кэширует уже готовый результат сам модуль (пульс/повестка/настройки).
 * Периметр requester'а применяется ПОСЛЕ (результат общий на домен).
 */
@Injectable()
export class CallsLoader {
    constructor(private readonly data: CallReportAnalyticsDataService) {}

    async loadLite(
        domain: string,
        from: Date,
        to: Date,
    ): Promise<DatedLiteRow[]> {
        const dataset = await this.data.loadLite({
            domain,
            from: from.toISOString(),
            to: to.toISOString(),
            useCache: false,
            saveToHistory: false,
        });
        return dataset.rows.filter(hasCallDate);
    }
}
