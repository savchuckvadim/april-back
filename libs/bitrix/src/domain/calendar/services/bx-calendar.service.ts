import { BitrixBaseApi } from 'src/modules/bitrix/core/base/bitrix-base-api';
import { BxCalendarRepository } from '../repository/bx-calendar.repository';
import {
    isBXCalendarSettings,
    toBxCalendarFailure,
} from '../errors/bx-calendar.error';
import { BxCalendarSettingsResult } from '../interface/bx-calendar.interface';

/**
 * calendar.settings.get — производственный календарь портала:
 * выходные дни недели, праздники года, начало и конец рабочего дня.
 *
 * Метод требует scope `calendar`; у части порталов его нет. Поэтому
 * основной путь потребителя — settingsGetSafe(): он не бросает исключение,
 * а возвращает типизированный отказ, по которому загрузчик деградирует
 * на производственный календарь РФ.
 */
export class BxCalendarService {
    private repo: BxCalendarRepository;

    clone(api: BitrixBaseApi): BxCalendarService {
        const instance = new BxCalendarService();
        instance.init(api);
        return instance;
    }

    init(api: BitrixBaseApi) {
        this.repo = new BxCalendarRepository(api);
    }

    /** Сырой ответ метода (как у остальных доменов библиотеки). */
    async settingsGet() {
        return await this.repo.settingsGet();
    }

    /** Безопасное чтение: наружу не летит неструктурированное исключение. */
    async settingsGetSafe(): Promise<BxCalendarSettingsResult> {
        try {
            const response = await this.repo.settingsGet();
            const settings: unknown = response?.result;
            if (!isBXCalendarSettings(settings)) {
                return {
                    ok: false,
                    reason: 'invalid-response',
                    code: null,
                    description:
                        'calendar.settings.get: в ответе нет настроек календаря',
                };
            }
            return { ok: true, settings };
        } catch (error) {
            return toBxCalendarFailure(error);
        }
    }
}
