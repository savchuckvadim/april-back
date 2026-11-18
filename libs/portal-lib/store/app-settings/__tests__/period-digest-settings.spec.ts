import {
    EnumPortalAppCode,
    getPortalAppDefaults,
    PORTAL_APP_SETTINGS_SCHEMA,
    PortalAppSettingDescriptor,
} from '../portal-app-settings.schema';
import { resolveAppSettingGroup } from '../lib/app-setting-groups';
import {
    PERIOD_DIGEST_DEFAULT_KINDS,
    PERIOD_DIGEST_KIND,
    PERIOD_DIGEST_KIND_OPTIONS,
    toPeriodDigestKinds,
} from '../lib/period-digest-kinds.const';

const APP = EnumPortalAppCode.eventSales;
const SETTINGS = PORTAL_APP_SETTINGS_SCHEMA[APP];

const periodDigestSettings = (): PortalAppSettingDescriptor[] =>
    Object.values(
        SETTINGS as Record<string, PortalAppSettingDescriptor>,
    ).filter(descriptor => descriptor.code.startsWith('period_digest_'));

describe('итоги периода по менеджерам: настройки', () => {
    it('выключено по умолчанию, «только считать» включено', () => {
        const defaults = getPortalAppDefaults(APP);

        expect(defaults.periodDigestEnabled).toBe(false);
        expect(defaults.periodDigestCountOnly).toBe(true);
        expect(defaults.periodDigestToHead).toBe(true);
        expect(defaults.periodDigestUserIds).toBe('');
        expect(defaults.periodDigestDepartmentUserIds).toBe('');
        expect(defaults.periodDigestExcludeUserIds).toBe('');
    });

    it('расписание, сроки и пороги по умолчанию — из проекта решения', () => {
        const defaults = getPortalAppDefaults(APP);

        expect(defaults.periodDigestKinds).toBe('week,month');
        expect(defaults.periodDigestWeekday).toBe(1);
        expect(defaults.periodDigestHour).toBe(9);
        expect(defaults.periodDigestDeadlineDaysWeek).toBe(3);
        expect(defaults.periodDigestDeadlineDaysMonth).toBe(5);
        expect(defaults.periodDigestMinCalls).toBe(5);
        expect(defaults.periodDigestShiftScore).toBe(0.5);
        expect(defaults.periodDigestShiftShare).toBe(10);
    });

    it('четырнадцать ключей в своей категории, описания по-русски без кодов', () => {
        const settings = periodDigestSettings();

        expect(settings).toHaveLength(14);
        for (const descriptor of settings) {
            expect(resolveAppSettingGroup(APP, descriptor.code)).toBe(
                'period_digest',
            );
            expect(descriptor.name).not.toMatch(/[a-z_]/);
            // «Bitrix ID», «Excel», «April» — названия, а не коды; кодов
            // настроек в подсказках нет.
            expect(
                descriptor.description.replace(/Bitrix ID|Excel|April/g, ''),
            ).not.toMatch(/[A-Za-z_]/);
        }
    });

    it('сотрудники — выбором из списка, виды периодов — галочками', () => {
        expect(SETTINGS.periodDigestUserIds.pick).toBe('bitrix-users');
        expect(SETTINGS.periodDigestDepartmentUserIds.pick).toBe(
            'bitrix-users',
        );
        expect(SETTINGS.periodDigestExcludeUserIds.pick).toBe('bitrix-users');
        expect(SETTINGS.periodDigestKinds.isList).toBe(true);
        expect(SETTINGS.periodDigestKinds.options).toBe(
            PERIOD_DIGEST_KIND_OPTIONS,
        );
    });
});

describe('итоги периода: виды периодов', () => {
    it('галочки — ровно коды перечня, по умолчанию отмечены оба', () => {
        expect(PERIOD_DIGEST_KIND_OPTIONS.map(option => option.code)).toEqual(
            Object.values(PERIOD_DIGEST_KIND),
        );
        expect(toPeriodDigestKinds(PERIOD_DIGEST_DEFAULT_KINDS)).toEqual([
            PERIOD_DIGEST_KIND.week,
            PERIOD_DIGEST_KIND.month,
        ]);
    });

    it('значение настройки → виды в порядке справочника, без повторов и мусора', () => {
        expect(toPeriodDigestKinds(' month , week,month')).toEqual([
            'week',
            'month',
        ]);
        expect(toPeriodDigestKinds('month,quarter')).toEqual(['month']);
        expect(toPeriodDigestKinds('')).toEqual([]);
        expect(toPeriodDigestKinds(undefined)).toEqual([]);
        expect(toPeriodDigestKinds(7)).toEqual([]);
    });
});
