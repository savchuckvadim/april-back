import {
    CallHandler,
    ExecutionContext,
    HttpException,
    Injectable,
    NestInterceptor,
} from '@nestjs/common';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import { Request, Response } from 'express';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Counter, Histogram } from 'prom-client';
import {
    HTTP_REQUEST_DURATION_SECONDS,
    HTTP_REQUESTS_ERRORS_TOTAL,
    HTTP_REQUESTS_TOTAL,
} from './metrics.constants';

const NS_IN_SECOND = 1e9;

/**
 * Глобальный интерсептор HTTP-метрик: счётчик запросов (метки
 * method/route/status), счётчик ошибок и гистограмма длительности.
 *
 * В метку идёт ШАБЛОН роута ('/api/deal/:id'), а не реальный URL —
 * иначе каждый id порождал бы новый временной ряд (кардинальность
 * взорвала бы Prometheus). Сам эндпоинт /metrics не учитывается.
 */
@Injectable()
export class MetricsInterceptor implements NestInterceptor {
    constructor(
        @InjectMetric(HTTP_REQUESTS_TOTAL)
        private readonly requests: Counter<string>,
        @InjectMetric(HTTP_REQUESTS_ERRORS_TOTAL)
        private readonly errors: Counter<string>,
        @InjectMetric(HTTP_REQUEST_DURATION_SECONDS)
        private readonly duration: Histogram<string>,
    ) {}

    intercept(
        context: ExecutionContext,
        next: CallHandler,
    ): Observable<unknown> {
        if (context.getType() !== 'http') {
            return next.handle();
        }
        const req = context.switchToHttp().getRequest<Request>();
        const route = MetricsInterceptor.routeOf(req);
        if (route.endsWith('/metrics')) {
            return next.handle();
        }
        const startedAt = process.hrtime.bigint();

        return next.handle().pipe(
            tap({
                next: () => {
                    const res = context.switchToHttp().getResponse<Response>();
                    this.observe(
                        req.method,
                        route,
                        String(res.statusCode),
                        startedAt,
                    );
                },
                error: (error: unknown) => {
                    const status =
                        error instanceof HttpException
                            ? String(error.getStatus())
                            : '500';
                    this.errors.labels(req.method, route).inc();
                    this.observe(req.method, route, status, startedAt);
                },
            }),
        );
    }

    private observe(
        method: string,
        route: string,
        status: string,
        startedAt: bigint,
    ): void {
        const seconds =
            Number(process.hrtime.bigint() - startedAt) / NS_IN_SECOND;
        this.requests.labels(method, route, status).inc();
        this.duration.labels(method, route).observe(seconds);
    }

    /** Шаблон роута ('/api/deal/:id'); для 404 и т.п. — путь без query. */
    private static routeOf(req: Request): string {
        const route = (req as { route?: { path?: string } }).route?.path;
        if (route) {
            return `${req.baseUrl ?? ''}${route}`;
        }
        const raw = req.originalUrl ?? req.url ?? '';
        return raw.split('?')[0];
    }
}
