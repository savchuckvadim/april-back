import { Injectable, NotFoundException } from '@nestjs/common';
import { PortalService } from '@lib/portal-lib/portal/portal.service';
import {
    EnumPortalAppCode,
    PortalAppSettingsService,
} from '@lib/portal-lib/store/app-settings';
import type {
    PortalViewSettingsPatch,
    PortalViewState,
} from './portal-view.types';
import { viewFromSettings } from './portal-view.util';

/**
 * Запись вида отчёта портала в ключи схемы `[kpiSales]`
 * (`PortalAppSettingsService.save`, кэш настроек сбрасывает сам сервис).
 * Возвращает вид отчёта после записи — повторное чтение не нужно.
 */
@Injectable()
export class PortalViewWriter {
    constructor(
        private readonly appSettings: PortalAppSettingsService,
        private readonly portals: PortalService,
    ) {}

    async write(
        domain: string,
        patch: PortalViewSettingsPatch,
    ): Promise<PortalViewState> {
        const portal = await this.portals.getPortalByDomain(domain);
        if (!portal?.id) {
            throw new NotFoundException(
                `Портал ${domain} не найден — настройки сохранять некуда`,
            );
        }
        const saved = await this.appSettings.save(
            portal.id,
            EnumPortalAppCode.kpiSales,
            patch,
        );
        return viewFromSettings(saved);
    }
}
