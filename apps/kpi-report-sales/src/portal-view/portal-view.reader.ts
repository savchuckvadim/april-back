import { Injectable } from '@nestjs/common';
import {
    EnumPortalAppCode,
    PortalAppSettingsService,
    type ReportViewLabels,
} from '@lib/portal-lib/store/app-settings';
import type { PortalViewState } from './portal-view.types';
import { viewFromSettings } from './portal-view.util';

/**
 * Чтение вида отчёта портала: ключи «Вид отчёта» приложения kpi-sales
 * (`PortalAppSettingsService.resolve`, кэш настроек сбрасывает запись).
 *
 * Экспортируется модулем: список разборов берёт отсюда основные бейджи,
 * публичная ссылка — свои названия показателей.
 */
@Injectable()
export class PortalViewReader {
    constructor(private readonly appSettings: PortalAppSettingsService) {}

    /** Вид отчёта портала; не задано — значения по умолчанию. */
    async read(domain: string): Promise<PortalViewState> {
        const values = await this.appSettings.resolve(
            domain,
            EnumPortalAppCode.kpiSales,
        );
        return viewFromSettings(values);
    }

    /**
     * Основные бейджи списка разборов, набором; null — портал не выбирал
     * (список пуст), действует набор по умолчанию.
     */
    async badgesMain(domain: string): Promise<ReadonlySet<string> | null> {
        const { badgesMain } = await this.read(domain);
        return badgesMain.length > 0 ? new Set(badgesMain) : null;
    }

    /** Свои названия показателей портала; не заданы — пустой объект. */
    async labels(domain: string): Promise<ReportViewLabels> {
        const { labels } = await this.read(domain);
        return labels;
    }
}
