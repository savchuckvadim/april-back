import { TelegramService } from '@lib/telegram/telegram.service';
import {
    annotateCallContext,
    CallEntity,
    runAsCallSource,
} from '@/core/call-context/call-context';
import { setProcessAppName } from '@/core/call-context/process-app-name';
import {
    runAsBackground,
    runAsInteractive,
} from '../../context/bitrix-call-context';
import { BitrixRateLimiterService } from '../../rate-limit/bitrix-rate-limiter.service';
import { isBitrixFailureReported } from '../../failure/bitrix-failure-record.util';
import { BitrixCore } from '../bitrix-core.service';
import { BITRIX_REQUEST_PROFILES } from '../bitrix-request-profile';
import { BxAuthType } from '../bx-auth-type.enum';

/**
 * Подпись тревог («Где», «Команды») и журнал окончательных сбоев
 * (meta.bitrixFailure) у одиночного вызова и запроса `batch`.
 * Поведение вызова (повторы, ошибки) — в bitrix-core.service.spec.
 */

const DOMAIN = 'garant.bitrix24.ru';

const httpError = (status: number, data: unknown = {}) =>
    Object.assign(new Error(`Request failed with status code ${status}`), {
        response: { status, data },
    });

const makeCore = (responses: unknown[]) => {
    const alert = jest.fn().mockResolvedValue(undefined);
    const core = new BitrixCore(
        { sendMessageAdminError: alert } as unknown as TelegramService,
        BxAuthType.HOOK,
        DOMAIN,
        null,
        'rest/1/key',
        {
            acquire: jest.fn().mockResolvedValue(undefined),
        } as unknown as BitrixRateLimiterService,
    );
    jest.spyOn(core.logger, 'warn').mockImplementation(() => undefined);
    const error = jest
        .spyOn(core.logger, 'error')
        .mockImplementation(() => undefined);
    const queue = [...responses];
    const post = jest.fn(() => {
        const next = queue.shift();
        return next instanceof Error
            ? Promise.reject(next)
            : Promise.resolve({ data: next });
    });
    (
        core as unknown as { axiosInstance: { post: typeof post } }
    ).axiosInstance = { post };
    return { core, alert, error };
};

/** meta второго аргумента logger.error (или undefined — строка без meta). */
const metaOf = (call: unknown[] | undefined): unknown => call?.[1];

const alertText = (alert: jest.Mock, n: number): string =>
    String((alert.mock.calls[n] as unknown[])[0]);

describe('BitrixCore: журнал сбоев и подпись тревог', () => {
    beforeEach(() => {
        jest.useFakeTimers();
        setProcessAppName('event-sales');
    });
    afterEach(() => {
        jest.useRealTimers();
        jest.restoreAllMocks();
        setProcessAppName('');
    });

    it('400 (повтора не будет): тревога с «Где», строка журнала kind=call с сущностью и контекстом', async () => {
        const { core, alert, error } = makeCore([
            httpError(400, { error: 'ACCESS_DENIED' }),
        ]);

        const failure = await runAsInteractive(
            'POST /api/event-sales/flow',
            () => {
                annotateCallContext({
                    operation: 'Отчёт «Звонки»',
                    entity: { type: 'deal', id: '26735' },
                    actor: { userId: 325 },
                });
                return core.request('crm.deal.update', { id: 26735 });
            },
        ).catch((e: unknown) => e);

        expect(alert).toHaveBeenCalledTimes(1);
        const [first, second, third] = alertText(alert, 0).split('\n');
        expect(first).toMatch(
            /^Bitrix API error \(crm\.deal\.update\) на garant/,
        );
        expect(second).toBe(
            'Где: event-sales · Отчёт «Звонки» · сделка 26735 · сотрудник 325 · POST /api/event-sales/flow',
        );
        expect(third).toBeUndefined();

        expect(error).toHaveBeenCalledTimes(1);
        expect(metaOf(error.mock.calls[0])).toEqual({
            domain: DOMAIN,
            bitrixFailure: {
                kind: 'call',
                domain: DOMAIN,
                method: 'crm.deal.update',
                write: true,
                entity: { label: 'сделка', id: '26735' },
                status: 400,
                error: 'Request failed with status code 400 · HTTP 400 · ACCESS_DENIED',
            },
            callContext: {
                source: 'POST /api/event-sales/flow',
                callClass: 'interactive',
                operation: 'Отчёт «Звонки»',
                entity: { type: 'deal', id: '26735' },
                actor: { userId: 325 },
                app: 'event-sales',
            },
        });
        expect(isBitrixFailureReported(failure)).toBe(true);
    });

    it('500 с успешным повтором: тревога подписана, но в журнал ничего', async () => {
        const { core, alert, error } = makeCore([
            httpError(500),
            { result: 1 },
        ]);

        const pending = runAsCallSource(
            'cron:xo-dispatch-rescue',
            'Крон: подстраховка ХО',
            () => core.request('crm.item.list', {}),
        );
        await jest.advanceTimersByTimeAsync(
            BITRIX_REQUEST_PROFILES.background.busyPauseMs,
        );
        await pending;

        expect(alertText(alert, 0)).toMatch(
            /^Попытка 1 из \d+, повтор через .*\nГде: event-sales · Крон: подстраховка ХО · cron:xo-dispatch-rescue$/,
        );
        expect(error).toHaveBeenCalledTimes(1);
        expect(metaOf(error.mock.calls[0])).toBeUndefined();
    });

    it('пачка: попытки исчерпаны — тревога со сводкой команд, в журнал одна строка kind=batch', async () => {
        const { core, alert, error } = makeCore([
            httpError(500),
            httpError(500),
        ]);
        const payload = {
            halt: 0,
            cmd: {
                set_deal: 'crm.deal.update?id=26735&fields[TITLE]=Иванов',
                kpi_1: 'lists.element.add?IBLOCK_ID=5&ELEMENT_CODE=a',
                kpi_2: 'lists.element.add?IBLOCK_ID=5&ELEMENT_CODE=b',
                read_task: 'tasks.task.get?taskId=1',
            },
        };

        const pending = runAsInteractive('queue:event-sales-flow', () =>
            core.request('batch', payload, 1),
        );
        const assertion = expect(pending).rejects.toMatchObject({
            response: { status: 500 },
        });
        await jest.advanceTimersByTimeAsync(
            BITRIX_REQUEST_PROFILES.interactive.busyPauseMs,
        );
        await assertion;

        expect(alert).toHaveBeenCalledTimes(2);
        const lines = alertText(alert, 1).split('\n');
        expect(lines[0]).toMatch(/^⚠️ ПОПЫТКИ ИСЧЕРПАНЫ \(2 из 2\)/);
        expect(lines[1]).toBe('Где: event-sales · queue:event-sales-flow');
        expect(lines[2]).toBe(
            'Команды (4, запись 3, чтение 1): строка списка ×2, сделка ×1, задача ×1 · ' +
                'ключи: set_deal, kpi_1, kpi_2, read_task',
        );
        // Промежуточная попытка — тоже с «Где» и «Команды».
        expect(alertText(alert, 0).split('\n')).toHaveLength(3);

        const metas = error.mock.calls.map(metaOf).filter(Boolean);
        expect(metas).toHaveLength(1);
        expect(metas[0]).toMatchObject({
            domain: DOMAIN,
            bitrixFailure: {
                kind: 'batch',
                method: 'batch',
                write: true,
                status: 500,
                commands: {
                    total: 4,
                    writes: 3,
                    summary: 'строка списка ×2, сделка ×1, задача ×1',
                    keys: ['set_deal', 'kpi_1', 'kpi_2', 'read_task'],
                },
            },
        });
    });

    it('ожидаемая ошибка (Not found у crm.deal.get): ни тревоги, ни журнала, но помечена', async () => {
        const { core, alert, error } = makeCore([
            httpError(400, { error_description: 'Not found' }),
        ]);

        const failure = await runAsBackground('cron', () =>
            core.request('crm.deal.get', { id: 5 }),
        ).catch((e: unknown) => e);

        expect(alert).not.toHaveBeenCalled();
        expect(error).not.toHaveBeenCalled();
        expect(isBitrixFailureReported(failure)).toBe(true);
    });

    it('подпись и журнал сломались — вызов отдаёт исходную ошибку, лог и тревога как раньше', async () => {
        const original = httpError(400, { error: 'ACCESS_DENIED' });
        const { core, alert, error } = makeCore([original]);
        const brokenEntity = Object.defineProperty({ id: '1' }, 'type', {
            enumerable: true,
            get: () => {
                throw new Error('подпись сломана');
            },
        }) as unknown as CallEntity;

        const failure = await runAsInteractive('POST /api/x', () => {
            annotateCallContext({ entity: brokenEntity });
            return core.request('crm.deal.update', { id: 1 });
        }).catch((e: unknown) => e);

        expect(failure).toBe(original);
        expect(error).toHaveBeenCalledTimes(1);
        expect(metaOf(error.mock.calls[0])).toBeUndefined();
        expect(alert).toHaveBeenCalledTimes(1);
        expect(alertText(alert, 0)).toMatch(
            /^Bitrix API error \(crm\.deal\.update\) на garant[^\n]*$/,
        );
    });

    it('без разметки: «Где» — имя приложения и unmarked', async () => {
        const { core, alert } = makeCore([httpError(400)]);

        await core.request('crm.deal.list', {}).catch(() => undefined);

        expect(alertText(alert, 0).split('\n')[1]).toBe(
            'Где: event-sales · unmarked',
        );
    });
});
