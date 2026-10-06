import { ConflictException } from '@nestjs/common';
import { RedisService } from '@lib/core/redis/redis.service';
import { EventSalesFlowDto } from '../dto/event-sale-flow/event-sales-flow.dto';
import {
    EnumEventFlowStatus,
    EventFlowOperationDto,
} from '../dto/response/event-flow-operation.dto';
import {
    EnumEventItemResultType,
    EnumWorkStatusCode,
} from '../types/report-types';
import {
    EVENT_FLOW_SUBJECT_CLAIM_TTL_SECONDS,
    EVENT_FLOW_SUBJECT_DONE_TTL_SECONDS,
} from '../constants/event-flow.const';
import { EventFlowStatusService } from '../services/status/event-flow-status.service';
import {
    EVENT_FLOW_SETTLE,
    EventFlowDuplicateGuardService,
} from '../services/flow-guard/event-flow-duplicate-guard.service';

/** Redis в памяти: ровно те команды, что зовёт гард. */
class FakeRedisClient {
    readonly values = new Map<string, string>();
    readonly ttl = new Map<string, number>();
    failing = false;

    set(
        key: string,
        value: string,
        _ex: 'EX',
        ttl: number,
        mode?: 'NX',
    ): Promise<'OK' | null> {
        if (this.failing) return Promise.reject(new Error('redis down'));
        if (mode === 'NX' && this.values.has(key)) return Promise.resolve(null);
        this.values.set(key, value);
        this.ttl.set(key, ttl);
        return Promise.resolve('OK');
    }

    get(key: string): Promise<string | null> {
        if (this.failing) return Promise.reject(new Error('redis down'));
        return Promise.resolve(this.values.get(key) ?? null);
    }

    eval(
        script: string,
        _keys: number,
        key: string,
        owner: string,
        ttl?: string,
    ): Promise<number> {
        if (this.failing) return Promise.reject(new Error('redis down'));
        if (this.values.get(key) !== owner) return Promise.resolve(0);
        if (script.includes('EXPIRE')) {
            this.ttl.set(key, Number(ttl));
        } else {
            this.values.delete(key);
            this.ttl.delete(key);
        }
        return Promise.resolve(1);
    }
}

const KEY = 'event-sales-flow:subject:garant.bitrix24.ru:task:769671';

const taskReport = {
    domain: 'garant.bitrix24.ru',
    currentTask: { id: 769671 },
    report: {
        resultStatus: EnumEventItemResultType.RESULT,
        workStatus: { current: { code: EnumWorkStatusCode.fail } },
        isNoCall: false,
    },
    plan: { isActive: false },
    context: { dealId: 27537 },
} as unknown as EventSalesFlowDto;

const operation = (
    operationId: string,
    status: EnumEventFlowStatus,
): EventFlowOperationDto => ({
    operationId,
    status,
    queuedAt: new Date().toISOString(),
    startedAt: null,
    finishedAt: null,
    result: null,
    error: null,
});

const setup = (statuses: Record<string, EventFlowOperationDto> = {}) => {
    const client = new FakeRedisClient();
    const redis = { getClient: () => client } as unknown as RedisService;
    const status = {
        get: (_domain: string, operationId: string) =>
            Promise.resolve(statuses[operationId] ?? null),
    } as unknown as EventFlowStatusService;
    return { client, guard: new EventFlowDuplicateGuardService(redis, status) };
};

describe('EventFlowDuplicateGuardService: второй отчёт по тому же делу', () => {
    it('первый отчёт занимает дело на время очереди', async () => {
        const { client, guard } = setup();

        await guard.claim(taskReport, 'op-1');

        expect(client.values.get(KEY)).toBe('op-1');
        expect(client.ttl.get(KEY)).toBe(EVENT_FLOW_SUBJECT_CLAIM_TTL_SECONDS);
    });

    it('пока первый идёт — второй получает 409 с понятным текстом', async () => {
        const { guard } = setup({
            'op-1': operation('op-1', EnumEventFlowStatus.RUNNING),
        });
        await guard.claim(taskReport, 'op-1');

        await expect(guard.claim(taskReport, 'op-2')).rejects.toThrow(
            new ConflictException(
                'Отчёт по этому делу уже отправляется — дождитесь, список ' +
                    'обновится сам. Второй не записан',
            ),
        );
    });

    it('первый выполнен — замок живёт ещё 10 минут, второй отвергнут', async () => {
        const statuses = {
            'op-1': operation('op-1', EnumEventFlowStatus.DONE),
        };
        const { client, guard } = setup(statuses);
        await guard.claim(taskReport, 'op-1');

        await guard.settle(taskReport, 'op-1', EVENT_FLOW_SETTLE.done);

        expect(client.ttl.get(KEY)).toBe(EVENT_FLOW_SUBJECT_DONE_TTL_SECONDS);
        await expect(guard.claim(taskReport, 'op-2')).rejects.toBeInstanceOf(
            ConflictException,
        );
    });

    it('первый упал — дело свободно, повторная отправка проходит', async () => {
        const { client, guard } = setup();
        await guard.claim(taskReport, 'op-1');

        await guard.settle(taskReport, 'op-1', EVENT_FLOW_SETTLE.failed);
        await guard.claim(taskReport, 'op-2');

        expect(client.values.get(KEY)).toBe('op-2');
    });

    it('замок упавшей операции, которую не сняли, перехватывается', async () => {
        const { client, guard } = setup({
            'op-1': operation('op-1', EnumEventFlowStatus.FAILED),
        });
        await guard.claim(taskReport, 'op-1');

        await guard.claim(taskReport, 'op-2');

        expect(client.values.get(KEY)).toBe('op-2');
    });

    it('чужой замок settle не трогает', async () => {
        const { client, guard } = setup();
        await guard.claim(taskReport, 'op-1');

        await guard.settle(taskReport, 'op-2', EVENT_FLOW_SETTLE.failed);

        expect(client.values.get(KEY)).toBe('op-1');
    });

    it('Redis недоступен — отчёт не блокируем', async () => {
        const { client, guard } = setup();
        client.failing = true;

        await expect(guard.claim(taskReport, 'op-1')).resolves.toBeUndefined();
        await expect(
            guard.settle(taskReport, 'op-1', EVENT_FLOW_SETTLE.done),
        ).resolves.toBeUndefined();
    });

    it('у переноса предмета нет — замок не ставится', async () => {
        const { client, guard } = setup();
        const move = {
            ...taskReport,
            report: {
                resultStatus: EnumEventItemResultType.NORESULT,
                workStatus: { current: { code: EnumWorkStatusCode.inJob } },
                isNoCall: false,
            },
            plan: { isActive: true },
        } as unknown as EventSalesFlowDto;

        await guard.claim(move, 'op-1');

        expect(client.values.size).toBe(0);
    });
});
