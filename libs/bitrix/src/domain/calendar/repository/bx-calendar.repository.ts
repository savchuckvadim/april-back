import { BitrixBaseApi } from 'src/modules/bitrix/core/base/bitrix-base-api';
import {
    EBxMethod,
    EBxNamespace,
} from '../../../core/domain/consts/bitrix-api.enum';
import { EBXEntity } from '../../../core/domain/consts/bitrix-entities.enum';
import { IBXCalendarSettingsRequest } from '../interface/bx-calendar.interface';

/** calendar.settings.get параметров не принимает (документация метода). */
const EMPTY_REQUEST: IBXCalendarSettingsRequest = {};

/**
 * calendar.settings.get — единственная операция домена.
 * Batch-варианта нет сознательно: настройки читаются один раз на портал
 * (тот же приём, что у crm.entity и im.notify.system — см. BitrixService).
 */
export class BxCalendarRepository {
    constructor(private readonly bxApi: BitrixBaseApi) {}

    /** Основные настройки календаря портала: calendar.settings.get. */
    async settingsGet() {
        return await this.bxApi.callType(
            EBxNamespace.CALENDAR,
            EBXEntity.SETTINGS,
            EBxMethod.GET,
            EMPTY_REQUEST,
        );
    }
}
