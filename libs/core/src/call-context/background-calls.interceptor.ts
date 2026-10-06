import {
    CallHandler,
    ExecutionContext,
    Injectable,
    NestInterceptor,
    UseInterceptors,
} from '@nestjs/common';
import { Request } from 'express';
import { Observable } from 'rxjs';
import { runAsBackground } from './call-context';

/**
 * Понижает класс работы до фонового для HTTP-ручек, за которыми НЕ стоит
 * человек у экрана: вебхуки роботов и бизнес-процессов, ручки AI-агента,
 * ручной запуск кронов.
 *
 * Любой HTTP-запрос по умолчанию — интерактив (call-context.middleware), и
 * без этой пометки такие ручки отнимали бы у менеджеров место в
 * ограничителе запросов Битрикса наравне с открытием карточки.
 *
 * Обработчик маршрута выполняется в момент подписки на `next.handle()`,
 * поэтому подписка делается ВНУТРИ фонового контекста — тогда вся его
 * асинхронная работа, включая не ожидаемую, наследует фоновый класс.
 */
@Injectable()
export class BackgroundCallsInterceptor implements NestInterceptor {
    intercept(
        context: ExecutionContext,
        next: CallHandler,
    ): Observable<unknown> {
        const request = context.switchToHttp().getRequest<Request>();
        const source = `${request.method} ${request.path}`;
        return new Observable(subscriber =>
            runAsBackground(source, () => next.handle().subscribe(subscriber)),
        );
    }
}

/**
 * Пометка контроллера или отдельной ручки: «это фон, а не менеджер».
 *
 * ```ts
 * @BackgroundCalls()
 * @Controller('event-sales-hook')
 * export class HookController {}
 * ```
 */
export const BackgroundCalls = (): MethodDecorator & ClassDecorator =>
    UseInterceptors(BackgroundCallsInterceptor);
