import {
    Injectable,
    OnModuleInit,
    OnModuleDestroy,
    Global,
} from '@nestjs/common';
import { PrismaClient } from 'generated/prisma';
import { laravelTimestampsExtension } from './laravel-timestamps.extension';

/** Привязывает функции к нужному `this`, оставляя остальные значения как есть. */
function bindIfFunction(value: unknown, thisArg: object): unknown {
    if (typeof value !== 'function') return value;
    const fn = value as (...args: unknown[]) => unknown;
    return (...args: unknown[]): unknown => fn.apply(thisArg, args);
}

/**
 * Prisma-клиент проекта.
 *
 * Поверх базового клиента подключено расширение {@link laravelTimestampsExtension},
 * которое автоматически проставляет `created_at`/`updated_at` (как это делает
 * Laravel/Eloquent), потому что в общей с Laravel БД у этих колонок нет
 * DB-дефолта.
 *
 * Технически `$extends` возвращает новый (иммутабельный) клиент, поэтому
 * конструктор возвращает Proxy: обращения к моделям и query-методам идут в
 * расширенный клиент, а хуки жизненного цикла NestJS остаются на самом сервисе.
 */
@Global()
@Injectable()
export class PrismaService
    extends PrismaClient
    implements OnModuleInit, OnModuleDestroy
{
    constructor() {
        super();

        const extended = this.$extends(laravelTimestampsExtension) as Record<
            string | symbol,
            unknown
        >;

        return new Proxy(this, {
            get: (target, property) => {
                if (
                    property === 'onModuleInit' ||
                    property === 'onModuleDestroy'
                ) {
                    return Reflect.get(target, property, target);
                }

                const fromExtended = extended[property];
                if (fromExtended !== undefined) {
                    return bindIfFunction(fromExtended, extended);
                }

                const fromTarget: unknown = Reflect.get(
                    target,
                    property,
                    target,
                );
                return bindIfFunction(fromTarget, target);
            },
        });
    }

    async onModuleInit(): Promise<void> {
        await this.$connect();
    }

    async onModuleDestroy(): Promise<void> {
        await this.$disconnect();
    }
}
