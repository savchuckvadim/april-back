import { Logger } from '@nestjs/common';
import { JobNames } from '@/modules/queue/constants/job-names.enum';
import { QueueNames } from '@/modules/queue/constants/queue-names.enum';
import {
    AI_BRIEF_LIMITS,
    AI_BRIEF_NO_ACTIONS_TEXT,
    AI_BRIEF_TEMPLATE_REASONS,
    type AiBriefFact,
    type AiEvidencePack,
    type BriefSnapshot,
} from '@lib/sales-ai-analytics';
import type { AiBriefLlmResult } from '../brief/ai-brief-llm.port';
import {
    buildBriefKey,
    buildBriefPeriodKey,
    buildBriefPrevKey,
} from '../brief/brief-cache-key.util';
import {
    extractPrevFacts,
    notReadyPrevFacts,
} from '../brief/evidence-pack.prev';
import { briefFact } from '../brief/evidence-pack.types';
import { buildOverviewKey } from '../cache/cache-key.util';
import { buildManagersKey } from '../domain/loaders/loader-cache-key.util';
import {
    AI_BRIEF_FACT_CODES,
    AI_BRIEF_OVERVIEW_JOB_OPTIONS,
    AI_BRIEF_OVERVIEW_WAIT_MS,
    AI_BRIEF_TEMPLATE_REASON_TEXTS,
    AI_BRIEF_TTL_SECONDS,
} from '../constants/ai-brief.const';
import { AI_ANALYTICS_CALC_VERSION } from '../constants/ai-overview.const';
import { BriefJobUseCase } from '../domain/use-cases/brief-job.use-case';
import type { AiBriefDto } from '../dto/ai-brief.dto';
import { AiAnalyticsSnapshotStore } from '../store/ai-analytics-snapshot.store';
import {
    BRIEF_COMPARED,
    BRIEF_DOMAIN,
    BRIEF_FROM,
    BRIEF_NOW,
    BRIEF_PREV_FROM,
    BRIEF_PREV_TO,
    BRIEF_TO,
    briefFacts,
    briefJobData,
    briefOverview,
    briefOverviewRow,
    briefPack,
} from './fixtures/brief.fixture';
import { settingsLoaderWith } from './fixtures/lite-row.fixture';

const PACK = briefPack();
const DATA = briefJobData();
const LINK = 'https://april.bitrix24.ru/crm/type/1036/details/128/';
const PREV_KEY = buildBriefPrevKey(
    BRIEF_DOMAIN,
    BRIEF_PREV_FROM,
    BRIEF_PREV_TO,
    [10, 20],
);
const OVERVIEW_KEY = buildOverviewKey(
    BRIEF_DOMAIN,
    BRIEF_FROM,
    BRIEF_TO,
    '10_20',
    false,
);
const PREV_OVERVIEW_KEY = buildOverviewKey(
    BRIEF_DOMAIN,
    BRIEF_PREV_FROM,
    BRIEF_PREV_TO,
    '10_20',
    false,
);
const NOT_READY = notReadyPrevFacts({
    from: BRIEF_PREV_FROM,
    to: BRIEF_PREV_TO,
});

/** Пункты нейросети (изменения и фокус) и пункты действий правил. */
const modelBullets = (dto: AiBriefDto) =>
    dto.bullets.filter(bullet => bullet.group !== 'action');
const actionTexts = (dto: AiBriefDto) =>
    dto.bullets
        .filter(bullet => bullet.group === 'action')
        .map(bullet => bullet.text);

const currentOverview = () =>
    briefOverview([
        briefOverviewRow('10', { riskCalls: 2, salesCount: 3, analyzed: 200 }),
        briefOverviewRow('20', { riskCalls: 1, salesCount: 1, analyzed: 100 }),
    ]);

const prevOverview = () =>
    briefOverview([
        briefOverviewRow('10', { riskCalls: 1, salesCount: 4, analyzed: 150 }),
        briefOverviewRow('20', { riskCalls: 0, salesCount: 2, analyzed: 100 }),
    ]);

/** Строка `ais` в памяти: колонки записи и статус. */
interface AisRow extends Record<string, unknown> {
    id: string;
    createdAt: Date;
    status: string;
    activity_id?: string | null;
    type?: string | null;
    domain?: string | null;
}

/**
 * Стор снапшотов над `ais` в памяти: create/update/findByDomainTypeKeys
 * ведут себя как AiService, поэтому ретенция проверяется реальным
 * `AiAnalyticsSnapshotStore.upsert`, а не моком upsert.
 */
function inMemoryStore(): { store: AiAnalyticsSnapshotStore; rows: AisRow[] } {
    const rows: AisRow[] = [];
    let tick = 0;
    const aiService = {
        create: (input: { status?: string } & Record<string, unknown>) => {
            tick += 1;
            const row: AisRow = {
                ...input,
                id: String(tick),
                createdAt: new Date(BRIEF_NOW.getTime() + tick * 1000),
                status: input.status ?? 'done',
            };
            rows.push(row);
            return Promise.resolve(row);
        },
        update: (id: string, patch: Record<string, unknown>) => {
            const row = rows.find(item => item.id === id);
            if (row) Object.assign(row, patch);
            return Promise.resolve(row ?? { id });
        },
        findByDomainTypeKeys: (
            domain: string,
            type: string,
            keys: { activityIds?: string[] },
        ) =>
            Promise.resolve(
                rows.filter(
                    row =>
                        row.domain === domain &&
                        row.type === type &&
                        keys.activityIds?.includes(String(row.activity_id)),
                ),
            ),
        findByDomainTypesInPeriod: () => Promise.resolve(rows),
    };
    return { store: new AiAnalyticsSnapshotStore(aiService as never), rows };
}

/** Ответ модели: по буллету на факт пакета, числа — из фраз фактов. */
function llmAnswer(
    pack: AiEvidencePack,
    options: { alienNumber?: boolean; bullets?: number; link?: string } = {},
): AiBriefLlmResult {
    const facts = pack.facts.slice(0, options.bullets ?? pack.facts.length);
    const bullets = facts.map((fact: AiBriefFact, index: number) => ({
        text:
            options.alienNumber && index === 0
                ? 'Продажи выросли на 777 процентов за период'
                : fact.text,
        group: 'change',
        factRefs: [fact.code],
        ...(options.link !== undefined && index === 0
            ? { link: options.link }
            : {}),
    }));

    return {
        payload: {
            headline: 'Итоги недели отдела продаж',
            tone: 'attention',
            bullets,
        },
        usage: {
            totalTokens: 1500,
            model: 'bitrix/bitrixgpt-5.5',
            promptChars: 800,
            completionChars: 400,
        },
    };
}

interface Harness {
    pack?: AiEvidencePack;
    apiKey?: string | null;
    quotaAllowed?: boolean;
    /** Цена 1 000 токенов из реестра (код llm_price_per_1k). */
    pricePerThousand?: number;
    /** Дневная квота (код brief_quota_per_day). */
    quotaLimit?: number;
    answer?: AiBriefLlmResult | (() => AiBriefLlmResult);
    llmError?: Error;
    /** Реальный стор над `ais` в памяти вместо мока upsert (ретенция). */
    store?: AiAnalyticsSnapshotStore;
    /** Значения кэша по ключам (промах — ключа нет). */
    cached?: Record<string, unknown>;
    /** Что делает `job.finished()` джобы обзора прошлого окна. */
    finished?: () => Promise<unknown>;
}

function makeJob({
    pack = PACK,
    apiKey = 'vibe-key',
    quotaAllowed = true,
    pricePerThousand = 2,
    quotaLimit = 5,
    answer,
    llmError,
    store,
    cached = {},
    finished = () => Promise.resolve(undefined),
}: Harness = {}) {
    const build = jest.fn().mockResolvedValue(pack);
    const load = jest.fn().mockResolvedValue({
        ctx: {
            portal: {
                brief_quota_per_day: quotaLimit,
                llm_price_per_1k: pricePerThousand,
            },
        },
        paramsVersion: 'pv-1',
        comparableFrom: '',
    });
    const consume = jest.fn().mockResolvedValue({
        allowed: quotaAllowed,
        used: quotaAllowed ? 1 : quotaLimit,
        limit: quotaLimit,
    });
    const complete = jest.fn(() => {
        if (llmError) return Promise.reject(llmError);
        const result =
            typeof answer === 'function'
                ? answer()
                : (answer ?? llmAnswer(pack));

        return Promise.resolve(result);
    });
    const resolveKey = jest.fn().mockResolvedValue(apiKey);
    const upsert = jest.fn().mockResolvedValue({ id: 'ais-1', written: 1 });
    const setJson = jest.fn().mockResolvedValue(undefined);
    const getJson = jest.fn(
        (key: string): Promise<unknown> => Promise.resolve(cached[key] ?? null),
    );
    const sendToClient = jest.fn();
    const dispatch = jest.fn().mockResolvedValue({ id: 'ov', finished });
    const job = new BriefJobUseCase(
        { build } as never,
        { load } as never,
        settingsLoaderWith({}),
        { consume } as never,
        { resolveKey, complete },
        (store ?? { upsert }) as never,
        { setJson, getJson } as never,
        { sendToClient } as never,
        { dispatch } as never,
    );

    return {
        job,
        build,
        consume,
        complete,
        resolveKey,
        upsert,
        setJson,
        getJson,
        sendToClient,
        dispatch,
    };
}

/** Нагрузка записанного снапшота резюме. */
function snapshotOf(upsert: jest.Mock): BriefSnapshot {
    const [envelope] = upsert.mock.calls[0] as [{ payload: BriefSnapshot }];

    return envelope.payload;
}

/** Логгер use-case'а: по нему проверяется признак { telegram: true }. */
const loggerOf = (job: BriefJobUseCase): Logger =>
    (job as unknown as { logger: Logger }).logger;

describe('BriefJobUseCase: джоба резюме', () => {
    it('ответ модели прошёл факт-чек: source llm, кэш 6 ч, WS done', async () => {
        const { job, setJson, sendToClient, upsert } = makeJob();
        const dto = await job.execute(DATA, BRIEF_NOW);

        expect(dto.source).toBe('llm');
        expect(dto.headline).toBe('Итоги недели отдела продаж');
        expect(modelBullets(dto)).toHaveLength(PACK.facts.length);
        // Действия — от правил пакета, а не от нейросети: сработавших
        // правил нет, и пункт говорит об этом.
        expect(actionTexts(dto)).toEqual([AI_BRIEF_NO_ACTIONS_TEXT]);
        expect(dto.packHash).toBe(PACK.hash);
        expect(dto.reason).toBeNull();
        expect(dto.comparable).toBe(false);
        expect(dto.previousPeriod).toBeNull();
        expect(setJson).toHaveBeenCalledWith(
            DATA.requestKey,
            { status: 'ready', data: dto },
            AI_BRIEF_TTL_SECONDS.ready,
        );
        expect(AI_BRIEF_TTL_SECONDS.ready).toBe(6 * 60 * 60);
        expect(sendToClient).toHaveBeenCalledWith('sock', {
            event: 'ai-analytics:brief:done',
            data: {
                requestKey: DATA.requestKey,
                generatedAt: BRIEF_NOW.toISOString(),
            },
        });
        // Ключ периода — период и ростер, а не packHash: packHash живёт
        // в inputsHash и нагрузке (ретенция, долг 40 волны C).
        expect(upsert).toHaveBeenCalledWith(
            expect.objectContaining({
                type: 'ai-analytics-brief',
                periodKey: buildBriefPeriodKey(
                    DATA.from,
                    DATA.to,
                    DATA.managerIds,
                ),
                managerId: null,
                inputsHash: PACK.hash,
                paramsVersion: 'pv-1',
            }),
        );
        expect(buildBriefPeriodKey(DATA.from, DATA.to, DATA.managerIds)).toBe(
            '2026-09-01_2026-09-07_10_20',
        );
        expect(snapshotOf(upsert).packHash).toBe(PACK.hash);
        expect(snapshotOf(upsert).comparable).toBe(false);
        expect(snapshotOf(upsert).previousPeriod).toBeNull();
    });

    it('снапшот несёт tokens_count и price по формуле токены/1000 × цена', async () => {
        const { job, upsert } = makeJob({ pricePerThousand: 2 });
        const dto = await job.execute(DATA, BRIEF_NOW);
        const snapshot = snapshotOf(upsert);

        expect(snapshot.tokensCount).toBe(1500);
        expect(snapshot.price).toBe((1500 / 1000) * 2);
        expect(snapshot.estimated).toBe(false);
        expect(snapshot.model).toBe('bitrix/bitrixgpt-5.5');
        expect(snapshot.factCodes).toEqual(PACK.facts.map(fact => fact.code));
        expect(dto.usage).toEqual({ tokens: 1500, price: 3, estimated: false });
    });

    it('расход вызова едет в usage конверта, а стор кладёт его в колонки ais', async () => {
        const { job, upsert } = makeJob({ pricePerThousand: 2 });
        await job.execute(DATA, BRIEF_NOW);
        expect(upsert).toHaveBeenCalledWith(
            expect.objectContaining({
                calcVersion: AI_ANALYTICS_CALC_VERSION,
                usage: { tokensCount: 1500, price: 3 },
            }),
        );

        const idle = makeJob({ apiKey: null });
        await idle.job.execute(DATA, BRIEF_NOW);
        expect(idle.upsert).toHaveBeenCalledWith(
            expect.objectContaining({
                usage: { tokensCount: null, price: null },
            }),
        );

        const { store, rows } = inMemoryStore();
        await makeJob({ store, pricePerThousand: 2 }).job.execute(
            DATA,
            BRIEF_NOW,
        );
        expect(rows).toHaveLength(1);
        expect(rows[0]).toEqual(
            expect.objectContaining({
                type: 'ai-analytics-brief',
                tokens_count: 1500,
                price: 3,
                model: AI_ANALYTICS_CALC_VERSION,
            }),
        );
        expect(
            (rows[0].user_result as { payload: BriefSnapshot }).payload.model,
        ).toBe('bitrix/bitrixgpt-5.5');
    });

    it('usage не пришёл: токены — оценка по длине, пометка estimated', async () => {
        const answer = llmAnswer(PACK);
        const { job, upsert } = makeJob({
            answer: {
                ...answer,
                usage: { ...answer.usage, totalTokens: null },
            },
            pricePerThousand: 2,
        });
        await job.execute(DATA, BRIEF_NOW);
        const snapshot = snapshotOf(upsert);

        // (800 + 400) символов / 4 символа на токен = 300 токенов.
        expect(snapshot.tokensCount).toBe(300);
        expect(snapshot.price).toBe((300 / 1000) * 2);
        expect(snapshot.estimated).toBe(true);
    });

    it('llm_price_per_1k = 0: цена ноль с пометкой estimated, токены есть', async () => {
        const { job, upsert } = makeJob({ pricePerThousand: 0 });
        await job.execute(DATA, BRIEF_NOW);
        const snapshot = snapshotOf(upsert);

        expect(snapshot.tokensCount).toBe(1500);
        expect(snapshot.price).toBe(0);
        expect(snapshot.estimated).toBe(true);
    });

    it('без ключа VibeCode: шаблон с подписью, модель не вызывается, джоба успешна', async () => {
        const { job, complete, consume, upsert, sendToClient } = makeJob({
            apiKey: null,
        });
        const dto = await job.execute(DATA, BRIEF_NOW);
        const snapshot = snapshotOf(upsert);

        expect(dto.source).toBe('template');
        expect(dto.reason).toBe(
            AI_BRIEF_TEMPLATE_REASON_TEXTS[AI_BRIEF_TEMPLATE_REASONS.noLlmKey],
        );
        expect(dto.usage).toBeUndefined();
        expect(dto.bullets.map(bullet => bullet.group)).toContain('action');
        expect(snapshot.reason).toBe(AI_BRIEF_TEMPLATE_REASONS.noLlmKey);
        expect(snapshot.tokensCount).toBeNull();
        expect(snapshot.price).toBeNull();
        expect(complete).not.toHaveBeenCalled();
        expect(consume).not.toHaveBeenCalled();
        expect(sendToClient).toHaveBeenCalledWith(
            'sock',
            expect.objectContaining({ event: 'ai-analytics:brief:done' }),
        );
    });

    it('шестой вызов за день: квота исчерпана → шаблон с подписью квоты', async () => {
        const { job, complete, consume, upsert } = makeJob({
            quotaAllowed: false,
            quotaLimit: 5,
        });
        const dto = await job.execute(DATA, BRIEF_NOW);

        expect(consume).toHaveBeenCalledWith(BRIEF_DOMAIN, '2026-09-08', 5);
        expect(complete).not.toHaveBeenCalled();
        expect(dto.source).toBe('template');
        expect(dto.reason).toBe(
            AI_BRIEF_TEMPLATE_REASON_TEXTS[
                AI_BRIEF_TEMPLATE_REASONS.quotaExceeded
            ],
        );
        expect(snapshotOf(upsert).reason).toBe(
            AI_BRIEF_TEMPLATE_REASONS.quotaExceeded,
        );
    });

    it('буллет с числом вне пакета отбрасывается', async () => {
        const { job, upsert } = makeJob({
            answer: llmAnswer(PACK, { alienNumber: true }),
        });
        const dto = await job.execute(DATA, BRIEF_NOW);

        expect(dto.source).toBe('llm');
        expect(modelBullets(dto)).toHaveLength(PACK.facts.length - 1);
        expect(dto.bullets.map(bullet => bullet.text)).not.toContain(
            'Продажи выросли на 777 процентов за период',
        );
        expect(snapshotOf(upsert).passRatePct).toBeCloseTo(
            ((PACK.facts.length - 1) / PACK.facts.length) * 100,
            1,
        );
    });

    it('после факт-чека меньше двух буллетов → шаблон с причиной факт-чека', async () => {
        const pack = briefPack();
        const answer = llmAnswer(pack, { bullets: 2, alienNumber: true });
        const { job, upsert } = makeJob({ answer });
        const dto = await job.execute(DATA, BRIEF_NOW);

        expect(AI_BRIEF_LIMITS.minBullets).toBe(2);
        expect(dto.source).toBe('template');
        expect(dto.reason).toBe(
            AI_BRIEF_TEMPLATE_REASON_TEXTS[
                AI_BRIEF_TEMPLATE_REASONS.factcheckFailed
            ],
        );
        // Расход вызова всё равно учтён: модель отвечала.
        expect(snapshotOf(upsert).tokensCount).toBe(1500);
    });

    it('ошибка модели: error-конверт 120 с, WS :error, telegram-лог и rethrow', async () => {
        const llmError = new Error('VibeCode 500');
        const { job, setJson, sendToClient } = makeJob({ llmError });
        const logged: [string, unknown][] = [];
        jest.spyOn(loggerOf(job), 'error').mockImplementation(((
            message: string,
            meta: unknown,
        ) => {
            logged.push([message, meta]);
        }) as never);

        await expect(job.execute(DATA, BRIEF_NOW)).rejects.toThrow(
            'VibeCode 500',
        );
        expect(setJson).toHaveBeenCalledWith(
            DATA.requestKey,
            { status: 'error', message: 'VibeCode 500' },
            AI_BRIEF_TTL_SECONDS.error,
        );
        expect(AI_BRIEF_TTL_SECONDS.error).toBe(120);
        expect(sendToClient).toHaveBeenCalledWith('sock', {
            event: 'ai-analytics:brief:error',
            data: { requestKey: DATA.requestKey, message: 'VibeCode 500' },
        });
        expect(logged).toHaveLength(1);
        expect(logged[0][1]).toEqual({ telegram: true });
    });

    it('повтор той же ошибки домена не дублирует telegram-оповещение', async () => {
        const { job } = makeJob({ llmError: new Error('VibeCode 500') });
        const metas: unknown[] = [];
        jest.spyOn(loggerOf(job), 'error').mockImplementation(((
            _message: string,
            meta: unknown,
        ) => {
            metas.push(meta);
        }) as never);

        await expect(job.execute(DATA, BRIEF_NOW)).rejects.toThrow();
        await expect(job.execute(DATA, BRIEF_NOW)).rejects.toThrow();

        expect(metas).toEqual([{ telegram: true }, undefined]);
    });

    it('20 детерминированных прогонов: факт-чек проходит ≥ 95 % буллетов', async () => {
        const runs = 20;
        const rates: number[] = [];
        for (let run = 0; run < runs; run += 1) {
            const answer = llmAnswer(PACK, { alienNumber: run === 7 });
            const { job, upsert } = makeJob({ answer });
            await job.execute(DATA, BRIEF_NOW);
            rates.push(snapshotOf(upsert).passRatePct);
        }
        const bullets = PACK.facts.length;
        const passed = rates.reduce(
            (acc, rate) => acc + (rate / 100) * bullets,
            0,
        );
        const total = runs * bullets;

        expect(rates).toHaveLength(runs);
        expect((passed / total) * 100).toBeGreaterThanOrEqual(95);
        expect(rates.filter(rate => rate < 100)).toHaveLength(1);
    });
});

/**
 * Обзоры периода и прошлого периода: оба ставятся в ту же очередь и
 * ожидаются, чтобы числа сравнивались посчитанными одинаково.
 */
describe('BriefJobUseCase: обзоры периода и прошлого периода', () => {
    afterEach(() => {
        jest.useRealTimers();
    });

    it('обзоры обоих окон ставятся в очередь и ожидаются, факты пишутся в brief:prev до сборки пакета', async () => {
        const cached: Record<string, unknown> = {};
        const { job, dispatch, setJson, build } = makeJob({
            cached,
            finished: () => {
                cached[PREV_OVERVIEW_KEY] = {
                    status: 'ready',
                    data: prevOverview(),
                };
                return Promise.resolve(undefined);
            },
        });
        await job.execute(DATA, BRIEF_NOW);

        expect(dispatch).toHaveBeenCalledTimes(2);
        expect(dispatch).toHaveBeenCalledWith(
            QueueNames.SALES_KPI_REPORT,
            JobNames.SALES_AI_ANALYTICS_OVERVIEW,
            {
                domain: BRIEF_DOMAIN,
                from: BRIEF_PREV_FROM,
                to: BRIEF_PREV_TO,
                managerIds: [10, 20],
                confirmedOnly: false,
                forceRefresh: false,
                requestKey: PREV_OVERVIEW_KEY,
            },
            PREV_OVERVIEW_KEY,
            AI_BRIEF_OVERVIEW_JOB_OPTIONS,
        );
        // Обзор самого периода — с jobId = ключ кэша обзора: идущий расчёт
        // страницы подхватывается, второй не плодится.
        expect(dispatch).toHaveBeenCalledWith(
            QueueNames.SALES_KPI_REPORT,
            JobNames.SALES_AI_ANALYTICS_OVERVIEW,
            expect.objectContaining({
                from: BRIEF_FROM,
                to: BRIEF_TO,
                requestKey: OVERVIEW_KEY,
            }),
            OVERVIEW_KEY,
            AI_BRIEF_OVERVIEW_JOB_OPTIONS,
        );
        // Джоба резюме ждёт эти обзоры — приоритет пользовательский.
        expect(AI_BRIEF_OVERVIEW_JOB_OPTIONS.priority).toBe(1);
        expect(setJson).toHaveBeenCalledWith(
            PREV_KEY,
            extractPrevFacts(
                prevOverview(),
                { from: BRIEF_PREV_FROM, to: BRIEF_PREV_TO },
                ['10', '20'],
            ),
            AI_BRIEF_TTL_SECONDS.prev,
        );
        expect(AI_BRIEF_TTL_SECONDS.prev).toBe(24 * 60 * 60);
        expect(dispatch.mock.invocationCallOrder[0]).toBeLessThan(
            build.mock.invocationCallOrder[0],
        );
    });

    it('обзор периода и факты прошлого периода уже в кэше — очередь не трогается', async () => {
        const current = { status: 'ready', data: currentOverview() };
        const warm = makeJob({
            cached: {
                [OVERVIEW_KEY]: current,
                [PREV_KEY]: { ...NOT_READY, alerts: 1, sales: 2 },
            },
        });
        await warm.job.execute(DATA, BRIEF_NOW);
        expect(warm.dispatch).not.toHaveBeenCalled();

        const fromOverview = makeJob({
            cached: {
                [OVERVIEW_KEY]: current,
                [PREV_OVERVIEW_KEY]: { status: 'ready', data: prevOverview() },
            },
        });
        await fromOverview.job.execute(DATA, BRIEF_NOW);
        expect(fromOverview.dispatch).not.toHaveBeenCalled();
        expect(fromOverview.setJson).toHaveBeenCalledWith(
            PREV_KEY,
            expect.objectContaining({ alerts: 1, sales: 6 }),
            AI_BRIEF_TTL_SECONDS.prev,
        );
    });

    it('обзор по всему ростеру портала в кэше — свой обзор периметра не считается', async () => {
        const rosterKey = (from: string, to: string) =>
            buildOverviewKey(BRIEF_DOMAIN, from, to, '10_20_30', false);
        const withOther = (overview: ReturnType<typeof briefOverview>) => ({
            status: 'ready',
            data: briefOverview([
                ...overview.managers,
                briefOverviewRow('30', { riskCalls: 7, salesCount: 7 }),
            ]),
        });
        const { job, dispatch, setJson } = makeJob({
            cached: {
                [buildManagersKey(BRIEF_DOMAIN)]: [10, 20, 30],
                [rosterKey(BRIEF_FROM, BRIEF_TO)]: withOther(currentOverview()),
                [rosterKey(BRIEF_PREV_FROM, BRIEF_PREV_TO)]:
                    withOther(prevOverview()),
            },
        });
        await job.execute(DATA, BRIEF_NOW);

        expect(dispatch).not.toHaveBeenCalled();
        // Чужой менеджер 30 в факты прошлого периода не попал.
        expect(setJson).toHaveBeenCalledWith(
            PREV_KEY,
            expect.objectContaining({ alerts: 1, sales: 6 }),
            AI_BRIEF_TTL_SECONDS.prev,
        );
    });

    it('обзор не дождались: пометка «не готов» на 120 с, резюме собирается без сравнения', async () => {
        jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
        const { job, setJson, upsert } = makeJob({
            finished: () => new Promise(() => undefined),
        });
        const run = job.execute(DATA, BRIEF_NOW);
        for (let flush = 0; flush < 20; flush += 1) {
            await new Promise(resolve => setImmediate(resolve));
        }
        // Оба ожидания идут разом — общий потолок один, а не два подряд.
        await jest.advanceTimersByTimeAsync(AI_BRIEF_OVERVIEW_WAIT_MS + 1);
        const dto = await run;

        expect(setJson).toHaveBeenCalledWith(
            PREV_KEY,
            NOT_READY,
            AI_BRIEF_TTL_SECONDS.error,
        );
        expect(dto.source).toBe('llm');
        expect(snapshotOf(upsert).comparable).toBe(false);
    });

    it('обзор досчитался, пока джоба ждала с опозданием: после таймаута кэш читается ещё раз', async () => {
        jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
        const cached: Record<string, unknown> = {};
        const { job, setJson } = makeJob({
            cached,
            finished: () => new Promise(() => undefined),
        });
        const run = job.execute(DATA, BRIEF_NOW);
        for (let flush = 0; flush < 20; flush += 1) {
            await new Promise(resolve => setImmediate(resolve));
        }
        cached[PREV_OVERVIEW_KEY] = { status: 'ready', data: prevOverview() };
        await jest.advanceTimersByTimeAsync(AI_BRIEF_OVERVIEW_WAIT_MS + 1);
        await run;

        expect(setJson).toHaveBeenCalledWith(
            PREV_KEY,
            expect.objectContaining({ alerts: 1, sales: 6 }),
            AI_BRIEF_TTL_SECONDS.prev,
        );
    });

    it('без ростера в кэше пустой периметр не воспроизводит окно обзора — пометка «не готов»', async () => {
        const { job, dispatch, setJson } = makeJob();
        await job.execute(briefJobData({ managerIds: [] }), BRIEF_NOW);

        expect(dispatch).not.toHaveBeenCalled();
        expect(setJson).toHaveBeenCalledWith(
            buildBriefPrevKey(BRIEF_DOMAIN, BRIEF_PREV_FROM, BRIEF_PREV_TO, []),
            NOT_READY,
            AI_BRIEF_TTL_SECONDS.error,
        );
    });

    it('готовое резюме кладётся и под ключ пакета с прошлым периодом', async () => {
        const pack = briefPack([
            ...briefFacts(),
            briefFact(AI_BRIEF_FACT_CODES.airtime, 5400, { n: 40 }),
        ]);
        const { job, setJson } = makeJob({ pack });
        const dto = await job.execute(DATA, BRIEF_NOW);

        expect(pack.hash).not.toBe(DATA.packHash);
        expect(setJson).toHaveBeenCalledWith(
            DATA.requestKey,
            { status: 'ready', data: dto },
            AI_BRIEF_TTL_SECONDS.ready,
        );
        expect(setJson).toHaveBeenCalledWith(
            buildBriefKey(BRIEF_DOMAIN, pack.hash),
            { status: 'ready', data: dto },
            AI_BRIEF_TTL_SECONDS.ready,
        );
    });

    it('резюме такого же пакета уже в кэше — нейросеть второй раз не зовётся', async () => {
        const pack = briefPack([
            ...briefFacts(),
            briefFact(AI_BRIEF_FACT_CODES.airtime, 5400, { n: 40 }),
        ]);
        const packKey = buildBriefKey(BRIEF_DOMAIN, pack.hash);
        const ready = await makeJob({ pack }).job.execute(DATA, BRIEF_NOW);
        const cached = { [packKey]: { status: 'ready', data: ready } };
        const again = makeJob({ pack, cached });
        const dto = await again.job.execute(DATA, BRIEF_NOW);

        expect(dto).toEqual(ready);
        expect(again.complete).not.toHaveBeenCalled();
        expect(again.consume).not.toHaveBeenCalled();
        expect(again.upsert).not.toHaveBeenCalled();
        // Ответ ложится под ключ запроса; запись пакета не переписывается.
        expect(again.setJson).toHaveBeenCalledWith(
            DATA.requestKey,
            { status: 'ready', data: ready },
            AI_BRIEF_TTL_SECONDS.ready,
        );
        expect(again.setJson).not.toHaveBeenCalledWith(
            packKey,
            expect.anything(),
            expect.anything(),
        );
        expect(again.sendToClient).toHaveBeenCalledWith(
            'sock',
            expect.objectContaining({ event: 'ai-analytics:brief:done' }),
        );

        // Просили собрать заново — кэш пакета не берётся.
        const forced = makeJob({ pack, cached });
        await forced.job.execute(
            briefJobData({ forceRefresh: true }),
            BRIEF_NOW,
        );
        expect(forced.complete).toHaveBeenCalledTimes(1);

        // Конверт ошибки под ключом пакета готовым резюме не считается.
        const failed = makeJob({
            pack,
            cached: { [packKey]: { status: 'error', message: 'сбой' } },
        });
        await failed.job.execute(DATA, BRIEF_NOW);
        expect(failed.complete).toHaveBeenCalledTimes(1);
    });

    it('буллеты снапшота и DTO несут группу, ссылку и изменение факта', async () => {
        const pack = briefPack(
            [
                briefFact(AI_BRIEF_FACT_CODES.alerts, 68, {
                    n: 68,
                    prev: 31,
                    link: LINK,
                }),
                briefFact(AI_BRIEF_FACT_CODES.attention, 5, { n: 7 }),
            ],
            BRIEF_COMPARED,
        );
        const { job, upsert } = makeJob({
            pack,
            answer: llmAnswer(pack, { link: LINK }),
        });
        const dto = await job.execute(DATA, BRIEF_NOW);

        expect(dto.bullets[0]).toEqual({
            text: 'Сигналов риска за период: 68 (было 31)',
            group: 'change',
            link: LINK,
            delta: 37,
            factRefs: ['alerts'],
        });
        expect(dto.bullets[1].link).toBeNull();
        expect(dto.bullets[1].delta).toBeNull();
        expect(snapshotOf(upsert).bullets[0]).toEqual({
            text: 'Сигналов риска за период: 68 (было 31)',
            group: 'change',
            managerId: null,
            callType: null,
            link: LINK,
            factRefs: ['alerts'],
        });
    });
});

/**
 * Ретенция снапшота резюме (долг 40 волны C): ключ периода — период и
 * ростер, поэтому второе резюме того же периода и состава замещает первое
 * (`superseded`), а другой состав — отдельная запись. Проверяется
 * реальным стором над `ais` в памяти.
 */
describe('BriefJobUseCase: ретенция снапшота ai-analytics-brief', () => {
    /** Пакет с другими фактами — другой packHash за тот же период. */
    const otherPack = () =>
        briefPack([
            ...briefFacts(),
            briefFact(AI_BRIEF_FACT_CODES.airtime, 5400, { n: 40 }),
        ]);

    it('второе резюме того же периода и ростера помечает первое superseded', async () => {
        const { store, rows } = inMemoryStore();
        const first = makeJob({ store });
        const second = makeJob({ store, pack: otherPack() });

        await first.job.execute(DATA, BRIEF_NOW);
        await second.job.execute(
            briefJobData({ packHash: otherPack().hash }),
            BRIEF_NOW,
        );

        expect(otherPack().hash).not.toBe(PACK.hash);
        expect(rows).toHaveLength(2);
        expect(rows.map(row => row.activity_id)).toEqual([
            '2026-09-01_2026-09-07_10_20',
            '2026-09-01_2026-09-07_10_20',
        ]);
        expect(rows.map(row => row.status)).toEqual(['superseded', 'done']);
        const active = await store.findByKeys(
            BRIEF_DOMAIN,
            'ai-analytics-brief',
            {
                periodKeys: ['2026-09-01_2026-09-07_10_20'],
            },
        );
        expect(active).toHaveLength(1);
        expect((active[0].payload as BriefSnapshot).packHash).toBe(
            otherPack().hash,
        );
    });

    it('тот же пакет повторно — записи не добавляет (идемпотентный upsert)', async () => {
        const { store, rows } = inMemoryStore();
        const job = makeJob({ store });

        await job.job.execute(DATA, BRIEF_NOW);
        await job.job.execute(DATA, BRIEF_NOW);

        expect(rows).toHaveLength(1);
        expect(rows[0].status).toBe('done');
    });

    it('другой ростер того же периода — отдельная запись, первая не замещается', async () => {
        const { store, rows } = inMemoryStore();
        const department = makeJob({ store });
        const single = makeJob({ store, pack: otherPack() });

        await department.job.execute(DATA, BRIEF_NOW);
        await single.job.execute(
            briefJobData({ managerIds: [10], packHash: otherPack().hash }),
            BRIEF_NOW,
        );

        expect(rows.map(row => row.activity_id)).toEqual([
            '2026-09-01_2026-09-07_10_20',
            '2026-09-01_2026-09-07_10',
        ]);
        expect(rows.map(row => row.status)).toEqual(['done', 'done']);
    });
});
