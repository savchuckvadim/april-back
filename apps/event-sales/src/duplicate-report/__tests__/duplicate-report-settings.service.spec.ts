import {
    EnumPortalAppCode,
    getPortalAppDefaults,
} from '@lib/portal-lib/store/app-settings';
import { DuplicateReportSettingsService } from '../services/duplicate-report-settings.service';

const DEFAULTS = getPortalAppDefaults(EnumPortalAppCode.eventSales);

const serviceWith = (patch: Record<string, unknown> = {}) => {
    const resolve = jest.fn().mockResolvedValue({ ...DEFAULTS, ...patch });
    return {
        resolve,
        service: new DuplicateReportSettingsService({ resolve } as never),
    };
};

describe('DuplicateReportSettingsService — настройки отчёта по дублям', () => {
    it('дефолты реестра: выключен в «только считать», РОПу, понедельник 9:00, срок 3 дня', async () => {
        const { service, resolve } = serviceWith();

        const options = await service.resolveOptions('a.bitrix24.ru');

        expect(resolve).toHaveBeenCalledWith(
            'a.bitrix24.ru',
            EnumPortalAppCode.eventSales,
        );
        expect(DEFAULTS.duplicateReportEnabled).toBe(false);
        expect(options).toEqual({
            countOnly: true,
            schedule: { weekday: 1, hour: 9 },
            recipients: {
                toHead: true,
                departmentUserIds: [],
                structureUserIds: [],
            },
            excludeUserIds: [],
            deadlineDays: 3,
        });
    });

    it('списки сотрудников разбираются из строки «через запятую»', async () => {
        const { service } = serviceWith({
            duplicateReportDepartmentUserIds: '309; 11',
            duplicateReportUserIds: '1, 447 1',
            duplicateReportExcludeUserIds: '500,abc',
        });

        const options = await service.resolveOptions('a.bitrix24.ru');

        expect(options.recipients.departmentUserIds).toEqual([309, 11]);
        expect(options.recipients.structureUserIds).toEqual([1, 447]);
        expect(options.excludeUserIds).toEqual([500]);
    });

    it('мусор в числах — дефолты, а не 25-й час или ноль рабочих дней', async () => {
        const { service } = serviceWith({
            duplicateReportWeekday: 9,
            duplicateReportHour: 25,
            duplicateReportDeadlineDays: 0,
        });

        const options = await service.resolveOptions('a.bitrix24.ru');

        expect(options.schedule).toEqual({ weekday: 1, hour: 9 });
        expect(options.deadlineDays).toBe(3);
    });

    it('настройки портала применяются; ручка перебивает «только считать»', async () => {
        const { service } = serviceWith({
            duplicateReportCountOnly: false,
            duplicateReportToHead: false,
            duplicateReportWeekday: 5,
            duplicateReportHour: 0,
            duplicateReportDeadlineDays: 5,
        });

        const live = await service.resolveOptions('a.bitrix24.ru');
        const dry = await service.resolveOptions('a.bitrix24.ru', {
            countOnly: true,
        });

        expect(live).toMatchObject({
            countOnly: false,
            schedule: { weekday: 5, hour: 0 },
            recipients: { toHead: false },
            deadlineDays: 5,
        });
        expect(dry.countOnly).toBe(true);
    });
});
