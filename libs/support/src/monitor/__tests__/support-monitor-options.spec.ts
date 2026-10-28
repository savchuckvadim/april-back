import {
    EnumPortalAppCode,
    getPortalAppDefaults,
} from '@lib/portal-lib/store/app-settings';
import {
    normalizeSupportDomain,
    parseOperatorMap,
    toSupportMonitorOptions,
} from '../application/support-monitor-options';

const defaults = getPortalAppDefaults(EnumPortalAppCode.portal);
const LINE = 'april-dev.bitrix24.ru';

describe('toSupportMonitorOptions', () => {
    it('дефолты реестра: выключен, только считать, 10/30 мин, просмотр раз в 3 мин', () => {
        expect(toSupportMonitorOptions(LINE, defaults)).toEqual({
            enabled: false,
            dryRun: true,
            lineId: 0,
            notifyDomain: LINE,
            notifyUserIds: [],
            operatorMap: new Map<number, number>(),
            thresholds: { remindMinutes: 10, escalateMinutes: 30 },
            pollMinutes: 3,
            telegramEnabled: true,
        });
    });

    it('сопоставление операторов: пары, мусор и повторы', () => {
        const options = toSupportMonitorOptions(LINE, {
            ...defaults,
            supportMonitorOperatorMap: '135:77, 1:1; x:2, 5:, 135:99 0:3',
        });
        expect([...options.operatorMap.entries()]).toEqual([
            [135, 77],
            [1, 1],
        ]);
        expect(parseOperatorMap(undefined).size).toBe(0);
    });

    it('боевые настройки april-dev: линия 9, колокольчик в april-garant', () => {
        const options = toSupportMonitorOptions(LINE, {
            ...defaults,
            supportMonitorEnabled: true,
            supportMonitorDryRun: false,
            supportMonitorLineId: 9,
            supportMonitorNotifyDomain: 'https://April-Garant.bitrix24.ru/',
            supportMonitorNotifyUserIds: '1, 135;1',
        });
        expect(options.enabled).toBe(true);
        expect(options.dryRun).toBe(false);
        expect(options.lineId).toBe(9);
        expect(options.notifyDomain).toBe('april-garant.bitrix24.ru');
        expect(options.notifyUserIds).toEqual([1, 135]);
    });

    it('срочный повтор всегда позже напоминания', () => {
        const options = toSupportMonitorOptions(LINE, {
            ...defaults,
            supportMonitorRemindMinutes: 20,
            supportMonitorEscalateMinutes: 15,
        });
        expect(options.thresholds).toEqual({
            remindMinutes: 20,
            escalateMinutes: 21,
        });
    });

    it('мусор и края: ноль, отрицательные, дробные, слишком частый и редкий просмотр', () => {
        expect(
            toSupportMonitorOptions(LINE, {
                ...defaults,
                supportMonitorRemindMinutes: 0,
                supportMonitorEscalateMinutes: -5,
                supportMonitorPollMinutes: 0.5,
                supportMonitorLineId: -9,
            }),
        ).toEqual(
            expect.objectContaining({
                lineId: 0,
                thresholds: { remindMinutes: 10, escalateMinutes: 30 },
                pollMinutes: 3,
            }),
        );
        expect(
            toSupportMonitorOptions(LINE, {
                ...defaults,
                supportMonitorPollMinutes: 600,
            }).pollMinutes,
        ).toBe(30);
    });
});

describe('normalizeSupportDomain', () => {
    it('протокол, путь и регистр убираются', () => {
        expect(normalizeSupportDomain(' HTTPS://Gsr.bitrix24.ru/crm/ ')).toBe(
            'gsr.bitrix24.ru',
        );
        expect(normalizeSupportDomain(undefined)).toBe('');
    });
});
