import { Injectable } from '@nestjs/common';
import {
    EnumPortalAppCode,
    parseUserIds,
    PortalAppSettingsService,
} from '@lib/portal-lib/store/app-settings';
import { DuplicateReportOptions } from '../types/duplicate-report.types';

/** Дефолты на случай мусора в настройке — те же, что в реестре. */
const DEFAULT_WEEKDAY = 1;
const DEFAULT_HOUR = 9;
const DEFAULT_DEADLINE_DAYS = 3;
/** Срок длиннее месяца у еженедельного отчёта бессмыслен. */
const MAX_DEADLINE_DAYS = 30;

/** Целое в границах; иначе дефолт (0 рабочих дней или 25-й час — мусор). */
const intInRange = (
    raw: unknown,
    min: number,
    max: number,
    fallback: number,
): number => {
    const value = Number(raw);
    return Number.isInteger(value) && value >= min && value <= max
        ? value
        : fallback;
};

/**
 * Настройки отчёта по дублям портала → параметры прогона.
 *
 * Отдельный сервис, потому что читателей двое (крон и ручка «прогнать
 * сейчас»), и правила «что считать мусором, что дефолтом» должны быть
 * одни: иначе ручной прогон расходится с недельным.
 */
@Injectable()
export class DuplicateReportSettingsService {
    constructor(private readonly appSettings: PortalAppSettingsService) {}

    /**
     * `overrides.countOnly` приходит из ручки (`dryRun`) и перебивает
     * настройку «Только считать»; крон его не передаёт никогда.
     */
    async resolveOptions(
        domain: string,
        overrides: { countOnly?: boolean } = {},
    ): Promise<DuplicateReportOptions> {
        const settings = await this.appSettings.resolve(
            domain,
            EnumPortalAppCode.eventSales,
        );
        return {
            countOnly:
                overrides.countOnly ??
                Boolean(settings.duplicateReportCountOnly),
            schedule: {
                weekday: intInRange(
                    settings.duplicateReportWeekday,
                    1,
                    7,
                    DEFAULT_WEEKDAY,
                ),
                hour: intInRange(
                    settings.duplicateReportHour,
                    0,
                    23,
                    DEFAULT_HOUR,
                ),
            },
            recipients: {
                toHead: Boolean(settings.duplicateReportToHead),
                departmentUserIds: parseUserIds(
                    settings.duplicateReportDepartmentUserIds,
                ),
                structureUserIds: parseUserIds(settings.duplicateReportUserIds),
            },
            excludeUserIds: parseUserIds(
                settings.duplicateReportExcludeUserIds,
            ),
            deadlineDays: intInRange(
                settings.duplicateReportDeadlineDays,
                1,
                MAX_DEADLINE_DAYS,
                DEFAULT_DEADLINE_DAYS,
            ),
        };
    }
}
