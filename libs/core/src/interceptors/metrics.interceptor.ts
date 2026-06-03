import {
    CallHandler,
    ExecutionContext,
    Injectable,
    NestInterceptor,
} from '@nestjs/common';
import { Counter } from 'prom-client';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import { tap } from 'rxjs/operators';
import { Request, Response } from 'express';

@Injectable()
export class MetricsInterceptor implements NestInterceptor {
    constructor(
        @InjectMetric('http_requests_total')
        private readonly counter: Counter<string>,
    ) {}

    intercept(context: ExecutionContext, next: CallHandler) {
        const req = context.switchToHttp().getRequest<Request>();

        return next.handle().pipe(
            tap(() => {
                const res = context.switchToHttp().getResponse<Response>();
                this.counter
                    .labels(req.method, req.url, String(res.statusCode))
                    .inc();
            }),
        );
    }
}
