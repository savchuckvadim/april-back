import { Injectable } from '@nestjs/common';
import {
    EnumPortalAppCode,
    parseUserIds,
    PortalAppSettingsService,
} from '@lib/portal-lib/store/app-settings';

/**
 * Настройки-решения, относящиеся к профилю стиля. Сейчас одна:
 * `ai_analytics_style_opt_out` — право сотрудника на отказ от
 * профилирования (документ `ai/tasks/ai-analytics-manager-style.md`,
 * §1.3). Формат — CSV Bitrix-id, как у `ai_analytics_digest_all_user_ids`.
 *
 * Отдельный загрузчик, а не поле общего SettingsLoader: карточке стиля
 * нужен один ключ, и лишние разборы десяти JSON-блоков ей ни к чему.
 */
@Injectable()
export class StyleSettingsLoader {
    constructor(private readonly appSettings: PortalAppSettingsService) {}

    /** Bitrix-id сотрудников, отказавшихся от профилирования. */
    async optOutManagerIds(domain: string): Promise<string[]> {
        const settings = await this.appSettings.resolve(
            domain,
            EnumPortalAppCode.kpiSales,
        );
        return parseUserIds(settings.aiAnalyticsStyleOptOut).map(String);
    }

    /** Отказался ли конкретный сотрудник (нормализация id — по числу). */
    async isOptedOut(domain: string, managerId: string): Promise<boolean> {
        const ids = await this.optOutManagerIds(domain);
        return ids.includes(String(Number(managerId)));
    }
}
