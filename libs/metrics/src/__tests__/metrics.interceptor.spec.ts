import {
    CallHandler,
    ExecutionContext,
    NotFoundException,
} from '@nestjs/common';
import { lastValueFrom, of, throwError } from 'rxjs';
import { MetricsInterceptor } from '../metrics.interceptor';

/** Фейк Counter/Histogram: записывает вызовы labels().inc()/observe(). */
class FakeMetric {
    public readonly calls: { labels: string[]; value?: number }[] = [];

    labels(...labels: string[]) {
        return {
            inc: () => this.calls.push({ labels }),
            observe: (value: number) => this.calls.push({ labels, value }),
        };
    }
}

interface FakeRequest {
    method: string;
    url?: string;
    originalUrl?: string;
    baseUrl?: string;
    route?: { path?: string };
}

const makeContext = (
    req: FakeRequest,
    statusCode = 200,
    type: 'http' | 'rpc' = 'http',
): ExecutionContext =>
    ({
        getType: () => type,
        switchToHttp: () => ({
            getRequest: () => req,
            getResponse: () => ({ statusCode }),
        }),
    }) as unknown as ExecutionContext;

const okHandler: CallHandler = { handle: () => of('ok') };

const makeInterceptor = () => {
    const requests = new FakeMetric();
    const errors = new FakeMetric();
    const duration = new FakeMetric();
    const interceptor = new MetricsInterceptor(
        requests as never,
        errors as never,
        duration as never,
    );
    return { interceptor, requests, errors, duration };
};

describe('MetricsInterceptor', () => {
    it('считает запрос с метками method/route/status и меряет длительность', async () => {
        const { interceptor, requests, duration } = makeInterceptor();
        const ctx = makeContext({
            method: 'GET',
            baseUrl: '/api/deal',
            route: { path: '/:id' },
            originalUrl: '/api/deal/42?x=1',
        });

        await lastValueFrom(interceptor.intercept(ctx, okHandler));

        expect(requests.calls).toEqual([
            { labels: ['GET', '/api/deal/:id', '200'] },
        ]);
        expect(duration.calls).toHaveLength(1);
        expect(duration.calls[0].labels).toEqual(['GET', '/api/deal/:id']);
        expect(duration.calls[0].value).toBeGreaterThanOrEqual(0);
    });

    it('в метку идёт шаблон роута, а не реальный URL (кардинальность)', async () => {
        const { interceptor, requests } = makeInterceptor();
        for (const id of [1, 2, 3]) {
            await lastValueFrom(
                interceptor.intercept(
                    makeContext({
                        method: 'GET',
                        baseUrl: '/api/deal',
                        route: { path: '/:id' },
                        originalUrl: `/api/deal/${id}`,
                    }),
                    okHandler,
                ),
            );
        }
        const uniqueRoutes = new Set(requests.calls.map(c => c.labels[1]));
        expect(uniqueRoutes).toEqual(new Set(['/api/deal/:id']));
    });

    it('без route (404) берётся путь без query-строки', async () => {
        const { interceptor, requests } = makeInterceptor();
        const ctx = makeContext(
            { method: 'GET', originalUrl: '/api/unknown?token=secret' },
            404,
        );

        await lastValueFrom(interceptor.intercept(ctx, okHandler));

        expect(requests.calls).toEqual([
            { labels: ['GET', '/api/unknown', '404'] },
        ]);
    });

    it('эндпоинт /metrics не учитывается в метриках', async () => {
        const { interceptor, requests, duration } = makeInterceptor();
        const ctx = makeContext({
            method: 'GET',
            baseUrl: '/api',
            route: { path: '/metrics' },
        });

        await lastValueFrom(interceptor.intercept(ctx, okHandler));

        expect(requests.calls).toHaveLength(0);
        expect(duration.calls).toHaveLength(0);
    });

    it('HttpException: инкремент ошибок + счётчик со статусом исключения', async () => {
        const { interceptor, requests, errors } = makeInterceptor();
        const ctx = makeContext({
            method: 'GET',
            baseUrl: '/api/deal',
            route: { path: '/:id' },
        });
        const failing: CallHandler = {
            handle: () => throwError(() => new NotFoundException()),
        };

        await expect(
            lastValueFrom(interceptor.intercept(ctx, failing)),
        ).rejects.toBeInstanceOf(NotFoundException);

        expect(errors.calls).toEqual([{ labels: ['GET', '/api/deal/:id'] }]);
        expect(requests.calls).toEqual([
            { labels: ['GET', '/api/deal/:id', '404'] },
        ]);
    });

    it('не-HTTP исключение считается как 500', async () => {
        const { interceptor, requests, errors } = makeInterceptor();
        const ctx = makeContext({ method: 'POST', originalUrl: '/api/x' });
        const failing: CallHandler = {
            handle: () => throwError(() => new Error('boom')),
        };

        await expect(
            lastValueFrom(interceptor.intercept(ctx, failing)),
        ).rejects.toThrow('boom');

        expect(errors.calls).toHaveLength(1);
        expect(requests.calls[0].labels[2]).toBe('500');
    });

    it('не-HTTP контекст (ws/rpc) пропускается без метрик', async () => {
        const { interceptor, requests } = makeInterceptor();
        const ctx = makeContext({ method: 'GET' }, 200, 'rpc');

        await lastValueFrom(interceptor.intercept(ctx, okHandler));

        expect(requests.calls).toHaveLength(0);
    });
});
