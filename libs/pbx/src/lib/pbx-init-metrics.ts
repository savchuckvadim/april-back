import { Counter, Histogram, register } from 'prom-client';
import { getCallContext } from '@/core/call-context';

/**
 * Метрики `PBXService.init` (разбор нагрузки 05.10.2026, пункт 1.3).
 *
 * init зовут десятки мест — по 7–8 раз на одно открытие сделки, — и было
 * непонятно, что в нём дорого: сборка портала из БД, слепок из online,
 * сборка модели или создание клиента Битрикса. Теперь видно время каждого
 * шага и сколько init делают менеджеры и фон по каждому порталу.
 *
 * Реестр prom-client по умолчанию — тот же, что отдаёт `/api/metrics`.
 */
export const PBX_INIT_DURATION_SECONDS = 'pbx_init_duration_seconds';
export const PBX_INIT_TOTAL = 'pbx_init_total';

/** Шаги init. */
export const PBX_INIT_STEP = {
    /** Локальная сборка портала из БД (кэш в памяти на минуту). */
    internalPortal: 'internal_portal',
    /** Проверка «портал из маркетплейса?». */
    marketplaceCheck: 'marketplace_check',
    /** Слепок портала из online (кэш Redis). */
    externalPortal: 'external_portal',
    /** Сборка PortalModel из слепка. */
    portalModel: 'portal_model',
    /** Клиент Битрикса вместе с лимитом портала из его настроек. */
    bitrixClient: 'bitrix_client',
    /** Весь init. */
    total: 'total',
} as const;

export type PbxInitStep = (typeof PBX_INIT_STEP)[keyof typeof PBX_INIT_STEP];

/** Повторная загрузка модуля (тесты) не должна регистрировать метрику дважды. */
const getOrCreate = <T>(name: string, create: () => T): T =>
    (register.getSingleMetric(name) as T | undefined) ?? create();

const duration = getOrCreate(
    PBX_INIT_DURATION_SECONDS,
    () =>
        new Histogram({
            name: PBX_INIT_DURATION_SECONDS,
            help: 'PBXService.init: длительность шагов, с',
            labelNames: ['step'],
            buckets: [
                0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10,
                30,
            ],
        }),
);

const total = getOrCreate(
    PBX_INIT_TOTAL,
    () =>
        new Counter({
            name: PBX_INIT_TOTAL,
            help: 'PBXService.init: вызовы по порталу и классу вызова',
            labelNames: ['domain', 'call_class'],
        }),
);

/** Замерить шаг init; результат шага отдаётся как есть. */
export const timeInitStep = async <T>(
    step: PbxInitStep,
    work: () => Promise<T> | T,
): Promise<T> => {
    const startedAt = performance.now();
    try {
        return await work();
    } finally {
        duration.observe({ step }, (performance.now() - startedAt) / 1000);
    }
};

/** Учесть вызов init: портал и кто спрашивает (менеджер или фон). */
export const countInit = (domain: string): void => {
    total.inc({ domain, call_class: getCallContext().callClass });
};
