/**
 * Включённые показатели планов портала — бэкенд-двойник фронтового
 * `enabledIndicators` (feature/plans/lib/plan-achievement.util.ts): тот же
 * отбор (только enabled, порядок конфига = порядок каталога), то же имя
 * (своё название портала, иначе название по умолчанию). Чистая функция.
 */
import {
    findPlanIndicator,
    PlanIndicatorDef,
    PlanIndicatorSetting,
    PlanPeriodType,
} from '../constants/plan-indicators.const';

/** Включённый показатель каталога с именем и периодом задания плана. */
export interface EnabledPlanIndicator extends PlanIndicatorDef {
    /** Название как в блоке «Планы». */
    displayName: string;
    /** На какой период руководитель задаёт значение. */
    periodType: PlanPeriodType;
}

export function enabledPlanIndicators(
    settings: readonly PlanIndicatorSetting[],
): EnabledPlanIndicator[] {
    return settings
        .filter(setting => setting.enabled)
        .flatMap(setting => {
            const indicator = findPlanIndicator(setting.code);
            if (!indicator) return [];
            return [
                {
                    ...indicator,
                    displayName: setting.customName || indicator.defaultName,
                    periodType: setting.periodType,
                },
            ];
        });
}
