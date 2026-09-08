import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { AppCacheService } from '@lib/app-cache';
import {
    DEFAULT_WORK_CALENDAR,
    SnapshotEnvelope,
} from '@lib/sales-ai-analytics';
import {
    AI_PIPELINE_BUS_KEYS,
    AI_PIPELINE_METRICS,
    AI_PIPELINE_RETRY_DELAY_MS,
} from '../constants/ai-snapshot.const';
import { AiEtlRunPayload, AiSnapshotJobData } from '../dto/ai-snapshot.dto';
import type { AiCalendarResult } from '../domain/loaders/calendar.util';
import { AiAnalyticsPipelineModule } from '../pipeline/ai-analytics-pipeline.module';
import { EtlRunWriter } from '../pipeline/etl-run.writer';
import { AiPipelineRunContextFactory } from '../pipeline/run-context.factory';
import { SnapshotPipelineService } from '../pipeline/snapshot-pipeline.service';
import {
    AiAnalyticsPipelineStep,
    AiPipelineJobLike,
    AiPipelineStepContext,
    AiPipelineStepResult,
    stepOk,
    stepSkipped,
    StepBus,
} from '../steps/step.types';

const DOMAIN = 'a.bitrix24.ru';
/** 8 сентября 2026, 00:45 UTC = 03:45 МСК. */
const NOW = new Date('2026-09-08T00:45:00Z');

type StepRun = (
    ctx: AiPipelineStepContext,
    bus: StepBus,
) => Promise<AiPipelineStepResult> | AiPipelineStepResult;

/** Шаг-заглушка с записью вызовов. */
function fakeStep(
    code: string,
    rhythms: AiAnalyticsPipelineStep['rhythms'],
    run: StepRun = () => stepOk(code),
): AiAnalyticsPipelineStep & { calls: AiPipelineStepContext[] } {
    const calls: AiPipelineStepContext[] = [];
    return {
        code,
        rhythms,
        calls,
        run: async (ctx, bus) => {
            calls.push(ctx);
            return run(ctx, bus);
        },
    };
}

/** Стор снапшотов в памяти: повтор ключа переводит прежнюю запись в superseded. */
function makeStore() {
    const records: {
        id: string;
        periodKey: string;
        status: string;
        inputsHash: string;
        payload: AiEtlRunPayload;
    }[] = [];
    const upsert = jest.fn((envelope: SnapshotEnvelope<AiEtlRunPayload>) => {
        const previous = records.filter(
            record =>
                record.periodKey === envelope.periodKey &&
                record.status === 'done',
        );
        for (const record of previous) record.status = 'superseded';
        const id = String(records.length + 1);
        records.push({
            id,
            periodKey: envelope.periodKey,
            status: 'done',
            inputsHash: envelope.inputsHash,
            payload: envelope.payload,
        });
        return Promise.resolve({
            id,
            supersededIds: previous.map(record => record.id),
        });
    });
    const latest = jest.fn(() => {
        const active = records.filter(record => record.status === 'done');
        return Promise.resolve(active[active.length - 1] ?? null);
    });
    return { store: { upsert, latest }, records, upsert };
}

/** Календарь портала: по умолчанию импорт без оговорок. */
function makeCalendarLoader(result: Partial<AiCalendarResult> = {}) {
    return {
        load: jest.fn().mockResolvedValue({
            calendar: DEFAULT_WORK_CALENDAR,
            dayHours: 8,
            source: 'import',
            warnings: [],
            ...result,
        } satisfies AiCalendarResult),
    };
}

function makeService(
    steps: AiAnalyticsPipelineStep[],
    acquired = true,
    calendar: { load: jest.Mock } = makeCalendarLoader(),
) {
    const { store, records, upsert } = makeStore();
    const settings = {
        load: jest.fn().mockResolvedValue({
            enabled: true,
            calendar: DEFAULT_WORK_CALENDAR,
            definitions: { normStratum: 'tenure' },
        }),
    };
    const params = {
        load: jest.fn().mockResolvedValue({
            ctx: { portal: { kappa_star: 30 } },
            paramsVersion: 'pv-1',
            comparableFrom: '2026-06-01',
        }),
    };
    const managers = { resolve: jest.fn().mockResolvedValue([10, 20]) };
    const release = jest.fn().mockResolvedValue(undefined);
    const concurrency = {
        acquire: jest
            .fn()
            .mockResolvedValue(
                acquired
                    ? { acquired: true, release }
                    : { acquired: false, reason: 'entity-busy', release },
            ),
    };
    const metrics = { observeRun: jest.fn() };
    const context = new AiPipelineRunContextFactory(
        settings as never,
        params as never,
        managers as never,
        calendar as never,
    );
    const service = new SnapshotPipelineService(
        context,
        concurrency as never,
        new EtlRunWriter(store as never, metrics as never),
        steps,
    );
    return {
        service,
        records,
        upsert,
        release,
        metrics,
        concurrency,
        settings,
        calendar,
        managers,
    };
}

function makeJob(
    data: Partial<AiSnapshotJobData> = {},
): AiPipelineJobLike & { queue: { add: jest.Mock } } {
    return {
        data: {
            domain: DOMAIN,
            kind: 'nightly',
            day: '2026-09-08',
            weekKey: '2026-W37',
            monthKey: '2026-09',
            ...data,
        },
        queue: { add: jest.fn().mockResolvedValue(undefined) },
    };
}

/** Последняя актуальная запись журнала. */
function activeRuns(records: { status: string; payload: AiEtlRunPayload }[]) {
    return records.filter(record => record.status === 'done');
}

describe('SnapshotPipelineService — раннер ночного конвейера', () => {
    it('собирает контекст прогона и передаёт его шагу', async () => {
        const step = fakeStep('calls', ['nightly']);
        const { service } = makeService([step]);

        const summary = await service.run(makeJob(), NOW);

        expect(step.calls).toHaveLength(1);
        const ctx = step.calls[0];
        expect(ctx).toMatchObject({
            domain: DOMAIN,
            rhythm: 'nightly',
            day: '2026-09-08',
            weekKey: '2026-W37',
            monthKey: '2026-09',
            timeZone: 'Europe/Moscow',
            calendar: DEFAULT_WORK_CALENDAR,
            registry: { portal: { kappa_star: 30 } },
            paramsVersion: 'pv-1',
            calcVersion: 'sam-1.0.0',
            comparableFrom: '2026-06-01',
            managerIds: [10, 20],
            now: NOW,
            forceRefresh: false,
        });
        expect(ctx.settings.enabled).toBe(true);
        expect(ctx.inputsHash).toMatch(/^[0-9a-f]{16}$/);
        expect(summary.status).toBe('ok');
    });

    it('шаги фильтруются по ритму и белому списку джобы', async () => {
        const nightly = fakeStep('calls', ['nightly']);
        const weekly = fakeStep('week', ['weekly']);
        const plans = fakeStep('plans', ['nightly', 'monthly']);
        const { service } = makeService([nightly, weekly, plans]);

        await service.run(makeJob(), NOW);
        expect(nightly.calls).toHaveLength(1);
        expect(plans.calls).toHaveLength(1);
        expect(weekly.calls).toHaveLength(0);

        const only = makeService([nightly, weekly, plans]);
        await only.service.run(makeJob({ steps: ['plans'] }), NOW);
        expect(
            activeRuns(only.records)[0].payload.steps.map(s => s.step),
        ).toEqual(['plans']);
    });

    it('шина передаёт значения между шагами', async () => {
        const producer = fakeStep('calls', ['nightly'], (_ctx, bus) => {
            bus.set(AI_PIPELINE_BUS_KEYS.callsRows, [{ id: 1 }]);
            return stepOk('calls', { rows: 1 });
        });
        let seen: unknown;
        const consumer = fakeStep('kpi', ['nightly'], (_ctx, bus) => {
            seen = bus.get(AI_PIPELINE_BUS_KEYS.callsRows);
            return stepOk('kpi');
        });
        const { service } = makeService([producer, consumer]);

        await service.run(makeJob(), NOW);

        expect(seen).toEqual([{ id: 1 }]);
    });

    it('пропуск шага не останавливает конвейер и даёт журналу «частично»', async () => {
        const skipped = fakeStep('stage-history', ['nightly'], () =>
            stepSkipped('stage-history', 'stage-history-too-short'),
        );
        const next = fakeStep('kpi', ['nightly']);
        const { service, records } = makeService([skipped, next]);

        const summary = await service.run(makeJob(), NOW);

        expect(next.calls).toHaveLength(1);
        expect(summary.status).toBe('partial');
        const payload = activeRuns(records)[0].payload;
        expect(payload.status).toBe('partial');
        expect(payload.steps.map(step => step.step)).toEqual([
            'stage-history',
            'kpi',
        ]);
        expect(payload.steps[0].reason).toBe('stage-history-too-short');
    });

    it('падение шага: журнал failed, исключение проброшено, слот освобождён, следующий шаг не выполнен', async () => {
        const error = jest
            .spyOn(Logger.prototype, 'error')
            .mockImplementation(() => undefined);
        const failing = fakeStep('kpi', ['nightly'], () => {
            throw new Error('kpi-report недоступен');
        });
        const next = fakeStep('finance', ['nightly']);
        const { service, records, release } = makeService([failing, next]);

        await expect(service.run(makeJob(), NOW)).rejects.toThrow(
            'kpi-report недоступен',
        );

        expect(next.calls).toHaveLength(0);
        expect(release).toHaveBeenCalledTimes(1);
        const payload = activeRuns(records)[0].payload;
        expect(payload.status).toBe('failed');
        expect(payload.steps[0]).toMatchObject({
            step: 'kpi',
            status: 'failed',
            error: 'kpi-report недоступен',
        });
        expect(error).toHaveBeenCalledWith(expect.any(String), {
            telegram: true,
            domain: DOMAIN,
        });
        error.mockRestore();
    });

    it('занятый слот: джоба переставляется через 60 с, шаги не выполняются, журнал не пишется', async () => {
        const step = fakeStep('calls', ['nightly']);
        const { service, records, concurrency } = makeService([step], false);
        const job = makeJob();

        const summary = await service.run(job, NOW);

        expect(step.calls).toHaveLength(0);
        expect(records).toHaveLength(0);
        expect(summary.status).toBe('requeued');
        expect(summary.reason).toBe('entity-busy');
        expect(concurrency.acquire).toHaveBeenCalledWith({
            queue: 'sales-kpi-report',
            domain: DOMAIN,
            entityKey: 'ai-analytics:pipeline',
            maxPerDomain: 1,
        });
        expect(job.queue.add).toHaveBeenCalledWith(
            'sales-ai-analytics-snapshot',
            { ...job.data, slotRetries: 1 },
            {
                delay: AI_PIPELINE_RETRY_DELAY_MS,
                removeOnComplete: true,
                removeOnFail: true,
            },
        );
    });

    it('в журнал идут длительность, строки и вызовы Битрикс по каждому шагу и все четыре метрики', async () => {
        const step = fakeStep('calls', ['nightly'], () =>
            stepOk('calls', { ms: 120, rows: 40, bitrixCalls: 3, written: 2 }),
        );
        const { service, records, metrics } = makeService([step]);

        await service.run(makeJob(), NOW);

        const payload = activeRuns(records)[0].payload;
        expect(payload.steps[0]).toMatchObject({
            durationMs: 120,
            rowsLoaded: 40,
            bitrixCalls: 3,
            written: 2,
        });
        expect(Object.keys(payload.metrics)).toEqual([...AI_PIPELINE_METRICS]);
        expect(typeof payload.metrics.ai_analytics_job_duration).toBe('number');
        expect(payload.metrics.ai_analytics_rows_loaded).toBe(40);
        expect(payload.metrics.ai_analytics_bitrix_calls).toBe(3);
        expect(payload.metrics.ai_analytics_llm_price).toBe(0);
        expect(metrics.observeRun).toHaveBeenCalledWith(
            'nightly',
            'ok',
            payload.metrics,
        );
    });

    it('идемпотентный повтор за ту же дату не плодит снапшоты', async () => {
        const step = fakeStep('calls', ['nightly']);
        const { service, records, upsert } = makeService([step]);

        await service.run(makeJob(), NOW);
        await service.run(makeJob(), NOW);

        expect(upsert).toHaveBeenCalledTimes(2);
        expect(records).toHaveLength(2);
        expect(activeRuns(records)).toHaveLength(1);
        expect(records.every(record => record.periodKey === '2026-09-08')).toBe(
            true,
        );
        expect(activeRuns(records)[0].payload.inputsDrift).toBe(false);
    });

    it('падение сбора контекста: журнал с шагом context и проброс ошибки', async () => {
        const error = jest
            .spyOn(Logger.prototype, 'error')
            .mockImplementation(() => undefined);
        const step = fakeStep('calls', ['nightly']);
        const { service, records, release, settings } = makeService([step]);
        settings.load.mockRejectedValueOnce(new Error('нет строки настроек'));

        await expect(service.run(makeJob(), NOW)).rejects.toThrow(
            'нет строки настроек',
        );

        expect(step.calls).toHaveLength(0);
        expect(release).toHaveBeenCalledTimes(1);
        expect(activeRuns(records)[0].payload.steps[0]).toMatchObject({
            step: 'context',
            status: 'failed',
        });
        error.mockRestore();
    });

    it('вид джобы не из ритмов конвейера отвергается', async () => {
        const { service } = makeService([]);
        await expect(
            service.run(makeJob({ kind: 'audit' }), NOW),
        ).rejects.toThrow('не ритм конвейера');
    });

    it('пустой ростер и ни одного шага ритма: журнал без шагов, прогон не падает', async () => {
        const weekly = fakeStep('week', ['weekly']);
        const { service, records, managers } = makeService([weekly]);
        managers.resolve.mockResolvedValue([]);

        const summary = await service.run(makeJob(), NOW);

        expect(weekly.calls).toHaveLength(0);
        expect(summary.status).toBe('ok');
        expect(activeRuns(records)[0].payload.steps).toEqual([]);
        expect(activeRuns(records)[0].payload.rowsLoaded).toBe(0);
    });

    it('календарь берётся у загрузчика портала, его оговорки уезжают в журнал', async () => {
        const holidays = ['2026-01-01', '2026-01-07'];
        const calendar = makeCalendarLoader({
            calendar: { ...DEFAULT_WORK_CALENDAR, holidays },
            source: 'override',
            warnings: [
                'Производственный календарь: на 2026 год праздников нет',
            ],
        });
        const step = fakeStep('calls', ['nightly']);
        const { service, records } = makeService([step], true, calendar);

        await service.run(makeJob(), NOW);

        expect(calendar.load).toHaveBeenCalledWith(DOMAIN, { now: NOW });
        expect(step.calls[0].calendar.holidays).toEqual(holidays);
        expect(activeRuns(records)[0].payload.warnings).toEqual([
            'Производственный календарь: на 2026 год праздников нет',
        ]);
    });

    it('отказ загрузчика календаря не роняет прогон: календарь настроек и оговорка', async () => {
        const calendar = {
            load: jest.fn().mockRejectedValue(new Error('нет прав')),
        };
        const step = fakeStep('calls', ['nightly']);
        const { service, records } = makeService([step], true, calendar);

        const summary = await service.run(makeJob(), NOW);

        expect(summary.status).toBe('ok');
        expect(step.calls[0].calendar).toEqual(DEFAULT_WORK_CALENDAR);
        expect(activeRuns(records)[0].payload.warnings[0]).toContain(
            'нет прав',
        );
    });

    it('предупреждения шага (санити-панель) попадают в warnings журнала', async () => {
        // Расширенный результат шага: чужие значения в warnings отбрасываются.
        const enriched: AiPipelineStepResult & { warnings: unknown[] } = {
            ...stepOk('sanity'),
            warnings: ['Цель уровня middle и факт разошлись', 42],
        };
        const step = fakeStep('sanity', ['nightly'], () => enriched);
        const { service, records } = makeService([step]);

        await service.run(makeJob(), NOW);

        expect(activeRuns(records)[0].payload.warnings).toEqual([
            'Цель уровня middle и факт разошлись',
        ]);
    });
});

/** Токен провайдера: класс либо значение `provide`. */
function tokenOf(provider: unknown): unknown {
    return typeof provider === 'function'
        ? provider
        : (provider as { provide?: unknown }).provide;
}

function metadataOf(target: unknown, key: string): unknown[] {
    return (
        (Reflect.getMetadata(key, target as object) as unknown[] | undefined) ??
        []
    );
}

/** Экспортируемые модулем токены (вложенные реэкспорты — рекурсивно). */
function exportsOf(module: unknown, seen = new Set<unknown>()): Set<unknown> {
    const result = new Set<unknown>();
    if (seen.has(module)) return result;
    seen.add(module);
    for (const item of metadataOf(module, 'exports')) {
        const nested =
            typeof item === 'function' && metadataOf(item, 'providers').length
                ? exportsOf(item, seen)
                : null;
        if (nested) for (const token of nested) result.add(token);
        else result.add(item);
    }
    return result;
}

describe('AiAnalyticsPipelineModule — самодостаточность среза', () => {
    it('каждая зависимость провайдеров доступна в модуле или его импортах', () => {
        // AppCacheService — глобальный провайдер приложения (@Global).
        const available = new Set<unknown>([AppCacheService]);
        for (const provider of metadataOf(
            AiAnalyticsPipelineModule,
            'providers',
        )) {
            available.add(tokenOf(provider));
        }
        for (const imported of metadataOf(
            AiAnalyticsPipelineModule,
            'imports',
        )) {
            for (const token of exportsOf(imported)) available.add(token);
        }

        const missing: string[] = [];
        for (const provider of metadataOf(
            AiAnalyticsPipelineModule,
            'providers',
        )) {
            if (typeof provider !== 'function') continue;
            // Параметры с @Inject(token) лежат в self:paramtypes — для них
            // проверяется токен, а не тип аргумента (Counter, Array и т. п.).
            const injected = metadataOf(provider, 'self:paramtypes') as {
                index: number;
                param: unknown;
            }[];
            metadataOf(provider, 'design:paramtypes').forEach((dep, index) => {
                const custom = injected.find(item => item.index === index);
                if (!custom && (typeof dep !== 'function' || dep === Object)) {
                    return;
                }
                const token = custom ? custom.param : dep;
                if (available.has(token)) return;
                const name =
                    typeof token === 'function'
                        ? (token as { name: string }).name
                        : String(token);
                missing.push(`${provider.name} → ${name}`);
            });
        }
        expect(missing).toEqual([]);
        expect(available.has(SnapshotPipelineService)).toBe(true);
    });

    it('модуль не публикует контроллеров (поверхность API не растёт)', () => {
        expect(metadataOf(AiAnalyticsPipelineModule, 'controllers')).toEqual(
            [],
        );
    });
});
