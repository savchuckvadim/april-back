import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import { RejectReviveService } from '../reject-revive.service';
import { PBXService } from '@/modules/pbx';
import { ColdHookSilinceEndpointService } from '../../../cold-hook/services/silence/cold-hook-silince-endpoint.service';
import { RejectReviveOptions } from '../dto/reject-revive.types';

dayjs.extend(utc);
dayjs.extend(timezone);

/**
 * Реанимация отказников: интервал/перебивающая дата, двухфазные маркеры
 * (queued ДО хука, sent после приёма), досылка «недоехавших», лимит,
 * self-gate без полей. Все вызовы Битрикса — моки.
 */
const TZ = 'Europe/Moscow';
const FMT = 'DD.MM.YYYY HH:mm:ss';

const CATEGORY = {
    code: 'sales_base',
    bitrixId: 1,
    stages: [
        { code: 'sales_fail', bitrixId: 'LOSE' },
        { code: 'sales_double', bitrixId: 'APOLOGY' },
        { code: 'sales_not_ca', bitrixId: 'NOT_CA' },
    ],
};

const FIELDS: Record<string, { bitrixId: string }> = {
    op_xo_revive_queued_at: { bitrixId: 'OP_XO_REVIVE_QUEUED_AT' },
    op_xo_revive_sent_at: { bitrixId: 'OP_XO_REVIVE_SENT_AT' },
    post_fail_date: { bitrixId: 'POST_FAIL_DATE' },
};
const QUEUED = 'UF_CRM_OP_XO_REVIVE_QUEUED_AT';
const SENT = 'UF_CRM_OP_XO_REVIVE_SENT_AT';
const POST_FAIL = 'UF_CRM_POST_FAIL_DATE';

const makeHarness = (over?: {
    deals?: Array<Record<string, unknown>>;
    withFields?: boolean;
    hookFails?: boolean;
    users?: Array<{ ID: string }>;
}) => {
    const updates: Array<{ id: number; fields: Record<string, unknown> }> = [];
    const hooks: Array<Record<string, unknown>> = [];

    const bitrix = {
        deal: {
            getList: (filter: Record<string, unknown>) => {
                const rows = (over?.deals ?? []).filter(deal => {
                    // Грубая эмуляция двух наших фильтров: непустой queued
                    // (фаза A) и остальное — сервис дофильтрует в JS.
                    if (`!${QUEUED}` in filter) {
                        return Boolean(deal[QUEUED]);
                    }
                    if (`!${POST_FAIL}` in filter) {
                        return Boolean(deal[POST_FAIL]);
                    }
                    if ('<CLOSEDATE' in filter) {
                        return Boolean(deal.CLOSEDATE);
                    }
                    return true;
                });
                return Promise.resolve({ result: rows });
            },
            update: (id: number, fields: Record<string, unknown>) => {
                updates.push({ id, fields });
                return Promise.resolve({ result: true });
            },
        },
        user: {
            get: () => Promise.resolve({ result: over?.users ?? [] }),
        },
    };

    const portal = {
        getTimezone: () => TZ,
        getDealCategoryByCode: (code: string) =>
            code === 'sales_base' ? CATEGORY : undefined,
        getEntityFieldByCode: (_entity: string, code: string) =>
            (over?.withFields ?? true) ? FIELDS[code] : undefined,
        getFieldBitrixId: (field: { bitrixId: string }) =>
            `UF_CRM_${field.bitrixId}`,
        getDepartamentIdByCode: () => ({ bitrixId: 77 }),
    };

    const pbx = {
        init: () => Promise.resolve({ bitrix, PortalModel: portal }),
    } as unknown as PBXService;

    const coldHook = {
        createColdCallHook: (_domain: string, dto: Record<string, unknown>) => {
            if (over?.hookFails) {
                return Promise.reject(new Error('silence down'));
            }
            hooks.push(dto);
            return Promise.resolve({ accepted: true });
        },
    } as unknown as ColdHookSilinceEndpointService;

    return {
        service: new RejectReviveService(pbx, coldHook),
        updates,
        hooks,
    };
};

const OPTS: RejectReviveOptions = {
    intervalDays: 120,
    assignMode: 'same',
    maxPerRun: 20,
    usePostFailDate: false,
    resendAfterMinutes: 120,
};

const oldClosed = { CLOSEDATE: '2025-01-10T10:00:00+03:00' };

describe('RejectReviveService', () => {
    it('кандидат по интервалу: queued ДО хука, затем hook, затем sent', async () => {
        const { service, updates, hooks } = makeHarness({
            deals: [
                {
                    ID: '100',
                    TITLE: 'ООО Ромашка',
                    ASSIGNED_BY_ID: '8',
                    COMPANY_ID: '431',
                    ...oldClosed,
                },
            ],
        });
        const run = await service.runForDomain('x.bitrix24.ru', OPTS);

        expect(run.queued).toBe(1);
        expect(run.revived).toBe(1);
        expect(hooks).toHaveLength(1);
        expect(hooks[0].entityType).toBe('company');
        expect(hooks[0].entityId).toBe('431');
        expect(hooks[0].responsible).toBe('user_8');
        expect(String(hooks[0].name)).toContain('Реанимация отказа');

        // Порядок записи маркеров: сначала queued, после приёма — sent.
        expect(updates).toHaveLength(2);
        expect(updates[0].fields[QUEUED]).toBeTruthy();
        expect(updates[1].fields[SENT]).toBeTruthy();
    });

    it('хук упал: queued остаётся, sent НЕ ставится («недоехавшая»)', async () => {
        const { service, updates } = makeHarness({
            deals: [
                {
                    ID: '100',
                    ASSIGNED_BY_ID: '8',
                    COMPANY_ID: '',
                    ...oldClosed,
                },
            ],
            hookFails: true,
        });
        const run = await service.runForDomain('x.bitrix24.ru', OPTS);

        expect(run.queued).toBe(1);
        expect(run.revived).toBe(0);
        expect(updates).toHaveLength(1);
        expect(updates[0].fields[QUEUED]).toBeTruthy();
        expect(run.warnings.join(' ')).toContain('дошлётся следующим тиком');
    });

    it('досылка: queued старше порога и sent пуст → хук + sent', async () => {
        const staleQueued = dayjs().tz(TZ).subtract(3, 'hour').format(FMT);
        const { service, updates, hooks } = makeHarness({
            deals: [
                {
                    ID: '200',
                    ASSIGNED_BY_ID: '8',
                    COMPANY_ID: '431',
                    [QUEUED]: staleQueued,
                },
            ],
        });
        const run = await service.runForDomain('x.bitrix24.ru', OPTS);

        expect(run.resent).toBe(1);
        expect(hooks).toHaveLength(1);
        expect(updates).toHaveLength(1);
        expect(updates[0].fields[SENT]).toBeTruthy();
    });

    it('свежий queued (моложе порога) НЕ досылается', async () => {
        const freshQueued = dayjs().tz(TZ).subtract(10, 'minute').format(FMT);
        const { service, hooks } = makeHarness({
            deals: [
                {
                    ID: '200',
                    ASSIGNED_BY_ID: '8',
                    [QUEUED]: freshQueued,
                },
            ],
        });
        const run = await service.runForDomain('x.bitrix24.ru', OPTS);
        expect(run.resent).toBe(0);
        expect(hooks).toHaveLength(0);
    });

    it('сделка с sent не трогается вовсе', async () => {
        const { service, hooks, updates } = makeHarness({
            deals: [
                {
                    ID: '300',
                    ASSIGNED_BY_ID: '8',
                    [QUEUED]: '01.01.2026 10:00:00',
                    [SENT]: '01.01.2026 10:01:00',
                    ...oldClosed,
                },
            ],
        });
        const run = await service.runForDomain('x.bitrix24.ru', OPTS);
        expect(run.resent + run.queued + run.revived).toBe(0);
        expect(hooks).toHaveLength(0);
        expect(updates).toHaveLength(0);
    });

    it('перебивающая post_fail_date включает сделку без интервала; заполненная дата исключает её из интервальной ветки', async () => {
        const { service, hooks } = makeHarness({
            deals: [
                {
                    ID: '400',
                    ASSIGNED_BY_ID: '8',
                    COMPANY_ID: '431',
                    [POST_FAIL]: '01.08.2026',
                    CLOSEDATE: '2026-08-20T10:00:00+03:00', // интервал НЕ прошёл
                },
            ],
        });
        const run = await service.runForDomain('x.bitrix24.ru', {
            ...OPTS,
            usePostFailDate: true,
        });
        expect(run.revived).toBe(1);
        expect(hooks).toHaveLength(1);
    });

    it('лимит за прогон соблюдается', async () => {
        const { service, hooks } = makeHarness({
            deals: [
                { ID: '1', ASSIGNED_BY_ID: '8', ...oldClosed },
                { ID: '2', ASSIGNED_BY_ID: '8', ...oldClosed },
                { ID: '3', ASSIGNED_BY_ID: '8', ...oldClosed },
            ],
        });
        const run = await service.runForDomain('x.bitrix24.ru', {
            ...OPTS,
            maxPerRun: 2,
        });
        expect(run.revived).toBe(2);
        expect(hooks).toHaveLength(2);
    });

    it('random-режим: пустой отдел → фолбэк на того же + warning', async () => {
        const { service, hooks } = makeHarness({
            deals: [
                {
                    ID: '1',
                    ASSIGNED_BY_ID: '8',
                    COMPANY_ID: '431',
                    ...oldClosed,
                },
            ],
            users: [],
        });
        const run = await service.runForDomain('x.bitrix24.ru', {
            ...OPTS,
            assignMode: 'random',
        });
        expect(hooks[0].responsible).toBe('user_8');
        expect(run.warnings.join(' ')).toContain('фолбэк');
    });

    it('random-режим: назначает из отдела', async () => {
        const { service, hooks } = makeHarness({
            deals: [
                {
                    ID: '1',
                    ASSIGNED_BY_ID: '8',
                    COMPANY_ID: '431',
                    ...oldClosed,
                },
            ],
            users: [{ ID: '55' }],
        });
        await service.runForDomain('x.bitrix24.ru', {
            ...OPTS,
            assignMode: 'random',
        });
        expect(hooks[0].responsible).toBe('user_55');
    });

    it('self-gate: маркер-полей нет — прогон молчит', async () => {
        const { service, hooks, updates } = makeHarness({
            deals: [{ ID: '1', ASSIGNED_BY_ID: '8', ...oldClosed }],
            withFields: false,
        });
        const run = await service.runForDomain('x.bitrix24.ru', OPTS);
        expect(hooks).toHaveLength(0);
        expect(updates).toHaveLength(0);
        expect(run.warnings.join(' ')).toContain('не установлены');
    });
});
