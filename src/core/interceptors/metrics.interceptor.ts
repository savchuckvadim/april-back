import {
    CallHandler,
    ExecutionContext,
    Injectable,
    NestInterceptor,
  } from '@nestjs/common';
  import { Counter } from 'prom-client';
  import { InjectMetric } from '@willsoto/nestjs-prometheus';
  import { tap } from 'rxjs/operators';
  
  @Injectable()
  export class MetricsInterceptor implements NestInterceptor {
    constructor(
      @InjectMetric('http_requests_total')
      private readonly counter: Counter<string>,
    ) {}
  
    intercept(context: ExecutionContext, next: CallHandler) {
      const req = context.switchToHttp().getRequest();



      
      return next.handle().pipe(
        tap(() => {
          const status = context.switchToHttp().getResponse().statusCode;
          this.counter.labels(req.method, req.url, status.toString()).inc();
        }),
      );
    }
  }
  