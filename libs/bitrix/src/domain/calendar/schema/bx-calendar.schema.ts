import { EBxMethod } from '../../../core/domain/consts/bitrix-api.enum';
import {
    IBXCalendarSettings,
    IBXCalendarSettingsRequest,
} from '../interface/bx-calendar.interface';

/**
 * calendar.settings.* — в Фазе 2 используется единственная операция get
 * (calendar.settings.get, параметров нет, отдаёт настройки портала).
 */
export type BxCalendarSettingsSchema = {
    [EBxMethod.GET]: {
        request: IBXCalendarSettingsRequest;
        response: IBXCalendarSettings;
    };
};
