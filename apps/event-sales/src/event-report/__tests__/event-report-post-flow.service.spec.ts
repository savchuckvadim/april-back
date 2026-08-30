import { Logger } from '@nestjs/common';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import { QueueNames } from '@/modules/queue/constants/queue-names.enum';
import { JobNames } from '@/modules/queue/constants/job-names.enum';
import { EventReportContext } from '../services/context/event-report.context';
import { EventReportPostFlowService } from '../services/post-flow/event-report-post-flow.service';

/**
 * Координатор сайд-flow.
 *
 * Главное, ради чего он появился: id план-задачи лежит в ответе УЖЕ
 * отправленного батча (`$result[add_task]`), и достать его можно без
 * единого лишнего запроса — раньше плановый элемент смарта оставался без
 * привязки к задаче до следующего отчёта по ней. Плюс инварианты
 * постановки: джобы независимы, упавшая постановка отчёт не роняет, а
 * сбойный чанк батча не должен ломать чтение id.
 */
// В рантайме плагины dayjs расширяются при импорте @lib/shared/lib/date.
dayjs.extend(utc);
dayjs.extend(timezone);

const makePortal = () => ({
    getTimezone: () => 'Europe/Moscow',
    getEntityFieldByCode: () => undefined,
    getFieldBitrixId: () => '',
    getPortal: () => ({ domain: 'test.bitrix24.ru' }),
});

/** Отчёт по ЗПР-задаче + план следующего ЗПР: два kind'а одного потока. */
const makeCtx = () =>
    new EventReportContext(
        {
            domain: 'test.bitrix24.ru',
            operationId: 'op-1',
            currentTask: { eventType: 'hot' },
            report: {
                resultStatus: 'result',
                description: 'дозвонились',
                workStatus: { current: { code: 'inJob' } },
            },
            plan: {
                isPlanned: true,
                isActive: true,
                type: { current: { code: 'hot' } },
                responsibility: { ID: 12 },
            },
        } as never,
        makePortal() as never,
        {
            entityType: 'company',
            entityId: 7,
            company: { ID: '7' },
            lead: null,
            currentBaseDeal: { ID: '101' },
            currentPresDeal: null,
            currentTmcDeal: null,
            currentTmcFromPresentation: null,
            currentTask: { id: 555 },
        } as never,
        new Date('2026-08-30T09:00:00.000Z'),
    );

/**
 * Отчёт, который трогает ОБА потока: тип закрываемой задачи «hot» даёт
 * джоб ЗПР, отметка о проведённой презентации — джоб презентаций. Нужен,
 * чтобы проверить границу независимости потоков.
 */
const makeMixedCtx = () =>
    new EventReportContext(
        {
            domain: 'test.bitrix24.ru',
            operationId: 'op-4',
            currentTask: { eventType: 'hot' },
            presentation: { isPresentationDone: true },
            report: {
                resultStatus: 'result',
                workStatus: { current: { code: 'inJob' } },
            },
            plan: { isPlanned: false, isActive: false },
        } as never,
        makePortal() as never,
        {
            entityType: 'company',
            entityId: 7,
            company: { ID: '7' },
            lead: { ID: '5' },
            currentBaseDeal: { ID: '101' },
            currentPresDeal: null,
            currentTmcDeal: null,
            currentTmcFromPresentation: null,
            currentTask: { id: 555 },
        } as never,
        new Date('2026-08-30T09:00:00.000Z'),
    );

const DEALS = {
    baseDealId: null,
    newPlanPresDealId: null,
    newUnplannedPresDealId: null,
};

/** Ответ батча: команда создания задачи лежит во ВТОРОМ чанке. */
const BATCH_WITH_TASK = [
    { result: { update_company: true } },
    { result: { add_task: { task: { id: '900' } } } },
];

/**
 * Аргументы `QueueDispatcherService.dispatch` — типизированы явно, чтобы
 * проверки состава джоба не читались через `any` (правило проекта).
 */
type DispatchArgs = [
    queue: QueueNames,
    job: JobNames,
    data: { kind: string; planTaskId: number | null },
    jobId: string | undefined,
    opts: object,
];

interface QueueMock {
    dispatch: jest.Mock<Promise<void>, DispatchArgs>;
}

const makeQueue = (): QueueMock => ({
    dispatch: jest.fn<Promise<void>, DispatchArgs>().mockResolvedValue(),
});

/**
 * Загрузчик контекста анкет замокан целиком: чтение каталога и настроек —
 * ответственность QuestionnaireSmartContextLoader и его собственной спеки.
 * Ответов анкеты в этих отчётах нет, поэтому в бою он вернул бы тот же null.
 */
const makeQuestionnaireLoader = () => ({
    loadQuestionnaireSmartContext: jest.fn().mockResolvedValue(null),
});

const makeService = (queue: QueueMock) =>
    new EventReportPostFlowService(
        queue as never,
        makeQuestionnaireLoader() as never,
    );

const run = async (
    queue: QueueMock,
    batchResults: unknown[],
): Promise<void> => {
    await makeService(queue).dispatch({
        ctx: makeCtx(),
        deals: DEALS,
        batchResults: batchResults as never,
        socketId: 'socket-1',
    });
};

/** Перехваченная запись лога: текст плюс мета с telegram-флагом. */
interface DevLogRecord {
    message: unknown;
    meta: unknown;
}

/** Мета лога, из которой тест читает форс-флаг Telegram. */
const metaOf = (record: DevLogRecord): { telegram?: boolean } =>
    (record.meta ?? {}) as { telegram?: boolean };

describe('EventReportPostFlowService', () => {
    const devLogs: DevLogRecord[] = [];
    const warnLogs: DevLogRecord[] = [];

    beforeEach(() => {
        devLogs.length = 0;
        warnLogs.length = 0;
        // Логи в тесте нужны молчащими, но проверяемыми: часть из них
        // форсится в Telegram (`{ telegram: true }`), и именно состав
        // форс-веток мы и проверяем.
        jest.spyOn(Logger.prototype, 'log').mockImplementation(((
            message: unknown,
            meta: unknown,
        ): void => {
            devLogs.push({ message, meta });
        }) as never);
        jest.spyOn(Logger.prototype, 'warn').mockImplementation(((
            message: unknown,
            meta: unknown,
        ): void => {
            warnLogs.push({ message, meta });
        }) as never);
    });

    afterEach(() => jest.restoreAllMocks());

    it('два kind’а одного потока дают два dispatch’а с разными jobId', async () => {
        const queue = makeQueue();

        await run(queue, BATCH_WITH_TASK);

        expect(queue.dispatch).toHaveBeenCalledTimes(2);
        expect(queue.dispatch.mock.calls.map(call => call[3])).toEqual([
            'op-1:zpr:report',
            'op-1:zpr:plan',
        ]);
        expect(queue.dispatch.mock.calls[0][0]).toBe(
            QueueNames.EVENT_SALES_ZPR_FLOW,
        );
    });

    it('id план-задачи из ответа батча доезжает в оба джоба', async () => {
        const queue = makeQueue();

        await run(queue, BATCH_WITH_TASK);

        const planTaskIds = queue.dispatch.mock.calls.map(
            call => call[2].planTaskId,
        );
        expect(planTaskIds).toEqual([900, 900]);
    });

    it('плана в отчёте не было — planTaskId null, привязывать не к чему', async () => {
        const queue = makeQueue();

        await run(queue, [{ result: { update_company: true } }]);

        const planTaskIds = queue.dispatch.mock.calls.map(
            call => call[2].planTaskId,
        );
        expect(planTaskIds).toEqual([null, null]);
    });

    it('сбойный чанк без result не роняет постановку', async () => {
        const queue = makeQueue();

        await expect(
            run(queue, [{ error: 'QUERY_LIMIT_EXCEEDED' }, ...BATCH_WITH_TASK]),
        ).resolves.toBeUndefined();
        expect(queue.dispatch).toHaveBeenCalledTimes(2);
        expect(queue.dispatch.mock.calls[0][2].planTaskId).toBe(900);
    });

    it('упавшая постановка report-джоба обрывает поток: plan не уедет раньше отчёта', async () => {
        const queue = makeQueue();
        queue.dispatch.mockRejectedValueOnce(new Error('redis недоступен'));

        await expect(run(queue, BATCH_WITH_TASK)).resolves.toBeUndefined();
        // Порядок «report, потом plan» обязателен: поставить один plan
        // значило бы завести открытый элемент без отчёта по нему.
        expect(queue.dispatch).toHaveBeenCalledTimes(1);
        expect(queue.dispatch.mock.calls[0][3]).toBe('op-1:zpr:report');
        // Сорванная постановка — диагностика, её видно в канале.
        expect(warnLogs.some(record => metaOf(record).telegram === true)).toBe(
            true,
        );
    });

    it('сорванный поток ЗПР не мешает постановке джобов презентаций', async () => {
        const queue = makeQueue();
        // Падает только первый dispatch — он же единственный джоб ЗПР.
        queue.dispatch.mockRejectedValueOnce(new Error('redis недоступен'));

        await expect(
            makeService(queue).dispatch({
                ctx: makeMixedCtx(),
                deals: DEALS,
                batchResults: BATCH_WITH_TASK as never,
            }),
        ).resolves.toBeUndefined();

        expect(queue.dispatch.mock.calls.map(call => call[0])).toEqual([
            QueueNames.EVENT_SALES_ZPR_FLOW,
            QueueNames.EVENT_SALES_PRESENTATION_FLOW,
        ]);
    });

    it('сломанная раскладка одного потока не отменяет соседний и не роняет отчёт', async () => {
        const queue = makeQueue();
        // Спонтанная презентация: снимок анкеты лезет в поля портала, и
        // сломанный портал раньше уронил бы весь отчёт — батч-то уже ушёл.
        const ctx = new EventReportContext(
            {
                domain: 'test.bitrix24.ru',
                operationId: 'op-3',
                currentTask: { eventType: 'hot' },
                presentation: { isPresentationDone: true },
                report: {
                    resultStatus: 'result',
                    workStatus: { current: { code: 'inJob' } },
                },
                plan: { isPlanned: false, isActive: false },
            } as never,
            {
                ...makePortal(),
                getEntityFieldByCode: () => {
                    throw new Error('модель полей портала не собрана');
                },
            } as never,
            {
                entityType: 'company',
                entityId: 7,
                company: { ID: '7' },
                lead: { ID: '5' },
                currentBaseDeal: { ID: '101' },
                currentPresDeal: null,
                currentTmcDeal: null,
                currentTmcFromPresentation: null,
                currentTask: { id: 555 },
            } as never,
            new Date('2026-08-30T09:00:00.000Z'),
        );

        await expect(
            makeService(queue).dispatch({
                ctx,
                deals: DEALS,
                batchResults: BATCH_WITH_TASK as never,
            }),
        ).resolves.toBeUndefined();
        // ЗПР разложился, презентации — нет.
        expect(queue.dispatch).toHaveBeenCalledTimes(1);
        expect(queue.dispatch.mock.calls[0][0]).toBe(
            QueueNames.EVENT_SALES_ZPR_FLOW,
        );
    });

    it('один дев-лог на весь post-flow: состав джобов и id план-задачи', async () => {
        const queue = makeQueue();

        await run(queue, BATCH_WITH_TASK);

        expect(devLogs).toHaveLength(1);
        expect(devLogs[0].meta).toMatchObject({
            domain: 'test.bitrix24.ru',
            operationId: 'op-1',
            planTaskId: 900,
            kinds: ['zpr:report', 'zpr:plan'],
        });
    });

    it('штатный успешный путь в Telegram не форсится — канал под аварии', async () => {
        const queue = makeQueue();

        await run(queue, BATCH_WITH_TASK);

        // Ни одна запись рядового отчёта не должна вытеснять аварийные
        // алерты: транспорт режет 20 сообщений в минуту и лишнее дропает.
        expect(metaOf(devLogs[0]).telegram).toBeUndefined();
        expect(warnLogs.some(record => metaOf(record).telegram === true)).toBe(
            false,
        );
    });

    it('план есть, а planTaskId null — форс-запись в Telegram с доменом и operationId', async () => {
        const queue = makeQueue();

        // Батч без ответа add_task: ровно тот симптом, из-за которого
        // плановый элемент оставался без привязки к задаче.
        await run(queue, [{ result: { update_company: true } }]);

        const forced = warnLogs.filter(
            record => metaOf(record).telegram === true,
        );
        expect(forced).toHaveLength(1);
        expect(forced[0].meta).toMatchObject({
            telegram: true,
            domain: 'test.bitrix24.ru',
            operationId: 'op-1',
            kinds: ['zpr:report', 'zpr:plan'],
        });
        expect(String(forced[0].message)).toContain('test.bitrix24.ru');
        expect(String(forced[0].message)).toContain('op-1');
    });

    it('ни один поток отчёта не касается — ни очереди, ни лога', async () => {
        const queue = makeQueue();
        const ctx = new EventReportContext(
            {
                domain: 'test.bitrix24.ru',
                operationId: 'op-2',
                currentTask: { eventType: 'warm' },
                report: {
                    resultStatus: 'result',
                    workStatus: { current: { code: 'inJob' } },
                },
                plan: {
                    isPlanned: true,
                    isActive: true,
                    type: { current: { code: 'warm' } },
                },
            } as never,
            makePortal() as never,
            {
                entityType: 'company',
                entityId: 7,
                company: { ID: '7' },
                lead: null,
                currentBaseDeal: null,
                currentPresDeal: null,
                currentTmcDeal: null,
                currentTmcFromPresentation: null,
                currentTask: null,
            } as never,
            new Date('2026-08-30T09:00:00.000Z'),
        );

        await makeService(queue).dispatch({
            ctx,
            deals: DEALS,
            batchResults: BATCH_WITH_TASK as never,
        });

        expect(queue.dispatch).not.toHaveBeenCalled();
        expect(devLogs).toHaveLength(0);
    });
});
