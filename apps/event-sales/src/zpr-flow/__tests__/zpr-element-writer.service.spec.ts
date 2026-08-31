import { ZprSmartInfo } from '@lib/portal-lib/pbx/pbx-zpr-smart';
import { SmartItemFields } from '@lib/portal-lib/pbx/smart-item-fields';
import { ZprElementWriterService } from '../services/zpr-element-writer.service';
import { ZprFlowJobData } from '../dto/zpr-flow-job.dto';
import { BxRow } from '../types/zpr-flow-run.type';
import {
    answer,
    dateAnswer,
    makeBitrix,
    makePortal,
    makeRun,
} from './zpr-flow.fixtures';

/**
 * Запись элемента ЗПР: план создаёт элемент в «Запланирован» со связями и
 * план-комментарием в ленте; отчёт закрывает открытый элемент клиента (или
 * создаёт спонтанный), дописывая ленту; перенос двигает элемент в
 * «Ожидание», не закрывая. Обратная ссылка op_zprs — заодно.
 */
const makeHarness = (over?: {
    openItems?: BxRow[];
    job?: Partial<ZprFlowJobData>;
    itemFields?: SmartItemFields | null;
    info?: ZprSmartInfo;
}) => {
    const spy = makeBitrix({ openItems: over?.openItems });
    const portal = makePortal();
    const run = makeRun({
        bitrix: spy.bitrix,
        portal,
        job: over?.job,
        info: over?.info,
        itemFields: over?.itemFields,
    });

    return {
        writer: new ZprElementWriterService(spy.bitrix, portal),
        run,
        ...spy,
    };
};

/** Открытый элемент клиента, найденный по базовой сделке. */
const open = (over?: BxRow): BxRow => ({
    id: 601,
    stageId: 'DT1038_9:PLAN',
    ufCrm7BaseDeal: ['D_100'],
    ...over,
});

describe('ZprElementWriterService', () => {
    it('план: элемент в «Запланирован» со связями и лентой комментариев', async () => {
        const { writer, run, added, dealUpdates } = makeHarness();

        const result = await writer.createPlanned(run, ['plan']);

        expect(result).toEqual({ action: 'created', elementId: 501 });
        expect(added).toHaveLength(1);
        const fields = added[0];
        expect(fields.stageId).toBe('DT1038_9:PLAN');
        expect(fields.ufCrm7BaseDeal).toBe(100);
        expect(fields.ufCrm7PlanDate).toBe('01.09.2026 10:00:00');
        expect(String((fields.ufCrm7Comments as string[])[0])).toContain(
            'План: Договорились созвониться',
        );
        // Обратная ссылка op_zprs: сделка + компания, append без дублей.
        expect(dealUpdates).toHaveLength(2);
        expect(dealUpdates[0].fields.UF_CRM_OP_ZPRS).toEqual([
            'T40e_1',
            'T40e_501',
        ]);
    });

    it('отчёт: открытый элемент клиента закрывается с дописанной лентой', async () => {
        const { writer, run, added, updatedItems } = makeHarness({
            openItems: [
                open({ ufCrm7Comments: ['01.08.2026 10:00:00 План: старое'] }),
            ],
            job: { kind: 'report', reportComment: 'Решение принято' },
        });

        const result = await writer.closeReported(run);

        expect(result).toEqual({ action: 'closed', elementId: 601 });
        expect(added).toHaveLength(0);
        expect(updatedItems).toHaveLength(1);
        expect(updatedItems[0].id).toBe(601);
        expect(updatedItems[0].fields.stageId).toBe('DT1038_9:SUCCESS');
        const comments = updatedItems[0].fields.ufCrm7Comments as string[];
        expect(comments[0]).toContain('Отчёт: Решение принято');
        expect(comments[1]).toContain('План: старое');
    });

    it('отчёт без открытого элемента → спонтанный, сразу с исходом', async () => {
        const { writer, run, added } = makeHarness({
            openItems: [],
            job: { kind: 'report', isResult: false },
        });

        const result = await writer.closeReported(run);

        expect(result.action).toBe('spontaneous');
        expect(added).toHaveLength(1);
        expect(added[0].stageId).toBe('DT1038_9:NORESULT');
        expect(added[0].ufCrm7Spont).toBe('Y');
    });

    it('чужой открытый элемент (другая сделка) не закрывается', async () => {
        const { writer, run, added, updatedItems } = makeHarness({
            openItems: [open({ id: 700, ufCrm7BaseDeal: ['D_999'] })],
            job: { kind: 'report' },
        });

        await writer.closeReported(run);

        expect(updatedItems).toHaveLength(0);
        expect(added).toHaveLength(1); // спонтанный для НАШЕГО клиента
    });

    it('перенос двигает элемент в «Ожидание» со счётчиком, не закрывая', async () => {
        const { writer, run, added, updatedItems } = makeHarness({
            openItems: [open({ ufCrm7MoveCount: 2 })],
            job: {
                kind: 'report',
                isMove: true,
                planDeadline: '05.09.2026 10:00:00',
            },
        });

        const result = await writer.closeReported(run);

        expect(result).toEqual({ action: 'moved', elementId: 601 });
        expect(added).toHaveLength(0);
        expect(updatedItems[0].fields.stageId).toBe('DT1038_9:PENDING');
        expect(updatedItems[0].fields.ufCrm7MoveCount).toBe(3);
        expect(updatedItems[0].fields.ufCrm7PlanDate).toBe(
            '05.09.2026 10:00:00',
        );
        expect(
            String((updatedItems[0].fields.ufCrm7Comments as string[])[0]),
        ).toContain('Перенос:');
    });

    it('перенос без открытого элемента честно создаёт план', async () => {
        const { writer, run, added } = makeHarness({
            openItems: [],
            job: { kind: 'report', isMove: true },
        });

        const result = await writer.closeReported(run);

        expect(result.action).toBe('created');
        expect(added[0].stageId).toBe('DT1038_9:PLAN');
    });

    // ─────────────────── ответы портальной анкеты ───────────────────

    it('план: ответ анкеты плана ложится в СОЗДАВАЕМЫЙ элемент', async () => {
        const { writer, run, added } = makeHarness({
            job: { answers: [answer({ purpose: 'plan', value: 'Ждут КП' })] },
        });

        await writer.createPlanned(run, ['plan']);

        expect(added[0].ufCrm7QObjection).toBe('Ждут КП');
    });

    it('закрытие: ответы отчёта ложатся в ЗАКРЫВАЕМЫЙ элемент', async () => {
        const { writer, run, updatedItems } = makeHarness({
            openItems: [open()],
            job: { kind: 'report', answers: [answer()] },
        });

        await writer.closeReported(run);

        expect(updatedItems[0].fields.stageId).toBe('DT1038_9:SUCCESS');
        expect(updatedItems[0].fields.ufCrm7QObjection).toBe('Дорого');
    });

    it('перенос: анкета ПЛАНА едет в ТОТ ЖЕ элемент (план-джоба нет)', async () => {
        const { writer, run, updatedItems } = makeHarness({
            openItems: [open()],
            job: {
                kind: 'report',
                isMove: true,
                answers: [answer(), dateAnswer()],
            },
        });

        const result = await writer.closeReported(run);

        // Перенос план-джоб не ставит, а новым планом стал этот элемент:
        // ответы плана раньше пропадали молча.
        expect(result.action).toBe('moved');
        expect(updatedItems[0].fields.stageId).toBe('DT1038_9:PENDING');
        expect(updatedItems[0].fields.ufCrm7QObjection).toBe('Дорого');
        expect(updatedItems[0].fields.ufCrm7QDecisionAt).toBe('20.09.2026');
    });

    it('перенос без открытого элемента: новый несёт и ОТЧЁТНЫЕ ответы', async () => {
        const { writer, run, added } = makeHarness({
            openItems: [],
            job: {
                kind: 'report',
                isMove: true,
                answers: [answer(), dateAnswer()],
            },
        });

        const result = await writer.closeReported(run);

        // Элемент рождается ради ЭТОГО отчёта — отчётный ответ принадлежит
        // ему же, другого элемента у него не будет.
        expect(result.action).toBe('created');
        expect(added[0].ufCrm7QObjection).toBe('Дорого');
        expect(added[0].ufCrm7QDecisionAt).toBe('20.09.2026');
    });

    it('спонтанный ЗПР: элемент рождается сразу с ответами', async () => {
        const { writer, run, added } = makeHarness({
            openItems: [],
            job: { kind: 'report', answers: [answer()] },
        });

        const result = await writer.closeReported(run);

        expect(result.action).toBe('spontaneous');
        expect(added[0].ufCrm7QObjection).toBe('Дорого');
    });

    it('живые поля не прочитаны — ответы не пишутся, элемент создаётся', async () => {
        const { writer, run, added } = makeHarness({
            itemFields: null,
            job: { answers: [answer({ purpose: 'plan' })] },
        });
        const result = await writer.createPlanned(run, ['plan']);

        expect(result.action).toBe('created');
        expect(added[0].ufCrm7QObjection).toBeUndefined();
        expect(added[0].stageId).toBe('DT1038_9:PLAN');
    });

    // ─────────────────────── снимок анкеты ЗПР ───────────────────────

    it('снимок анкеты раскладывается по кодам полей смарта', async () => {
        const { writer, run, added } = makeHarness({
            openItems: [],
            job: {
                kind: 'report',
                survey: { ZPR_REPORT_COMMENT: 'Итог разговора' },
            },
        });

        await writer.closeReported(run);

        expect(added[0].ufCrm7ReportComment).toBe('Итог разговора');
    });

    it('на переносе снимок анкеты не пишется (звонок ещё не состоялся)', async () => {
        const { writer, run, updatedItems } = makeHarness({
            openItems: [open()],
            job: {
                kind: 'report',
                isMove: true,
                survey: { ZPR_REPORT_COMMENT: 'Итог разговора' },
            },
        });

        await writer.closeReported(run);

        expect(updatedItems[0].fields.ufCrm7ReportComment).toBeUndefined();
    });
});

describe('itemIdOf', () => {
    // Разбор ответа записи живёт рядом с writer'ом — его единственным
    // потребителем в проде.
    it('достаёт id созданного элемента, мусор читает как null', async () => {
        const { itemIdOf } = await import(
            '../services/zpr-element-writer.service'
        );
        expect(itemIdOf({ result: { item: { id: 601 } } })).toBe(601);
        expect(itemIdOf({ result: { item: { id: '601' } } })).toBe(601);
        expect(itemIdOf({ result: {} })).toBeNull();
        expect(itemIdOf(null)).toBeNull();
    });
});
