import { CallHandler, ExecutionContext } from '@nestjs/common';
import { Request, Response } from 'express';
import { defer, lastValueFrom, throwError } from 'rxjs';
import { BackgroundCallsInterceptor } from '../background-calls.interceptor';
import {
    CALL_CLASS,
    getCallContext,
    runAsBackground,
    runAsInteractive,
} from '../call-context';
import { interactiveCallContextMiddleware } from '../call-context.middleware';

describe('класс работы в асинхронном контексте', () => {
    it('без разметки вызов считается фоновым', () => {
        expect(getCallContext()).toEqual({
            callClass: CALL_CLASS.background,
            source: 'unmarked',
        });
    });

    it('класс виден внутри работы, в том числе после await', async () => {
        const seen = await runAsInteractive(
            'POST /api/duplicates/details',
            async () => {
                await Promise.resolve();
                await new Promise(resolve => setImmediate(resolve));
                return getCallContext();
            },
        );

        expect(seen).toEqual({
            callClass: CALL_CLASS.interactive,
            source: 'POST /api/duplicates/details',
        });
    });

    it('параллельные работы не видят класс друг друга', async () => {
        const [manager, cron] = await Promise.all([
            runAsInteractive('route', async () => {
                await new Promise(resolve => setTimeout(resolve, 5));
                return getCallContext().callClass;
            }),
            runAsBackground('cron', async () => {
                await Promise.resolve();
                return getCallContext().callClass;
            }),
        ]);

        expect(manager).toBe(CALL_CLASS.interactive);
        expect(cron).toBe(CALL_CLASS.background);
    });

    it('класс можно понизить внутри запроса — вебхук робота в HTTP', () => {
        const inner = runAsInteractive('route', () =>
            runAsBackground('hook', () => getCallContext()),
        );

        expect(inner).toEqual({
            callClass: CALL_CLASS.background,
            source: 'hook',
        });
    });

    it('после работы контекст не остаётся', () => {
        runAsInteractive('route', () => undefined);

        expect(getCallContext().callClass).toBe(CALL_CLASS.background);
    });
});

describe('HTTP-запрос — интерактив', () => {
    it('обработчик запроса видит интерактивный класс и свой маршрут', () => {
        let seen: ReturnType<typeof getCallContext> | null = null;

        interactiveCallContextMiddleware(
            { method: 'POST', path: '/api/duplicates/details' } as Request,
            {} as Response,
            () => {
                seen = getCallContext();
            },
        );

        expect(seen).toEqual({
            callClass: CALL_CLASS.interactive,
            source: 'POST /api/duplicates/details',
        });
    });

    it('фон, запущенный из запроса без ожидания, наследует класс — и обязан понизить его сам', async () => {
        const classes: string[] = [];
        const detached: Promise<void>[] = [];

        interactiveCallContextMiddleware(
            { method: 'POST', path: '/api/deal-audit/run-now' } as Request,
            {} as Response,
            () => {
                // Забыли понизить — работа осталась интерактивной.
                detached.push(
                    Promise.resolve().then(() => {
                        classes.push(getCallContext().callClass);
                    }),
                );
                // Правильно: фон помечает себя сам.
                detached.push(
                    runAsBackground('deal-audit', async () => {
                        await Promise.resolve();
                        classes.push(getCallContext().callClass);
                    }),
                );
            },
        );
        await Promise.all(detached);

        expect(classes.sort()).toEqual([
            CALL_CLASS.background,
            CALL_CLASS.interactive,
        ]);
    });
});

describe('BackgroundCallsInterceptor', () => {
    const httpContext = (method: string, path: string): ExecutionContext =>
        ({
            switchToHttp: () => ({ getRequest: () => ({ method, path }) }),
        }) as unknown as ExecutionContext;

    it('обработчик вебхука выполняется фоновым, хотя запрос пришёл по HTTP', async () => {
        const interceptor = new BackgroundCallsInterceptor();
        let seen: ReturnType<typeof getCallContext> | null = null;
        // Обработчик маршрута запускается при подписке — как в Nest.
        const handler: CallHandler = {
            handle: () =>
                defer(async () => {
                    await Promise.resolve();
                    seen = getCallContext();
                    return 'ok';
                }),
        };

        const result = await runAsInteractive(
            'POST /api/event-sales-hook',
            () =>
                lastValueFrom(
                    interceptor.intercept(
                        httpContext('POST', '/api/event-sales-hook/cold-call'),
                        handler,
                    ),
                ),
        );

        expect(result).toBe('ok');
        expect(seen).toEqual({
            callClass: CALL_CLASS.background,
            source: 'POST /api/event-sales-hook/cold-call',
        });
    });

    it('ошибка обработчика доходит до вызывающего', async () => {
        const interceptor = new BackgroundCallsInterceptor();
        const handler: CallHandler = {
            handle: () => throwError(() => new Error('сбой хука')),
        };

        await expect(
            lastValueFrom(
                interceptor.intercept(httpContext('POST', '/api/x'), handler),
            ),
        ).rejects.toThrow('сбой хука');
    });
});
