import { BitrixService } from '@/modules/bitrix';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { EventReportContext } from '../services/context/event-report.context';
import { EventReportPostFailService } from '../services/post-fail/event-report-post-fail.service';
import {
    DEFAULT_POST_FAIL_SETTINGS,
    EventPostFailSettings,
} from '../services/post-fail/post-fail.settings';

/**
 * Пост-отказ как в легаси gsirk: дата следующего звонка после «Отказа»
 * уходит в КОМПАНИЮ (дата-время, строка «ДД.ММ.ГГГГ», новый ответственный),
 * но домен и сотрудник — из настроек портала, не из кода.
 */
const GSIRK_SETTINGS: EventPostFailSettings = {
    enabled: true,
    assignUserId: 251,
    companyDateTextField: 'UF_CRM_1401340642',
};

const makeCtx = (over: Record<string, unknown> = {}): EventReportContext =>
    ({
        domain: 'gsirk.bitrix24.ru',
        postFailSettings: GSIRK_SETTINGS,
        isFail: true,
        isNotCa: false,
        isNoCall: false,
        company: { ID: 246267 },
        dto: {
            fail: { postFailDate: '2026-11-23T15:11' },
            report: { failType: { current: { code: 'garant' } } },
        },
        dateTime: {
            crmDateTime: (value: string) => `datetime(${value})`,
            crmDate: (value: string) => `date(${value})`,
        },
        ...over,
    }) as unknown as EventReportContext;

const makeService = (withDateField = true) => {
    const update = jest.fn();
    const service = new EventReportPostFailService(
        { batch: { company: { update } } } as unknown as BitrixService,
        {
            getEntityFieldByCode: (entity: string, code: string) =>
                withDateField &&
                entity === 'company' &&
                code === 'call_next_date'
                    ? { bitrixId: 'CALL_NEXT_DATE' }
                    : undefined,
            getFieldBitrixId: (field: { bitrixId: string }) =>
                `UF_CRM_${field.bitrixId}`,
        } as unknown as PortalModel,
    );
    return { service, update };
};

describe('EventReportPostFailService', () => {
    it('gsirk: дата-время, строка ДД.ММ.ГГГГ и новый ответственный — одной командой по компании', () => {
        const { service, update } = makeService();

        service.queue(makeCtx());

        expect(update).toHaveBeenCalledWith(
            'post_fail_company_246267',
            246267,
            {
                UF_CRM_CALL_NEXT_DATE: 'datetime(2026-11-23T15:11)',
                UF_CRM_1401340642: 'date(2026-11-23T15:11)',
                ASSIGNED_BY_ID: '251',
            },
        );
    });

    it('без сотрудника и строкового поля в настройках — только дата-время', () => {
        const { service, update } = makeService();

        service.queue(
            makeCtx({
                postFailSettings: {
                    enabled: true,
                    assignUserId: 0,
                    companyDateTextField: '',
                },
            }),
        );

        expect(update).toHaveBeenCalledWith(
            'post_fail_company_246267',
            246267,
            { UF_CRM_CALL_NEXT_DATE: 'datetime(2026-11-23T15:11)' },
        );
    });

    it('настройка выключена (дефолт схемы) — ничего', () => {
        const { service, update } = makeService();
        service.queue(
            makeCtx({ postFailSettings: DEFAULT_POST_FAIL_SETTINGS }),
        );
        expect(update).not.toHaveBeenCalled();
    });

    it.each([
        ['не отказ', { isFail: false }],
        ['«не ЦА»', { isNotCa: true }],
        ['недозвон', { isNoCall: true }],
        [
            'нет даты',
            {
                dto: {
                    fail: {},
                    report: { failType: { current: { code: 'garant' } } },
                },
            },
        ],
        [
            'нет типа отказа',
            { dto: { fail: { postFailDate: '2026-11-23T15:11' }, report: {} } },
        ],
        ['нет компании (лид)', { company: null }],
    ])('%s — компания не трогается', (_title, over) => {
        const { service, update } = makeService();
        service.queue(makeCtx(over));
        expect(update).not.toHaveBeenCalled();
    });

    it('поле даты не установлено, настроек нет — команды нет', () => {
        const { service, update } = makeService(false);
        service.queue(
            makeCtx({
                postFailSettings: {
                    enabled: true,
                    assignUserId: 0,
                    companyDateTextField: '',
                },
            }),
        );
        expect(update).not.toHaveBeenCalled();
    });
});
