import {
    emptyDealMovementNotesSummary,
    type DealMovementStateEntry,
    type DealMovementVerdict,
} from '@lib/sales-ai-analytics';
import { ETimeZone } from '@lib/shared/lib/date';
import {
    DealMovementNotesService,
    type DealMovementNotesInput,
} from '../services/deal-movement-notes.service';
import { NOTES_ON } from './deal-movement-run.fixture';

const DOMAIN = 'garant.bitrix24.ru';
const DAY = '2026-11-18';
const NOW = '2026-11-17T23:30:00.000Z';

const verdict = (
    dealId: string,
    status: DealMovementVerdict['status'],
): DealMovementVerdict => ({
    dealId,
    status,
    reasons: status === 'moving' ? ['stage_forward'] : ['stage_overdue'],
    facts: {
        daysInStage: 30,
        stageLimitDays: 21,
        stepDate: null,
        lastProgress: null,
        daysSinceAgreed: null,
    },
});

const entry = (
    status: DealMovementStateEntry['status'],
): DealMovementStateEntry => ({
    status,
    notifiedStatus: 'moving',
    reasons: [],
    stageCode: 'sales_pres',
    amount: null,
    assignedById: 7,
    lastActivityAt: null,
    changedAt: NOW,
    notifiedAt: null,
    checkedAt: NOW,
});

interface Setup {
    /** Сколько уже потрачено за день портала. */
    used?: { notes?: number; texts?: number };
    failOn?: number;
    actions?: string[] | null;
}

const build = (setup: Setup = {}) => {
    const addTimelineComment = jest.fn((data: { ENTITY_ID: number }) =>
        data.ENTITY_ID === setup.failOn
            ? Promise.reject(new Error('ACCESS_DENIED'))
            : Promise.resolve({ result: 501 }),
    );
    const bitrix = { timeline: { addTimelineComment } };
    const pbx = { init: jest.fn().mockResolvedValue({ bitrix }) };
    const stateStore = { saveEntry: jest.fn().mockResolvedValue(undefined) };
    const used = {
        notes: setup.used?.notes ?? 0,
        texts: setup.used?.texts ?? 0,
    };
    const counters = {
        used: jest.fn((_d: string, _day: string, counter: 'notes' | 'texts') =>
            Promise.resolve(used[counter]),
        ),
        increment: jest.fn(
            (_d: string, _day: string, counter: 'notes' | 'texts') => {
                used[counter] += 1;
                return Promise.resolve();
            },
        ),
    };
    const todo = {
        modelOf: jest.fn().mockResolvedValue('bitrixgpt-5'),
        actionsFor: jest.fn().mockResolvedValue({
            actions:
                setup.actions === undefined
                    ? ['Позвонить клиенту', 'Назначить встречу']
                    : setup.actions,
            failed: setup.actions === null,
            error: null,
        }),
    };
    const service = new DealMovementNotesService(
        pbx as never,
        stateStore as never,
        counters as never,
        todo as never,
    );
    return { service, addTimelineComment, stateStore, counters, todo, used };
};

const input = (
    over: Partial<DealMovementNotesInput> = {},
): DealMovementNotesInput => ({
    domain: DOMAIN,
    day: DAY,
    timezone: ETimeZone.EUROPE_MOSCOW,
    plan: {
        state: new Map([
            ['11', entry('stuck')],
            ['12', entry('moving')],
        ]),
        toNotify: ['11', '12'],
    },
    verdicts: new Map([
        ['11', verdict('11', 'stuck')],
        ['12', verdict('12', 'moving')],
    ]),
    pointers: new Map(),
    options: NOTES_ON,
    summary: emptyDealMovementNotesSummary('comment'),
    now: NOW,
    pauseMs: 0,
    onProgress: jest.fn().mockResolvedValue(undefined),
    ...over,
});

describe('запись движения сделок в ленту', () => {
    it('по одной: удалась — notifiedStatus сдвинут, сделка сразу в хеш, счётчик ночи растёт', async () => {
        const { service, addTimelineComment, stateStore, used } = build();
        const run = input();

        const outcome = await service.write(run);

        expect(addTimelineComment).toHaveBeenCalledTimes(2);
        expect(addTimelineComment).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({ ENTITY_ID: 11, ENTITY_TYPE: 'deal' }),
            { retries: 0 },
        );
        const [first] = addTimelineComment.mock.calls[0] as unknown as [
            { COMMENT: string },
        ];
        expect(first.COMMENT).toContain('Движение сделки: Застряла');
        expect(first.COMMENT).toContain('Что сделать:\n— Позвонить клиенту');
        expect([...outcome.written]).toEqual(['11', '12']);
        expect(stateStore.saveEntry).toHaveBeenCalledWith(
            DOMAIN,
            '11',
            expect.objectContaining({
                status: 'stuck',
                notifiedStatus: 'stuck',
                notifiedAt: NOW,
            }),
        );
        expect(run.plan.state.get('11')?.notifiedStatus).toBe('stuck');
        expect(used.notes).toBe(2);
        expect(run.summary).toMatchObject({ written: 2, failed: 0, texts: 1 });
        expect(run.onProgress).toHaveBeenCalledTimes(2);
    });

    it('«что сделать» — только у тревожных статусов и моделью портала', async () => {
        const { service, todo } = build();

        await service.write(input());

        expect(todo.actionsFor).toHaveBeenCalledTimes(1);
        expect(todo.actionsFor).toHaveBeenCalledWith(
            expect.objectContaining({
                domain: DOMAIN,
                model: 'bitrixgpt-5',
                pointers: null,
            }),
        );
    });

    it('лимит подсказок за ночь исчерпан — запись без блока, модель не зовём', async () => {
        const { service, todo, addTimelineComment } = build({
            used: { texts: 50 },
        });

        await service.write(input());

        expect(todo.actionsFor).not.toHaveBeenCalled();
        const [first] = addTimelineComment.mock.calls[0] as unknown as [
            { COMMENT: string },
        ];
        expect(first.COMMENT).not.toContain('Что сделать');
    });

    it('модель не дала годных строк — запись без блока, «без подсказки» в итоге', async () => {
        const { service } = build({ actions: null });
        const run = input();

        await service.write(run);

        expect(run.summary).toMatchObject({ texts: 0, textsFailed: 1 });
    });

    it('сбой записи — расхождение остаётся, сделка не сохраняется, в итоге «не удалось»', async () => {
        const { service, stateStore, used } = build({ failOn: 11 });
        const run = input();

        const outcome = await service.write(run);

        expect([...outcome.written]).toEqual(['12']);
        expect(stateStore.saveEntry).toHaveBeenCalledTimes(1);
        expect(run.plan.state.get('11')?.notifiedStatus).toBe('moving');
        expect(used.notes).toBe(1);
        expect(run.summary.failed).toBe(1);
        expect(outcome.warnings).toEqual([
            'не удалось записать в ленту сделки 11: ACCESS_DENIED',
        ]);
    });

    it('сколько ещё можно этой ночью: выключено — ноль, иначе лимит минус сделанное', async () => {
        const { service } = build({ used: { notes: 30 } });

        expect(
            await service.remaining(DOMAIN, DAY, { ...NOTES_ON, write: false }),
        ).toBe(0);
        expect(await service.remaining(DOMAIN, DAY, NOTES_ON)).toBe(70);
        expect(
            await service.remaining(DOMAIN, DAY, { ...NOTES_ON, maxNotes: 10 }),
        ).toBe(0);
    });

    it('плана нет — в Битрикс не ходим', async () => {
        const { service, addTimelineComment } = build();

        await service.write(
            input({ plan: { state: new Map(), toNotify: [] } }),
        );

        expect(addTimelineComment).not.toHaveBeenCalled();
    });
});
