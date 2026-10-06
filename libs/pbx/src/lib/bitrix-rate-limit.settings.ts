import type { BitrixRateLimitOverrides } from '@lib/bitrix/core/rate-limit/bitrix-rate-limiter.config';
import type {
    EnumPortalAppCode,
    PortalAppSettingsResolved,
} from '@lib/portal-lib/store/app-settings';

/** Доля фона в процентах: меньше 10% фон почти не работает. */
const MIN_BACKGROUND_PERCENT = 10;

/**
 * Лимит запросов портала из его «Общих настроек» — для ограничителя
 * запросов к Битриксу.
 *
 * Применяется только то, что задано на портале (`storedKeys`): незаданное
 * остаётся значением по умолчанию ограничителя — один источник умолчаний
 * (bitrix-rate-limiter.config), схема настроек его только повторяет.
 *
 * Всегда объект (пустой — «ничего не задано»): его можно кэшировать.
 */
export const toBitrixRateLimitOverrides = (
    resolved: PortalAppSettingsResolved<EnumPortalAppCode.portal>,
): BitrixRateLimitOverrides => {
    const stored = new Set(resolved.storedKeys);
    const values = resolved.values;
    const overrides: BitrixRateLimitOverrides = {};

    if (stored.has('bitrixRateLimitEnabled')) {
        overrides.enabled = values.bitrixRateLimitEnabled !== false;
    }
    if (
        stored.has('bitrixRatePlan') &&
        (values.bitrixRatePlan === 'regular' ||
            values.bitrixRatePlan === 'enterprise')
    ) {
        overrides.plan = values.bitrixRatePlan;
    }
    if (stored.has('bitrixBackgroundSharePercent')) {
        const percent = values.bitrixBackgroundSharePercent;
        // Больше 100% — ошибка ввода: не передаём, ограничитель возьмёт своё.
        if (Number.isFinite(percent) && percent > 0 && percent <= 100) {
            overrides.backgroundShare =
                Math.max(percent, MIN_BACKGROUND_PERCENT) / 100;
        }
    }
    if (stored.has('bitrixInteractiveMaxWaitSec')) {
        overrides.interactiveMaxWaitMs =
            values.bitrixInteractiveMaxWaitSec * 1000;
    }
    if (stored.has('bitrixBackgroundMaxWaitSec')) {
        overrides.backgroundMaxWaitMs =
            values.bitrixBackgroundMaxWaitSec * 1000;
    }
    return overrides;
};
