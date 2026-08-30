import { Job } from 'bull';
import { WsService } from '@/core/ws';
import { SideFlowGuardService } from '../../shared/side-flow';
import { ZprFlowProcessor } from '../zpr-flow.processor';
import { ZprFlowUseCase } from '../use-cases/zpr-flow.use-case';
import { ZprFlowJobData } from '../dto/zpr-flow-job.dto';
import { ZprFlowResult } from '../constants/zpr-flow.const';

/**
 * Воркер сайд-очереди ЗПР — зеркало презентационного, и гейт повторной
 * доставки у них общий (SideFlowGuardService). Проверяем и то, что ключ
 * отметки СВОЙ (две очереди не должны гасить джобы друг друга), и то, что
 * порядок отметки у зеркала такой же: занять до работы, подтвердить
 * исходом — иначе падение между записью и отметкой давало бы дубль.
 */
const keyOf = (ref: {
    flow: string;
    operationId?: string;
    kind: string;
}): string => `${ref.flow}:${ref.operationId}:${ref.kind}`;

const makeHarness = (over?: {
    result?: ZprFlowResult;
    stored?: Map<string, unknown>;
    /** Прогон падает: 'before' — до записи в Битрикс, 'after' — после неё. */
    crash?: 'before' | 'after';
}) => {
    const handled: ZprFlowJobData[] = [];
    /** «Элементы», записанные в Битрикс: второй такой и есть дубль. */
    const written: number[] = [];
    const sent: Array<{ socketId: string; payload: unknown }> = [];
    const stored = over?.stored ?? new Map<string, unknown>();

    const service = {
        handle: (job: ZprFlowJobData) => {
            handled.push(job);
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
                over?.result ?? { action: 'closed', elementId: 601 },
            );
        },
    } as unknown as ZprFlowUseCase;

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

    const processor = new ZprFlowProcessor(service, ws, guard);
    const silence = (level: 'warn' | 'error') =>
        jest
            .spyOn(processor['logger'], level)
            .mockImplementation(() => undefined);

    return { processor, handled, written, sent, stored, silence };
};

const job = (over?: Partial<ZprFlowJobData>) =>
    ({
        id: 7,
        data: {
            domain: 'x.bitrix24.ru',
            operationId: 'op-1',
            socketId: 'sock-1',
            kind: 'report',
            ...over,
        },
    }) as unknown as Job<ZprFlowJobData>;

describe('ZprFlowProcessor', () => {
    it('первый прогон: работа выполняется и отметка ставится', async () => {
        const { processor, handled, stored } = makeHarness();
        await processor.handle(job());

        expect(handled).toHaveLength(1);
        expect(stored.get('zpr-flow:op-1:report')).toMatchObject({
            status: 'done',
            action: 'closed',
            elementId: 601,
        });
    });

    it('повторная доставка: Битрикс не трогаем, клиенту тот же исход', async () => {
        const stored = new Map<string, unknown>([
            [
                'zpr-flow:op-1:report',
                {
                    status: 'done',
                    action: 'moved',
                    elementId: 601,
                    at: '2026-08-28T10:00:00.000Z',
                },
            ],
        ]);
        const { processor, handled, sent, silence } = makeHarness({ stored });
        silence('warn');
        await processor.handle(job());

        expect(handled).toHaveLength(0);
        expect(sent[0].payload).toMatchObject({
            data: { action: 'moved', elementId: 601 },
        });
    });

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

    it('отметка соседней очереди этот джоб не гасит', async () => {
        const stored = new Map<string, unknown>([
            [
                'pres-flow:op-1:report',
                {
                    status: 'done',
                    action: 'closed',
                    elementId: 999,
                    at: '2026-08-28T10:00:00.000Z',
                },
            ],
        ]);
        const { processor, handled } = makeHarness({ stored });
        await processor.handle(job());

        expect(handled).toHaveLength(1);
    });
});
