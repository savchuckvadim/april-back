import {
    AI_BRIEF_JSON_SCHEMA,
    AI_BRIEF_PROMPT_VERSION,
    AI_BRIEF_SCHEMA_NAME,
    packJson,
} from '@lib/sales-ai-analytics';
import {
    buildUserContent,
    VibeCodeBriefAdapter,
} from '../brief/vibecode-brief.adapter';
import { AI_BRIEF_SYSTEM_PROMPT } from '../constants/ai-brief.const';
import { BRIEF_DOMAIN, briefPack } from './fixtures/brief.fixture';

const PACK = briefPack();

function makeAdapter(options: { key?: string; keyError?: Error } = {}) {
    const structuredCompletionWithUsage = jest.fn().mockResolvedValue({
        result: { headline: 'Итоги', tone: 'calm', bullets: [] },
        usage: {
            promptTokens: 700,
            completionTokens: 300,
            totalTokens: 1000,
        },
        model: 'bitrix/bitrixgpt-5.5',
    });
    const resolve = jest.fn(() =>
        options.keyError
            ? Promise.reject(options.keyError)
            : Promise.resolve(options.key ?? 'vibe-key'),
    );
    const adapter = new VibeCodeBriefAdapter(
        { structuredCompletionWithUsage } as never,
        { resolve } as never,
    );

    return { adapter, structuredCompletionWithUsage, resolve };
}

describe('VibeCodeBriefAdapter: порт модели резюме', () => {
    it('ключ портала отдаётся резолвером', async () => {
        const { adapter, resolve } = makeAdapter({ key: 'portal-key' });

        await expect(adapter.resolveKey(BRIEF_DOMAIN)).resolves.toBe(
            'portal-key',
        );
        expect(resolve).toHaveBeenCalledWith(BRIEF_DOMAIN);
    });

    it('портал без ключа: null вместо исключения (резюме уйдёт в шаблон)', async () => {
        const { adapter } = makeAdapter({
            keyError: new Error('VibeCode-ключ не заведён'),
        });

        await expect(adapter.resolveKey(BRIEF_DOMAIN)).resolves.toBeNull();
    });

    it('вызов идёт строгой схемой резюме с ключом портала', async () => {
        const { adapter, structuredCompletionWithUsage } = makeAdapter();
        const result = await adapter.complete(PACK, 'portal-key');

        expect(structuredCompletionWithUsage).toHaveBeenCalledWith(
            AI_BRIEF_SYSTEM_PROMPT,
            buildUserContent(PACK),
            AI_BRIEF_SCHEMA_NAME,
            AI_BRIEF_JSON_SCHEMA,
            'portal-key',
        );
        expect(result.payload).toEqual({
            headline: 'Итоги',
            tone: 'calm',
            bullets: [],
        });
    });

    it('расход вызова: токены провайдера, модель и длины текстов', async () => {
        const { adapter } = makeAdapter();
        const { usage } = await adapter.complete(PACK, 'portal-key');
        const content = buildUserContent(PACK);

        expect(usage.totalTokens).toBe(1000);
        expect(usage.model).toBe('bitrix/bitrixgpt-5.5');
        expect(usage.promptChars).toBe(
            AI_BRIEF_SYSTEM_PROMPT.length + content.length,
        );
        expect(usage.completionChars).toBe(
            JSON.stringify({ headline: 'Итоги', tone: 'calm', bullets: [] })
                .length,
        );
    });

    it('в модель уходят версия промпта, коды фактов и канонический JSON пакета', () => {
        const content = buildUserContent(PACK);

        expect(content).toContain(AI_BRIEF_PROMPT_VERSION);
        expect(content).toContain(PACK.hash);
        expect(content).toContain(packJson(PACK.facts));
        for (const fact of PACK.facts) {
            expect(content).toContain(`[${fact.code}] ${fact.text}`);
        }
    });
});
