import { Job } from 'bull';
import { WsService } from '@/core/ws';
import { SideFlowGuardService } from '../../shared/side-flow';
import { PresentationFlowProcessor } from '../presentation-flow.processor';
import { PresentationFlowService } from '../presentation-flow.service';
import { PresentationFlowJobData } from '../dto/presentation-flow-job.dto';
import { PresentationFlowResult } from '../constants/presentation-flow.const';

/**
 * Воркер сайд-очереди презентаций.
 *
 * Главное, что здесь проверяется, — ПОВТОРНАЯ ДОСТАВКА. Bull доставляет
 * джоб как минимум один раз: упади воркер после записи в Битрикс, и
 * stalled-чекер отдаст тот же джоб заново. Без гейта закрывающий джоб не
 * нашёл бы уже закрытый элемент и завёл бы ВТОРОЙ, спонтанный — с копией
 * ответов анкеты внутри.
 *
 * Отсюда и порядок отметки: она ставится ДО работы и лишь подтверждается
 * исходом. Отметка ПОСЛЕ записи оставляла бы окно ровно на тот сценарий,
 * от которого гейт заведён, — он проверяется отдельным тестом.
 */
const keyOf = (ref: {
    flow: string;
    operationId?: string;
    kind: string;
}): string => `${ref.flow}:${ref.operationId}:${ref.kind}`;

const makeHarness = (over?: {
    result?: PresentationFlowResult;
    remembered?: Record<string, unknown> | null;
    /** Прогон падает: 'before' — до записи в Битрикс, 'after' — после неё. */
    crash?: 'before' | 'after';
}) => {
    const handled: PresentationFlowJobData[] = [];
    /** «Элементы», записанные в Битрикс: второй такой и есть дубль. */
    const written: number[] = [];
    const sent: Array<{ socketId: string; payload: unknown }> = [];
    const stored = new Map<string, unknown>();
    if (over?.remembered) {
        stored.set('pres-flow:op-1:report', over.remembered);
    }

    /** Какой была отметка В МОМЕНТ обращения к Битриксу. */
    const marksAtCall: unknown[] = [];

    const service = {
        handle: (job: PresentationFlowJobData) => {
            handled.push(job);
            marksAtCall.push(stored.get('pres-flow:op-1:report'));
            if (over?.crash === 'before') {
                return Promise.reject(new Error('битрикс лёг'));
            }
            written.push(601);
            /*
             * Воркер оборвался ПОСЛЕ записи. В проде процесс тут просто
             * умирает, и подтверждения отметки не случается — состояние
             * кэша получается ровно то же, что и здесь.
             */
            if (over?.crash === 'after') {
                return Promise.reject(new Error('воркер оборвался'));
            }
            return Promise.resolve(
                over?.result ?? {
                    action: 'closed',
                    elementId: 601,
                },
            );
        },
    } as unknown as PresentationFlowService;

    const ws = {
        sendToClient: (socketId: string, payload: unknown) => {
            sent.push({ socketId, payload });
        },
    } as unknown as WsService;

    // Копия гейта в памяти: отметка живёт между доставками одного джоба.
    const guard = {
        recall: (ref: { flow: string; operationId?: string; kind: string }) =>
            Promise.resolve(
                ref.operationId ? (stored.get(keyOf(ref)) ?? null) : null,
            ),
        begin: (ref: { flow: string; operationId?: string; kind: string }) => {
            if (ref.operationId) {
                stored.set(keyOf(ref), {
                    status: 'started',
                    action: null,
                    elementId: null,
                    at: '2026-08-29T09:00:00.000Z',
                });
            }
            return Promise.resolve();
        },
        complete: (
            ref: { flow: string; operationId?: string; kind: string },
            outcome: { action: string; elementId: number | null },
        ) => {
            if (ref.operationId) {
                stored.set(keyOf(ref), {
                    status: 'done',
                    ...outcome,
                    at: '2026-08-29T09:00:01.000Z',
                });
            }
            return Promise.resolve();
        },
    } as unknown as SideFlowGuardService;

    const processor = new PresentationFlowProcessor(service, ws, guard);
    const silence = (level: 'warn' | 'error') =>
        jest
            .spyOn(processor['logger'], level)
            .mockImplementation(() => undefined);

    return {
        processor,
        handled,
        written,
        sent,
        stored,
        marksAtCall,
        silence,
    };
};

const job = (over?: Partial<PresentationFlowJobData>) =>
    ({
        id: 42,
        data: {
            domain: 'x.bitrix24.ru',
            operationId: 'op-1',
            socketId: 'sock-1',
            kind: 'report',
            ...over,
        },
    }) as unknown as Job<PresentationFlowJobData>;

const doneMark = (over?: Record<string, unknown>) => ({
    status: 'done',
    action: 'closed',
    elementId: 601,
    at: '2026-08-28T10:00:00.000Z',
    ...over,
});

describe('PresentationFlowProcessor', () => {
    it('первый прогон: работа выполняется, исход уходит клиенту и в отметку', async () => {
        const { processor, handled, sent, stored } = makeHarness();
        await processor.handle(job());

        expect(handled).toHaveLength(1);
        expect(sent[0].socketId).toBe('sock-1');
        expect(sent[0].payload).toMatchObject({
            data: { action: 'closed', elementId: 601, kind: 'report' },
        });
        expect(stored.get('pres-flow:op-1:report')).toMatchObject({
            status: 'done',
            action: 'closed',
            elementId: 601,
        });
    });

    it('отметка занимается ДО обращения к Битриксу', async () => {
        const { processor, marksAtCall, stored } = makeHarness();
        await processor.handle(job());

        // Именно в этом суть починки: к моменту записи отметка уже стоит.
        expect(marksAtCall[0]).toMatchObject({ status: 'started' });
        // А исходом она лишь подтверждается.
        expect(stored.get('pres-flow:op-1:report')).toMatchObject({
            status: 'done',
        });
    });

    it('повторная доставка: Битрикс не трогаем, клиенту тот же исход', async () => {
        const { processor, handled, sent, silence } = makeHarness({
            remembered: doneMark(),
        });
        silence('warn');
        await processor.handle(job());

        // Ни одного обращения к потоку — второго элемента не появится.
        expect(handled).toHaveLength(0);
        // Фронт при этом не должен заметить разницы.
        expect(sent[0].payload).toMatchObject({
            data: { action: 'closed', elementId: 601 },
        });
    });

    /*
     * Тот самый сценарий из докстринга гейта: запись в Битрикс прошла,
     * воркер умер, stalled-чекер отдал джоб заново. Второй записи быть
     * не должно — иначе у клиента два элемента, и во втором копия
     * ответов менеджера.
     */
    it('падение ПОСЛЕ записи в Битрикс: повтор второй элемент не заводит', async () => {
        const { processor, handled, written, silence } = makeHarness({
            crash: 'after',
        });
        silence('error');

        await processor.handle(job());
        await processor.handle(job());

        expect(handled).toHaveLength(1);
        expect(written).toEqual([601]);
    });

    it('повтор незавершённого прогона объясняет, что проверить руками', async () => {
        const { processor, silence } = makeHarness({ crash: 'after' });
        const error = silence('error');

        await processor.handle(job());
        await processor.handle(job());

        const message = String(
            error.mock.calls[error.mock.calls.length - 1][0],
        );
        expect(message).toContain('исход не подтвердил');
        expect(message).toContain('Битрикс НЕ трогаем');
        expect(message).toContain('x.bitrix24.ru');
    });

    /*
     * Обратная сторона того же правила, и она осознанная: прогон,
     * оборвавшийся ДО записи, повтором не переигрывается. Потерянный
     * элемент виден строкой в логе и восстановим руками, тихий дубль —
     * нет.
     */
    it('прогон, оборвавшийся до записи, повтор не переигрывает', async () => {
        const { processor, handled, written, silence } = makeHarness({
            crash: 'before',
        });
        silence('error');

        await processor.handle(job());
        await processor.handle(job());

        expect(handled).toHaveLength(1);
        expect(written).toHaveLength(0);
    });

    it('план и отчёт одной операции — РАЗНЫЕ отметки', async () => {
        const { processor, handled, silence } = makeHarness({
            remembered: doneMark(),
        });
        silence('warn');
        // Отметка стоит на report; plan-джоб той же операции обязан пройти.
        await processor.handle(job({ kind: 'plan' }));

        expect(handled).toHaveLength(1);
    });

    it('джоб без operationId (легаси) гейт не трогает', async () => {
        const { processor, handled, stored } = makeHarness();
        await processor.handle(job({ operationId: undefined }));

        expect(handled).toHaveLength(1);
        expect(stored.size).toBe(0);
    });

    it('пропуск (смарт не установлен) событием не является', async () => {
        const { processor, sent } = makeHarness({
            result: { action: 'skipped', elementId: null },
        });
        await processor.handle(job());

        expect(sent).toHaveLength(0);
    });

    it('неузнаваемый исход отметки события не выдумывает', async () => {
        const { processor, sent, silence } = makeHarness({
            remembered: doneMark({ action: 'что-то из другого деплоя' }),
        });
        silence('warn');
        await processor.handle(job());

        expect(sent).toHaveLength(0);
    });
});
