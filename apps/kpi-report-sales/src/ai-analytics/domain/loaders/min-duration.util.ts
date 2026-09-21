/**
 * Единый порог «разбираемого» звонка портала (решение владельца А.1,
 * P2-56; план Фазы 2, поток 14c) для контура kpi-report-sales: пульс,
 * ночной конвейер (calls / finance / sanity), недельный и месячный
 * снапшоты, аудит Фазы 0.
 *
 * Сама цепочка источников — `resolveMinDurationByType` библиотеки: карта
 * `ai_analytics_definitions.minDurationSecByType` → код реестра
 * `min_duration_sec_by_type` либо скаляр `min_duration_sec` из
 * `ai_analytics_model_params` → дефолт реестра (300 с, поведение Фазы 1a
 * бит-в-бит). Одна формула у event-sales, CLI аудита и этого приложения:
 * разъехавшийся порог развёл бы знаменатель пульса и набор разбираемых
 * звонков конвейера (аудит Фазы 2, M2).
 *
 * Признак `minDurationDefined` считает SettingsLoader по сырому JSON:
 * парсер подставляет дефолтную карту вместо отсутствующего ключа, и без
 * признака «дефолт парсера» был бы принят за решение портала. Признака нет
 * (ручные фикстуры) — слой портала читается как есть.
 *
 * Чистая функция без DI и Bitrix.
 */
import {
    resolveMinDurationByType,
    type MinDurationSecByType,
} from '@lib/sales-ai-analytics';
import type { AiAnalyticsPortalSettings } from './settings.loader';

export function portalMinDurationByType(
    settings: AiAnalyticsPortalSettings,
): MinDurationSecByType {
    return resolveMinDurationByType({
        definitions: settings.definitions,
        modelParams: settings.modelParams,
        // Прежний скаляр старой админки — запасной источник после явного
        // решения портала (та же цепочка, что у разбора в event-sales).
        ...(settings.legacyMinDurationSec == null
            ? {}
            : { fallbackSec: settings.legacyMinDurationSec }),
        ...(settings.minDurationDefined === undefined
            ? {}
            : { portalDefined: settings.minDurationDefined }),
    });
}
