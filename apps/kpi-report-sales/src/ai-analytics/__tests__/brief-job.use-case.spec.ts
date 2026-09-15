import { Logger } from '@nestjs/common';
import {
    AI_BRIEF_LIMITS,
    AI_BRIEF_TEMPLATE_REASONS,
    type AiBriefFact,
    type AiEvidencePack,
} from '@lib/sales-ai-analytics';
import type { AiBriefLlmResult } from '../brief/ai-brief-llm.port';
import {
    AI_BRIEF_TEMPLATE_REASON_TEXTS,
    AI_BRIEF_TTL_SECONDS,
} from '../constants/ai-brief.const';
import { BriefJobUseCase } from '../domain/use-cases/brief-job.use-case';
import type { BriefSnapshot } from '@lib/sales-ai-analytics';
import {
    BRIEF_DOMAIN,
    BRIEF_NOW,
    briefJobData,
    briefPack,
} from './fixtures/brief.fixture';
import { settingsLoaderWith } from './fixtures/lite-row.fixture';

const PACK = briefPack();
const DATA = briefJobData();

/** Ответ модели: по буллету на факт пакета, числа — из фраз фактов. */
function llmAnswer(
    pack: AiEvidencePack,
    options: { alienNumber?: boolean; bullets?: number } = {},
): AiBriefLlmResult {
    const facts = pack.facts.slice(0, options.bullets ?? pack.facts.length);
    const bullets = facts.map((fact: AiBriefFact, index: number) => ({
        text:
            options.alienNumber && index === 0
                ? 'Продажи выросли на 777 процентов за период'
                : fact.text,
        factRefs: [fact.code],
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
}

function makeJob({
    pack = PACK,
    apiKey = 'vibe-key',
    quotaAllowed = true,
    pricePerThousand = 2,
    quotaLimit = 5,
    answer,
    llmError,
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
    const sendToClient = jest.fn();
    const job = new BriefJobUseCase(
        { build } as never,
        { load } as never,
        settingsLoaderWith({}),
        { consume } as never,
        { resolveKey, complete },
        { upsert } as never,
        { setJson } as never,
        { sendToClient } as never,
    );

    return {
        job,
        build,
        consume,
        complete,
        resolveKey,
        upsert,
        setJson,
        sendToClient,
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
        expect(dto.bullets).toHaveLength(PACK.facts.length);
        expect(dto.packHash).toBe(PACK.hash);
        expect(dto.reason).toBeNull();
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
        expect(upsert).toHaveBeenCalledWith(
            expect.objectContaining({
                type: 'ai-analytics-brief',
                periodKey: PACK.hash,
                managerId: null,
                inputsHash: PACK.hash,
                paramsVersion: 'pv-1',
            }),
        );
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
        expect(dto.bullets).toHaveLength(PACK.facts.length - 1);
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
            // Один прогон из двадцати несёт буллет с чужим числом — он
            // обязан быть отброшен, остальные проходят целиком.
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
