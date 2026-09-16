import { DealFlowService } from '../services/flows/deal-flow.service';
import { TaskFlowService } from '../services/flows/task-flow.service';

/**
 * СВОБОДНЫЙ ТЕКСТ В BATCH-КОМАНДЕ ОБЯЗАН БЫТЬ ЭКРАНИРОВАН.
 *
 * Инцидент 16.09.2026, найден на бою: лид «ИЦК #1449670 (ООО "ВЫСОТА")»
 * создал сделку с заголовком «ИЦК» — в воронке 0, в стадии NEW, без компании,
 * без контактов и без наших полей связи. Значение batch-команды вклеивается в
 * query-строку сырым, Битрикс разбирает её как url и отбрасывает всё от
 * первого `#`: вместе с хвостом заголовка улетели CATEGORY_ID, STAGE_ID и
 * остальные поля команды.
 *
 * Поэтому проверяем не «как выглядит заголовок», а инвариант: в значениях,
 * уходящих батчем, не остаётся сырых `#`, `&`, `+`, `%` и переносов.
 */
const RAW_DANGEROUS = 'ИЦК #1449670 & Ко +7 скидка 50%';

const makeDeps = () => {
    const commands: { cmd: string; fields: Record<string, unknown> }[] = [];
    const bitrix = {
        batch: {
            deal: {
                set: (cmd: string, fields: Record<string, unknown>) =>
                    commands.push({ cmd, fields }),
                update: (
                    cmd: string,
                    _id: number,
                    fields: Record<string, unknown>,
                ) => commands.push({ cmd, fields }),
            },
            task: {
                add: (cmd: string, fields: Record<string, unknown>) =>
                    commands.push({ cmd, fields }),
                update: (
                    cmd: string,
                    _id: number,
                    fields: Record<string, unknown>,
                ) => commands.push({ cmd, fields }),
                complete: () => undefined,
            },
        },
    };
    const portal = {
        getSalesTaskGroupId: () => 5,
        getEntityFieldByCode: () => undefined,
        getFieldBitrixId: () => '',
        getTimezone: () => 'Europe/Moscow',
    };
    const buffer = { queue: (fn: () => unknown) => fn() };
    return { commands, bitrix, portal, buffer };
};

/** Ни одного символа, который рвёт разбор cmd-строки на стороне Битрикс. */
const expectBatchSafe = (value: unknown): void => {
    const text = String(value);
    expect(text).not.toContain('#');
    expect(text).not.toContain('&');
    expect(text).not.toContain('+');
    expect(text).not.toContain('\n');
};

describe('lead → работа: заголовки уходят batch-safe', () => {
    it('TITLE сделки экранирован — иначе теряются CATEGORY_ID и STAGE_ID', () => {
        const { commands, bitrix, portal, buffer } = makeDeps();
        const service = new DealFlowService(bitrix as never, portal as never);

        service.queueBase(
            { leadId: 42, responsible: 7, isXo: 'N' } as never,
            { contactIds: [], lead: {} } as never,
            { dealCategoryId: '31', dealStageId: 'C31:REFINE' } as never,
            RAW_DANGEROUS,
            null,
            null,
            buffer as never,
        );

        const deal = commands.find(c => c.cmd.startsWith('lw_deal_'));
        expect(deal).toBeDefined();
        expectBatchSafe(deal?.fields.TITLE);
        // Поля, которые терялись вместе с хвостом заголовка, на месте.
        expect(deal?.fields.CATEGORY_ID).toBe('31');
        expect(deal?.fields.STAGE_ID).toBe('C31:REFINE');
    });

    it('TITLE новой задачи экранирован', () => {
        const { commands, bitrix, portal, buffer } = makeDeps();
        const service = new TaskFlowService(bitrix as never, portal as never);

        service.queue(
            {
                leadId: 42,
                responsible: 7,
                taskMode: 'move',
                isXo: 'N',
            } as never,
            { openTasks: [] } as never,
            {
                eventName: RAW_DANGEROUS,
                xoTitle: RAW_DANGEROUS,
                companyRef: null,
                dealRef: '$result[deal]',
                xoRef: null,
            },
            buffer as never,
        );

        const task = commands.find(c => c.cmd.startsWith('lw_task_add_'));
        expect(task).toBeDefined();
        expectBatchSafe(task?.fields.TITLE);
    });

    it('TITLE переносимой задачи экранирован вместе с префиксом', () => {
        const { commands, bitrix, portal, buffer } = makeDeps();
        const service = new TaskFlowService(bitrix as never, portal as never);

        service.queue(
            {
                leadId: 42,
                responsible: 7,
                taskMode: 'move',
                isXo: 'N',
            } as never,
            { openTasks: [{ id: 100, title: RAW_DANGEROUS }] } as never,
            {
                eventName: 'x',
                xoTitle: 'x',
                companyRef: null,
                dealRef: '$result[deal]',
                xoRef: null,
            },
            buffer as never,
        );

        const task = commands.find(c => c.cmd.startsWith('lw_task_move_'));
        expect(task).toBeDefined();
        expectBatchSafe(task?.fields.TITLE);
        expect(String(task?.fields.TITLE)).toContain('Звонок');
    });
});
