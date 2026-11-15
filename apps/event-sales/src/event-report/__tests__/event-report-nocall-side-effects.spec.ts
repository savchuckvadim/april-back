import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import { EventReportContext } from '../services/context/event-report.context';
import { SalesBaseDealService } from '../services/deal/sales-base-deal.service';
import { buildPresentationFlowJobs } from '../services/post-flow/presentation-flow-job.builder';
import { buildZprFlowJobs } from '../services/post-flow/zpr-flow-job.builder';
import { SideFlowJobBuildInput } from '../services/post-flow/side-flow-job.base';

/**
 * Кнопка «Недозвон» (решение владельца 15.11.2026): быстрый нерезультативный
 * звонок пишет карточки сущностей и списки, но НЕ трогает стадии и НЕ
 * создаёт сделок и элементов смартов.
 *
 * Раньше недозвон шёл общим путём отчёта: лестница стадий по типу задачи
 * поднимала основную сделку, клиент без своей открытой сделки получал
 * новую, а недозвон по задаче презентации закрывал элемент смарта
 * «Презентации» в «Не состоялась» при открытой задаче.
 */
dayjs.extend(utc);
dayjs.extend(timezone);

const portal = {
    getTimezone: () => 'Europe/Moscow',
    getEntityFieldByCode: () => undefined,
    getFieldBitrixId: () => '',
    getPortal: () => ({ domain: 'd.b24.ru' }),
    getDealCategoryByCode: () => ({
        bitrixId: '31',
        stages: [
            { code: 'sales_warm', bitrixId: 'WARM' },
            { code: 'sales_pres', bitrixId: 'PRESENTATION' },
        ],
    }),
};

const noCallCtx = (taskType: string, currentBaseDeal: object | null) =>
    new EventReportContext(
        {
            currentTask: { eventType: taskType, name: 'ООО Ромашка' },
            report: { resultStatus: 'noresult', isNoCall: true },
            // Форма отдаёт тип плана и при выключенном плане.
            plan: {
                isPlanned: false,
                isActive: false,
                type: { current: { code: taskType } },
            },
        } as never,
        portal as never,
        {
            entityType: 'company',
            entityId: 7,
            company: { ID: '7' },
            currentBaseDeal,
            currentPresDeal: null,
        } as never,
        new Date('2026-11-15T09:00:00.000Z'),
    );

const bitrixRecorder = () => {
    const calls: { method: string; cmd: string; args: unknown[] }[] = [];
    const record =
        (method: string) =>
        (cmd: string, ...args: unknown[]) =>
            calls.push({ method, cmd, args });
    return {
        calls,
        bitrix: {
            batch: { deal: { set: record('set'), update: record('update') } },
        },
    };
};

describe('Недозвон: основная сделка', () => {
    it('пишет карточку текущей сделки без стадии, воронки и ответственного', () => {
        const { calls, bitrix } = bitrixRecorder();
        const id = new SalesBaseDealService(
            bitrix as never,
            portal as never,
        ).queue(
            noCallCtx('presentation', {
                ID: '100',
                STAGE_ID: 'C31:WARM',
                ASSIGNED_BY_ID: '5',
            }),
        );

        expect(id).toBe('100');
        expect(calls).toHaveLength(1);
        expect(calls[0]).toMatchObject({
            method: 'update',
            cmd: 'update_base_deal_100',
        });
        const fields = calls[0].args[1] as Record<string, unknown>;
        expect(fields).not.toHaveProperty('STAGE_ID');
        expect(fields).not.toHaveProperty('CATEGORY_ID');
        expect(fields).not.toHaveProperty('ASSIGNED_BY_ID');
    });

    it('своей открытой сделки нет — новую не заводит', () => {
        const { calls, bitrix } = bitrixRecorder();
        const id = new SalesBaseDealService(
            bitrix as never,
            portal as never,
        ).queue(noCallCtx('warm', null));

        expect(id).toBeNull();
        expect(calls).toEqual([]);
    });
});

describe('Недозвон: смарты', () => {
    const input = (taskType: string): SideFlowJobBuildInput =>
        ({
            ctx: noCallCtx(taskType, null),
            deals: {},
            planTaskId: null,
            createdPresDealId: null,
            kpiRowRefs: {},
            questionnaire: null,
        }) as unknown as SideFlowJobBuildInput;

    it('по задаче презентации — элемент «Презентации» не трогаем', () => {
        expect(buildPresentationFlowJobs(input('presentation'))).toEqual([]);
    });

    it('по задаче «Решение» — элемент ЗПР не трогаем', () => {
        expect(buildZprFlowJobs(input('hot'))).toEqual([]);
    });
});
