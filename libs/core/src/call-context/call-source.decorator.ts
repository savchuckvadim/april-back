import 'reflect-metadata';
import { runAsCallSource } from './call-context';

type Method = (this: unknown, ...args: unknown[]) => unknown;

/**
 * Метаданные других декораторов метода (`@Cron`, `@Process`,
 * `@OnQueueFailed` …) живут на САМОЙ функции метода. Обёртка — новая
 * функция, поэтому без переноса Nest schedule и Bull перестали бы её
 * находить, и крон или обработчик очереди молча не запустился бы.
 */
const copyMethodMetadata = (from: Method, to: Method): void => {
    for (const key of Reflect.getOwnMetadataKeys(from)) {
        Reflect.defineMetadata(key, Reflect.getOwnMetadata(key, from), to);
    }
};

/**
 * Пометка точки входа фоновой работы: крона или обработчика очереди.
 *
 * ```ts
 * @Cron(RESCUE_CRON, { name: 'xo-dispatch-rescue' })
 * @CallSource('cron:xo-dispatch-rescue', 'Крон: подстраховка ХО')
 * async tick(): Promise<void> {}
 * ```
 *
 * Каждый вызов метода идёт в своём фоновом контексте (`runAsCallSource`):
 * тревоги и журнал сбоев Битрикса знают, какой крон или очередь
 * обращались, а `annotateCallContext` внутри дописывает портал, карточку и
 * сотрудника. Порядок с `@Cron`/`@Process` не важен — метаданные
 * переносятся на обёртку; но ставить ниже них привычнее и нагляднее.
 */
export const CallSource =
    (source: string, operation?: string): MethodDecorator =>
    (_target, _propertyKey, descriptor) => {
        const original: unknown = descriptor.value;
        if (typeof original !== 'function') return;
        const method = original as Method;

        const withCallSource: Method = function (this: unknown, ...args) {
            return runAsCallSource(source, operation, (): unknown =>
                method.apply(this, args),
            );
        };
        copyMethodMetadata(method, withCallSource);
        Object.defineProperty(withCallSource, 'name', { value: method.name });
        // Bull по числу параметров обработчика выбирает стиль: больше одного
        // — колбэк `(job, done)`. Обёртка `(...args)` имеет 0 — без переноса
        // такой обработчик молча сменил бы стиль.
        Object.defineProperty(withCallSource, 'length', {
            value: method.length,
        });
        descriptor.value = withCallSource as unknown as typeof descriptor.value;
    };
