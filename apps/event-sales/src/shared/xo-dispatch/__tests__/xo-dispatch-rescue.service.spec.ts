import dayjs from 'dayjs';
import {
    XoDispatchRescueService,
    XoRescueOptions,
} from '../xo-dispatch-rescue.service';

/**
 * Оркестрация подстраховки. Решение «брать или нет» проверяется отдельно
 * (xo-rescue.decision.spec) — здесь важно другое: что крон не досылает
 * лишнего, отмечает отправку и держится в пределах лимита.
 */
const DOMAIN = 'x.bitrix24.ru';
const FMT = 'DD.MM.YYYY HH:mm:ss';

const FIELDS: Record<string, string> = {
    op_xo_revive_queued_at: 'OP_XO_REVIVE_QUEUED_AT',
    op_xo_revive_sent_at: 'OP_XO_REVIVE_SENT_AT',
    xo_date: 'XO_DATE',
    xo_name: 'XO_NAME',
    xo_responsible: 'XO_RESPONSIBLE',
    xo_created: 'XO_CREATED',
};

const UF = (code: string) => `UF_CRM_${FIELDS[code]}`;

const options = (over: Partial<XoRescueOptions> = {}): XoRescueOptions => ({
    maxPerRun: 20,
    resendAfterMinutes: 120,
    orphanEnabled: false,
    orphanDryRun: true,
    orphanLookbackHours: 96,
    orphanWorkingDays: false,
    ...over,
});

/** Компания, взятая в очередь давно и без подтверждения — «недоехала». */
const stuckCompany = (id = '77') => ({
    ID: id,
    TITLE: 'ООО Ромашка',
    [UF('op_xo_revive_queued_at')]: dayjs().subtract(5, 'hour').format(FMT),
    [UF('xo_responsible')]: '15',
    [UF('xo_date')]: dayjs().subtract(4, 'hour').format(FMT),
    [UF('xo_name')]: 'ООО Ромашка',
});

const makeDeps = (opts?: {
    companies?: Record<string, unknown>[];
    deals?: Record<string, unknown>[];
    xoDeals?: Record<string, unknown>[];
    /** Сломать чтение ХО-сделок — проверка «не проверив, не досылаем». */
    xoDealsFail?: boolean;
    /** Коды полей, которых нет в слепке портала (не установлены). */
    withoutFields?: string[];
}) => {
    const companyUpdate = jest.fn().mockResolvedValue({ result: true });
    const dealUpdate = jest.fn().mockResolvedValue({ result: true });
    /*
     * Грубая эмуляция фильтров Битрикса: выборка по метке отдаёт только
     * строки с непустым queued_at, выборка по дате — только с непустым
     * xo_date. Без этого одна строка попадает в обе выборки, и тест
     * проверяет не то, что происходит в бою.
     */
    const applyFilter = (
        rows: Record<string, unknown>[],
        filter: Record<string, unknown>,
    ) =>
        rows.filter(row => {
            const queuedKey = `!${UF('op_xo_revive_queued_at')}`;
            if (queuedKey in filter) {
                return Boolean(row[UF('op_xo_revive_queued_at')]);
            }
            if (Object.keys(filter).some(key => key.includes('XO_DATE'))) {
                return Boolean(row[UF('xo_date')]);
            }
            return true;
        });

    const bitrix = {
        company: {
            getList: jest.fn((filter: Record<string, unknown>) =>
                Promise.resolve({
                    result: applyFilter(opts?.companies ?? [], filter ?? {}),
                }),
            ),
            update: companyUpdate,
        },
        deal: {
            getList: jest.fn((filter: Record<string, unknown>) => {
                // Запрос ХО-сделок отличается наличием CATEGORY_ID.
                if (filter?.CATEGORY_ID) {
                    if (opts?.xoDealsFail) {
                        return Promise.reject(new Error('bitrix 503'));
                    }
                    return Promise.resolve({ result: opts?.xoDeals ?? [] });
                }
                return Promise.resolve({
                    result: applyFilter(opts?.deals ?? [], filter ?? {}),
                });
            }),
            update: dealUpdate,
        },
    };
    const portal = {
        getTimezone: () => 'Europe/Moscow',
        getEntityFieldByCode: (_e: string, code: string) =>
            FIELDS[code] && !(opts?.withoutFields ?? []).includes(code)
                ? { bitrixId: FIELDS[code], items: [] }
                : undefined,
        getFieldBitrixId: (f: { bitrixId: string }) => `UF_CRM_${f.bitrixId}`,
        getDealCategoryByCode: (code: string) =>
            code === 'sales_xo' ? { bitrixId: 9, code } : undefined,
    };
    const pbx = {
        init: jest.fn().mockResolvedValue({ bitrix, PortalModel: portal }),
    };
    const coldHook = {
        createColdCallHook: jest.fn().mockResolvedValue({ accepted: true }),
    };
    const workingHours = {
        resolve: jest.fn().mockResolvedValue({
            hours: {
                startHour: 9,
                endHour: 18,
                weekHolidays: [0, 6],
                yearHolidays: new Set<string>(),
                source: 'portal',
            },
            timezone: 'Europe/Moscow',
        }),
    };

    const service = new XoDispatchRescueService(
        pbx as never,
        coldHook as never,
        workingHours as never,
    );
    return { service, coldHook, companyUpdate, dealUpdate, bitrix };
};

describe('XoDispatchRescueService — досылка по метке робота', () => {
    it('недоехавшую компанию досылает и отмечает отправку', async () => {
        const { service, coldHook, companyUpdate } = makeDeps({
            companies: [stuckCompany()],
        });

        const run = await service.runForDomain(DOMAIN, options());

        expect(run.byMarker).toBe(1);
        expect(coldHook.createColdCallHook).toHaveBeenCalledTimes(1);
        // Отметка «хук отправлен» обязана лечь, иначе следующий тик
        // дошлёт повторно и клиент получит второй звонок.
        expect(companyUpdate).toHaveBeenCalledWith(
            77,
            expect.objectContaining({
                [UF('op_xo_revive_sent_at')]: expect.any(String) as string,
            }),
        );
    });

    it('данные события берутся из карточки, а не выдумываются', async () => {
        const { service, coldHook } = makeDeps({
            companies: [stuckCompany()],
        });

        await service.runForDomain(DOMAIN, options());

        expect(coldHook.createColdCallHook).toHaveBeenCalledWith(
            DOMAIN,
            expect.objectContaining({
                entityType: 'company',
                entityId: '77',
                responsible: '15',
                name: 'ООО Ромашка',
            }),
        );
    });

    it('свежую метку не трогает — хук ещё обрабатывается', async () => {
        const { service, coldHook } = makeDeps({
            companies: [
                {
                    ...stuckCompany(),
                    [UF('op_xo_revive_queued_at')]: dayjs()
                        .subtract(5, 'minute')
                        .format(FMT),
                },
            ],
        });

        const run = await service.runForDomain(DOMAIN, options());

        expect(run.byMarker).toBe(0);
        expect(run.skipped['marker-fresh']).toBe(1);
        expect(coldHook.createColdCallHook).not.toHaveBeenCalled();
    });

    it('доставленную не трогает', async () => {
        const { service, coldHook } = makeDeps({
            companies: [
                {
                    ...stuckCompany(),
                    [UF('op_xo_revive_sent_at')]: dayjs()
                        .subtract(4, 'hour')
                        .format(FMT),
                },
            ],
        });

        const run = await service.runForDomain(DOMAIN, options());

        expect(run.skipped.delivered).toBe(1);
        expect(coldHook.createColdCallHook).not.toHaveBeenCalled();
    });

    it('без ответственного в карточке — не досылает, а пишет предупреждение', async () => {
        const company = stuckCompany();
        delete company[UF('xo_responsible')];
        const { service, coldHook } = makeDeps({ companies: [company] });

        const run = await service.runForDomain(DOMAIN, options());

        expect(coldHook.createColdCallHook).not.toHaveBeenCalled();
        expect(run.warnings.join(' ')).toContain('xo_responsible');
    });

    it('лимит за прогон соблюдается', async () => {
        const { service, coldHook } = makeDeps({
            companies: [
                stuckCompany('1'),
                stuckCompany('2'),
                stuckCompany('3'),
            ],
        });

        const run = await service.runForDomain(
            DOMAIN,
            options({ maxPerRun: 2 }),
        );

        expect(coldHook.createColdCallHook).toHaveBeenCalledTimes(2);
        expect(run.byMarker).toBe(2);
    });
});

describe('XoDispatchRescueService — поиск по дате звонка', () => {
    /** Компания без метки: робот упал до того, как её поставил. */
    const orphanCompany = () => ({
        ID: '88',
        TITLE: 'ООО Сирота',
        [UF('xo_date')]: dayjs().subtract(4, 'hour').format(FMT),
        [UF('xo_responsible')]: '15',
        [UF('xo_name')]: 'ООО Сирота',
    });

    it('выключен настройкой — выборка по дате вообще не делается', async () => {
        const { service, bitrix, coldHook } = makeDeps({
            companies: [orphanCompany()],
        });

        await service.runForDomain(DOMAIN, options({ orphanEnabled: false }));

        expect(bitrix.company.getList).toHaveBeenCalledTimes(1);
        expect(coldHook.createColdCallHook).not.toHaveBeenCalled();
    });

    it('холостой ход: кандидата нашли, но звонок НЕ отправили', async () => {
        const { service, coldHook, companyUpdate } = makeDeps({
            companies: [orphanCompany()],
            xoDeals: [],
        });

        const run = await service.runForDomain(
            DOMAIN,
            options({ orphanEnabled: true, orphanDryRun: true }),
        );

        expect(run.orphanDryRun).toBe(1);
        expect(run.byPlanDate).toBe(0);
        expect(coldHook.createColdCallHook).not.toHaveBeenCalled();
        expect(companyUpdate).not.toHaveBeenCalled();
    });

    it('холостой ход выключен — досылает', async () => {
        const { service, coldHook } = makeDeps({
            companies: [orphanCompany()],
            xoDeals: [],
        });

        const run = await service.runForDomain(
            DOMAIN,
            options({ orphanEnabled: true, orphanDryRun: false }),
        );

        expect(run.byPlanDate).toBe(1);
        expect(coldHook.createColdCallHook).toHaveBeenCalledTimes(1);
    });

    /*
     * Главная защита от «назабирать лишнего»: у клиента уже есть ХО-работа,
     * созданная после плановой даты, — значит хук отработал нормально.
     */
    it('есть ХО-сделка после плановой даты — не трогает', async () => {
        const { service, coldHook } = makeDeps({
            companies: [orphanCompany()],
            xoDeals: [
                {
                    ID: '500',
                    COMPANY_ID: '88',
                    DATE_CREATE: dayjs().subtract(3, 'hour').format(FMT),
                },
            ],
        });

        const run = await service.runForDomain(
            DOMAIN,
            options({ orphanEnabled: true, orphanDryRun: false }),
        );

        expect(run.skipped['work-exists']).toBe(1);
        expect(coldHook.createColdCallHook).not.toHaveBeenCalled();
    });

    it('старая ХО-сделка (до плана) защитой не считается', async () => {
        const { service, coldHook } = makeDeps({
            companies: [orphanCompany()],
            xoDeals: [
                {
                    ID: '400',
                    COMPANY_ID: '88',
                    DATE_CREATE: dayjs().subtract(200, 'day').format(FMT),
                },
            ],
        });

        const run = await service.runForDomain(
            DOMAIN,
            options({ orphanEnabled: true, orphanDryRun: false }),
        );

        expect(run.byPlanDate).toBe(1);
        expect(coldHook.createColdCallHook).toHaveBeenCalledTimes(1);
    });

    /*
     * Не проверив наличие работы, досылать нельзя: это ровно тот случай,
     * когда подстраховка начинает забирать лишнее.
     */
    it('ХО-сделки не прочитались — не досылаем никого', async () => {
        const { service, coldHook } = makeDeps({
            companies: [orphanCompany()],
            xoDealsFail: true,
        });

        const run = await service.runForDomain(
            DOMAIN,
            options({ orphanEnabled: true, orphanDryRun: false }),
        );

        expect(coldHook.createColdCallHook).not.toHaveBeenCalled();
        expect(run.warnings.join(' ')).toContain('ХО-сделки не прочитаны');
    });
});

describe('XoDispatchRescueService — поля не установлены', () => {
    /*
     * Без маркер-полей первый способ слеп. Подстраховка обязана честно
     * молчать и сказать почему, а не делать вид, что отработала.
     */
    it('без маркер-полей молчит и объясняет причину', async () => {
        const { service, coldHook } = makeDeps({
            companies: [stuckCompany()],
            withoutFields: ['op_xo_revive_queued_at', 'op_xo_revive_sent_at'],
        });

        const run = await service.runForDomain(DOMAIN, options());

        expect(run.byMarker).toBe(0);
        expect(coldHook.createColdCallHook).not.toHaveBeenCalled();
        expect(run.warnings.join(' ')).toContain('Маркер-поля');
        expect(run.warnings.join(' ')).toContain('op_xo_revive_queued_at');
    });

    /*
     * Без поля даты ХО подстраховка бессильна ЦЕЛИКОМ, а не только во
     * втором способе: дедлайн звонка брать неоткуда, а холодный звонок без
     * даты поставить нельзя. Отказ при этом объяснён в двух местах —
     * и про поиск, и про конкретный элемент.
     */
    it('нет поля даты ХО — не досылает вовсе, с пояснением', async () => {
        const { service, coldHook } = makeDeps({
            companies: [stuckCompany()],
            withoutFields: ['xo_date'],
        });

        const run = await service.runForDomain(
            DOMAIN,
            options({ orphanEnabled: true, orphanDryRun: false }),
        );

        expect(run.byPlanDate).toBe(0);
        expect(run.byMarker).toBe(0);
        expect(coldHook.createColdCallHook).not.toHaveBeenCalled();
        const warnings = run.warnings.join(' ');
        expect(warnings).toContain('Дата Холодного обзвона');
        expect(warnings).toContain('xo_date');
    });
});
