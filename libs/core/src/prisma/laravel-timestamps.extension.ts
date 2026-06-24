import { Prisma } from 'generated/prisma';

/**
 * Расширение Prisma, эмулирующее поведение Laravel-таймстампов.
 *
 * Зачем: основной бэкенд проекта — Laravel, и `created_at`/`updated_at`
 * проставляются на уровне приложения (Eloquent), а не БД (у колонок нет
 * DB-дефолта). Дополнительный NestJS-бэкенд пишет в ту же БД через Prisma,
 * который сам эти поля не заполняет → они остаются `NULL` и ломают чтение
 * на стороне Laravel.
 *
 * Решение централизованное: один query-extension на `$allModels` проставляет
 * таймстампы для всех моделей, у которых эти колонки есть. Не трогает схему
 * (переживает `prisma db pull`) и не требует правок в каждом репозитории.
 *
 * Поведение (как в Eloquent):
 * - create/createMany/upsert(create) → `created_at` и `updated_at` ← now();
 * - update/updateMany/upsert(update) → `updated_at` ← now();
 * - явно переданные значения не перетираются.
 */

const CREATED_AT = 'created_at';
const UPDATED_AT = 'updated_at';

/** Признаки наличия таймстамп-колонок у модели. */
export interface TimestampFlags {
    hasCreatedAt: boolean;
    hasUpdatedAt: boolean;
}

/**
 * Строит карту «имя модели → наличие колонок created_at/updated_at» из DMMF.
 * Нужна, чтобы не подставлять таймстампы в модели без этих колонок
 * (pivot-таблицы, `migrations` и т.п.).
 */
export function buildTimestampFlagsMap(
    models: ReadonlyArray<{
        name: string;
        fields: ReadonlyArray<{ name: string }>;
    }>,
): Map<string, TimestampFlags> {
    const map = new Map<string, TimestampFlags>();
    for (const model of models) {
        const fieldNames = new Set(model.fields.map(field => field.name));
        map.set(model.name, {
            hasCreatedAt: fieldNames.has(CREATED_AT),
            hasUpdatedAt: fieldNames.has(UPDATED_AT),
        });
    }
    return map;
}

function isMutableRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Проставляет created_at/updated_at в объект данных create, если они не заданы. */
export function applyCreateTimestamps(
    data: unknown,
    flags: TimestampFlags,
    now: Date,
): void {
    if (!isMutableRecord(data)) return;
    if (flags.hasCreatedAt && data[CREATED_AT] === undefined) {
        data[CREATED_AT] = now;
    }
    if (flags.hasUpdatedAt && data[UPDATED_AT] === undefined) {
        data[UPDATED_AT] = now;
    }
}

/** Проставляет created_at/updated_at в данные create (поддерживает массив для createMany). */
export function applyCreateTimestampsToData(
    data: unknown,
    flags: TimestampFlags,
    now: Date,
): void {
    if (Array.isArray(data)) {
        for (const row of data) applyCreateTimestamps(row, flags, now);
        return;
    }
    applyCreateTimestamps(data, flags, now);
}

/** Проставляет updated_at в объект данных update, если он не задан. */
export function applyUpdateTimestamps(
    data: unknown,
    flags: TimestampFlags,
    now: Date,
): void {
    if (!isMutableRecord(data)) return;
    if (flags.hasUpdatedAt && data[UPDATED_AT] === undefined) {
        data[UPDATED_AT] = now;
    }
}

const timestampFlagsByModel = buildTimestampFlagsMap(
    Prisma.dmmf.datamodel.models,
);

export const laravelTimestampsExtension = Prisma.defineExtension({
    name: 'laravel-timestamps',
    query: {
        $allModels: {
            create({ model, args, query }) {
                const flags = timestampFlagsByModel.get(model);
                if (flags) {
                    applyCreateTimestampsToData(
                        (args as { data?: unknown }).data,
                        flags,
                        new Date(),
                    );
                }
                return query(args);
            },
            createMany({ model, args, query }) {
                const flags = timestampFlagsByModel.get(model);
                if (flags) {
                    applyCreateTimestampsToData(
                        (args as { data?: unknown }).data,
                        flags,
                        new Date(),
                    );
                }
                return query(args);
            },
            update({ model, args, query }) {
                const flags = timestampFlagsByModel.get(model);
                if (flags) {
                    applyUpdateTimestamps(
                        (args as { data?: unknown }).data,
                        flags,
                        new Date(),
                    );
                }
                return query(args);
            },
            updateMany({ model, args, query }) {
                const flags = timestampFlagsByModel.get(model);
                if (flags) {
                    applyUpdateTimestamps(
                        (args as { data?: unknown }).data,
                        flags,
                        new Date(),
                    );
                }
                return query(args);
            },
            upsert({ model, args, query }) {
                const flags = timestampFlagsByModel.get(model);
                if (flags) {
                    const now = new Date();
                    applyCreateTimestamps(
                        (args as { create?: unknown }).create,
                        flags,
                        now,
                    );
                    applyUpdateTimestamps(
                        (args as { update?: unknown }).update,
                        flags,
                        now,
                    );
                }
                return query(args);
            },
        },
    },
});
