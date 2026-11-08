import { Injectable } from '@nestjs/common';
import {
    AppPartCode,
    AppWidgetCode,
    EnumPortalAppCode,
    parseAppPartCodes,
    parseAppWidgetCodes,
    PortalAppSettingsService,
} from '@lib/portal-lib/store/app-settings';
import { CabinetPortalRef } from '../domain/cabinet-context';
import { CabinetPortalRepository } from '../persistence/cabinet-portal.repository';

/** Приложение April на портале — для карточки «Кабинет» в админке. */
export interface CabinetAppStatus {
    /** Установка есть и не удалена. */
    installed: boolean;
    /** Статус конвейера установки (installed, error, …); null — не ставили. */
    installStatus: string | null;
    installedAt: string | null;
    uninstalledAt: string | null;
    /** Чем бэкенд ходит в портал: webhook | app | auto. */
    bitrixAuthMode: string;
    enabledParts: AppPartCode[];
    /** Виджеты, которые ставит «Обновить виджеты» (настройка app_widgets). */
    widgets: AppWidgetCode[];
}

/**
 * Сводка «приложение April на портале»: установка (marketplace_installs) и
 * «Общие настройки портала» (режим авторизации, части, виджеты). Только
 * чтение — менять настройки админ идёт во вкладку «Settings» портала.
 */
@Injectable()
export class CabinetAppStatusService {
    constructor(
        private readonly portals: CabinetPortalRepository,
        private readonly settings: PortalAppSettingsService,
    ) {}

    async status(portal: CabinetPortalRef): Promise<CabinetAppStatus> {
        const [install, values] = await Promise.all([
            this.portals.findAppInstall(portal.id),
            portal.domain
                ? this.settings.resolve(portal.domain, EnumPortalAppCode.portal)
                : Promise.resolve(null),
        ]);
        const iso = (date: Date | null | undefined): string | null =>
            date ? date.toISOString() : null;
        return {
            installed: install !== null && install.uninstalled_at === null,
            installStatus: install?.install_status ?? null,
            installedAt: iso(install?.installed_at),
            uninstalledAt: iso(install?.uninstalled_at),
            bitrixAuthMode: values?.bitrixAuthMode ?? 'auto',
            enabledParts: values ? parseAppPartCodes(values.enabledParts) : [],
            widgets: values ? parseAppWidgetCodes(values.appWidgets) : [],
        };
    }
}
