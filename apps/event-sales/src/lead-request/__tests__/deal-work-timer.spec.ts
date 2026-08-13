import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import { LeadRequestAcceptService } from '../services/lead-request-accept.service';
import { TransferWorkUseCase } from '../../sales-hooks/transfer-work/use-cases/transfer-work.use-case';

// В рантайме плагины dayjs расширяются при импорте @lib/shared/lib/date.
dayjs.extend(utc);
dayjs.extend(timezone);

/**
 * Таймер «работа ждёт подтверждения» НА СДЕЛКЕ (`op_lead_assigned_at`).
 *
 * Контур зеркален лидовому и живёт своей жизнью (к конвертации заявки
 * отношения не имеет):
 *   ставится  — передачей работы (`transfer-work`);
 *   снимается — принятием (`LeadRequestAcceptService`), точка ОДНА;
 *   страхуется — SLA-кроном (второй проход, см. lead-request-sla.spec).
 *
 * Главное, что закрепляем: снятый таймер не воскресает, а подтверждённую
 * работу никто не забирает.
 */
const ASSIGNED_AT = 'UF_CRM_OP_LEAD_ASSIGNED_AT';
const HISTORY = 'UF_CRM_OP_MHISTORY';

const makePortal = () => ({
    getTimezone: () => 'Europe/Moscow',
    getEntityFieldByCode: (_entity: string, code: string) => {
        if (code === 'op_lead_assigned_at') {
            return { bitrixId: 'OP_LEAD_ASSIGNED_AT', items: [] };
        }
        if (code === 'op_mhistory') {
            return { bitrixId: 'OP_MHISTORY', items: [] };
        }
        return undefined;
    },
    getFieldBitrixId: (field: { bitrixId: string }) =>
        `UF_CRM_${field.bitrixId}`,
    getSalesTaskGroupId: () => 77,
    // Только основная воронка сконфигурирована: сделка 1024 попадает в
    // ветку sales_base, а не в «аналитические спутники».
    getDealCategoryByCode: (code: string) =>
        code === 'sales_base' ? { bitrixId: '3', stages: [] } : undefined,
});

const CRM_DATE = /^\d{2}\.\d{2}\.\d{4} \d{2}:\d{2}:\d{2}$/;

describe('Таймер подтверждения на СДЕЛКЕ', () => {
    /* ---------------------------------------------------------------- *
     * ЗАПИСЬ — передача работы.
     * ---------------------------------------------------------------- */

    const makeTransferCtx = (deal: Record<string, unknown>) => {
        const calls: { cmd: string; args: unknown[] }[] = [];
        const buffer = {
            queue: jest.fn((enqueue: () => void) => enqueue()),
            endGroup: jest.fn().mockResolvedValue(undefined),
            flush: jest.fn().mockResolvedValue(undefined),
        };
        const bitrix = {
            batch: {
                deal: {
                    get: jest.fn(),
                    getList: jest.fn(),
                    update: (cmd: string, ...args: unknown[]) =>
                        calls.push({ cmd, args }),
                },
                company: { update: jest.fn() },
                task: { getList: jest.fn(), update: jest.fn(), add: jest.fn() },
            },
            api: {
                callBatchWithConcurrency: jest.fn().mockResolvedValue([
                    {
                        result: {
                            scope_deal_1024: deal,
                        },
                    },
                ]),
            },
        };
        return {
            calls,
            ctx: {
                bitrix,
                portal: makePortal(),
                buffer,
                domain: 'd.b24.ru',
            },
        };
    };

    it('передача работы ставит таймер и пишет историю сделки', async () => {
        const { ctx, calls } = makeTransferCtx({
            ID: '1024',
            CATEGORY_ID: '3',
            ASSIGNED_BY_ID: '5',
            CLOSED: 'N',
            [HISTORY]: ['01.08.2026 10:00 — старая запись'],
        });

        await new TransferWorkUseCase().execute(ctx as never, [
            {
                action: 'give',
                dealIds: [1024],
                newResponsibleId: 8,
                includeOverdue: true,
                rescheduleOverdue: false,
                moveMainDealToCold: false,
                createCallTask: false,
            },
        ]);

        const fields = calls[0].args[1] as Record<string, unknown>;
        expect(fields.ASSIGNED_BY_ID).toBe('8');
        // Таймер стартует заново — новый ответственный не наследует чужую
        // просрочку.
        expect(String(fields[ASSIGNED_AT])).toMatch(CRM_DATE);
        // История дописывается, прошлое не затирается.
        const history = fields[HISTORY] as string[];
        expect(history[0]).toBe('01.08.2026 10:00 — старая запись');
        expect(history[1]).toContain('ХО передан: 5 → 8');
    });

    /* ---------------------------------------------------------------- *
     * ОЧИСТКА — принятие. Точка одна на оба пути (кнопка UI и робот).
     * ---------------------------------------------------------------- */

    const makeAcceptDeps = (deal: Record<string, unknown>) => {
        const dealUpdate = jest.fn().mockResolvedValue({});
        const pbx = {
            init: jest.fn().mockResolvedValue({
                bitrix: {
                    deal: {
                        get: jest.fn().mockResolvedValue({ result: deal }),
                        update: dealUpdate,
                    },
                    lead: { get: jest.fn(), update: jest.fn() },
                },
                PortalModel: makePortal(),
            }),
        };
        return {
            dealUpdate,
            service: new LeadRequestAcceptService(pbx as never),
        };
    };

    it('принятие сделки БЕЗ лида снимает таймер и пишет историю', async () => {
        const { service, dealUpdate } = makeAcceptDeps({
            ID: '1024',
            ASSIGNED_BY_ID: '8',
            [ASSIGNED_AT]: '10.08.2026 10:00:00',
            [HISTORY]: ['10.08.2026 10:00 — ХО передан: 5 → 8'],
        });

        const result = await service.accept({
            domain: 'd.b24.ru',
            dealId: 1024,
            userId: 8,
        });

        expect(result.success).toBe(true);
        expect(result.already).toBe(false);
        const fields = (
            dealUpdate.mock.calls as unknown as [
                number,
                Record<string, unknown>,
            ][]
        )[0][1];
        // Пустая строка = ждать больше нечего, крон сделку не увидит.
        expect(fields[ASSIGNED_AT]).toBe('');
        const history = fields[HISTORY] as string[];
        expect(history.at(-1)).toContain('Заявка принята в работу: 8');
        // Стадию сделки без лида не трогаем: она могла ждать подтверждения
        // на любом этапе, «Холодная» была бы откатом работы назад.
        expect(fields.STAGE_ID).toBeUndefined();
    });

    /*
     * СНЯТЫЙ ТАЙМЕР НЕ ВОСКРЕСАЕТ. Повторное принятие — идемпотентный
     * no-op: ни одной записи, а значит нечему и «вернуть» ожидание.
     */
    it('повторное принятие ничего не пишет — таймер не воскресает', async () => {
        const { service, dealUpdate } = makeAcceptDeps({
            ID: '1024',
            ASSIGNED_BY_ID: '8',
            [ASSIGNED_AT]: '', // уже подтверждено
        });

        const result = await service.accept({
            domain: 'd.b24.ru',
            dealId: 1024,
        });

        expect(result.already).toBe(true);
        expect(dealUpdate).not.toHaveBeenCalled();
    });

    it('поле таймера не установлено на портале → подтверждать нечего', () => {
        const portal = {
            ...makePortal(),
            getEntityFieldByCode: () => undefined,
        };
        const plan = new LeadRequestAcceptService({} as never).planDealOnly(
            portal as never,
            1024,
            { ID: '1024' },
        );
        expect(plan.already).toBe(true);
        expect(plan.dealUpdate).toBeNull();
        expect(plan.warnings.join(' ')).toContain('не установлено');
    });
});
