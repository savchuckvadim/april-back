import {
    CombinedCallAnalysisService,
    MAX_CONTEXT_DOCS_PER_KIND,
    parseCombinedAnalysis,
} from '../application/combined-call-analysis.service';
import {
    RETRIEVAL_QUERY_MAX_CHARS,
    RETRIEVAL_QUERY_MAX_WINDOWS,
} from '../application/retrieval-query.util';
import {
    COMBINED_RECOMENDATION_MARKER,
    COMBINED_RESUME_MARKER,
} from '../domain/prompts/prompts';

describe('parseCombinedAnalysis', () => {
    it('разрезает ответ с маркерами на резюме и рекомендации', () => {
        const text =
            `${COMBINED_RESUME_MARKER}\nЯ провёл презентацию.\n` +
            `${COMBINED_RECOMENDATION_MARKER}\nСтоит задавать больше вопросов.`;
        expect(parseCombinedAnalysis(text)).toEqual({
            resume: 'Я провёл презентацию.',
            recomendation: 'Стоит задавать больше вопросов.',
        });
    });

    it('терпит текст до первого маркера', () => {
        const text =
            `Вот анализ:\n${COMBINED_RESUME_MARKER}\nРезюме.\n` +
            `${COMBINED_RECOMENDATION_MARKER}\nРекомендация.`;
        expect(parseCombinedAnalysis(text)).toEqual({
            resume: 'Резюме.',
            recomendation: 'Рекомендация.',
        });
    });

    it.each([
        ['нет маркеров', 'просто текст'],
        ['нет секции рекомендаций', `${COMBINED_RESUME_MARKER}\nРезюме.`],
        [
            'маркеры в обратном порядке',
            `${COMBINED_RECOMENDATION_MARKER}\nР.\n${COMBINED_RESUME_MARKER}\nС.`,
        ],
        [
            'пустая секция',
            `${COMBINED_RESUME_MARKER}\n${COMBINED_RECOMENDATION_MARKER}\nР.`,
        ],
    ])('%s → null', (_label, text) => {
        expect(parseCombinedAnalysis(text)).toBeNull();
    });
});

describe('CombinedCallAnalysisService', () => {
    const makeRetriever = (contents: string[]) => ({
        invoke: jest
            .fn()
            .mockResolvedValue(contents.map(pageContent => ({ pageContent }))),
    });

    it('собирает контексты обоих kind и парсит ответ LLM', async () => {
        const service = new CombinedCallAnalysisService();
        const llm = {
            invoke: jest.fn().mockResolvedValue({
                content:
                    `${COMBINED_RESUME_MARKER}\nРезюме.\n` +
                    `${COMBINED_RECOMENDATION_MARKER}\nРекомендация.`,
            }),
        };
        const retrievers = {
            resume: makeRetriever(['скрипт продаж']),
            recomendation: makeRetriever(['методология оценки']),
        };

        const result = await service.run({
            llm: llm as never,
            getRetriever: kind => Promise.resolve(retrievers[kind] as never),
            transcript: 'текст звонка',
        });

        expect(result).toEqual({
            resume: 'Резюме.',
            recomendation: 'Рекомендация.',
        });
        const [messages] = llm.invoke.mock.calls[0] as [{ content: string }[]];
        expect(messages[0].content).toContain('скрипт продаж');
        expect(messages[0].content).toContain('методология оценки');
        expect(messages[1].content).toBe('текст звонка');
    });

    it('недоступный ретривер одного kind не роняет анализ', async () => {
        const service = new CombinedCallAnalysisService();
        const llm = {
            invoke: jest.fn().mockResolvedValue({
                content:
                    `${COMBINED_RESUME_MARKER}\nР.\n` +
                    `${COMBINED_RECOMENDATION_MARKER}\nС.`,
            }),
        };
        const result = await service.run({
            llm: llm as never,
            getRetriever: kind =>
                kind === 'resume'
                    ? Promise.resolve(makeRetriever(['docs']) as never)
                    : Promise.reject(new Error('нет материалов')),
            transcript: 'текст',
        });
        expect(result).toEqual({ resume: 'Р.', recomendation: 'С.' });
    });

    it('длинный транскрипт уходит в ретривер окнами по лимиту эмбеддингов', async () => {
        const service = new CombinedCallAnalysisService();
        const llm = {
            invoke: jest.fn().mockResolvedValue({
                content:
                    `${COMBINED_RESUME_MARKER}\nР.\n` +
                    `${COMBINED_RECOMENDATION_MARKER}\nС.`,
            }),
        };
        // ≈ 9 тыс. символов — на проде 14.09.2026 такой транскрипт давал
        // «Tokens limit exceeded … 2321 (max 514)».
        const transcript = Array.from(
            { length: 90 },
            (_, i) =>
                `Реплика номер ${i} про потребность клиента и условия поставки.`,
        ).join(' ');
        const retriever = {
            invoke: jest.fn((query: string) =>
                Promise.resolve([
                    { pageContent: `общий документ` },
                    { pageContent: `документ для «${query.slice(0, 12)}»` },
                ]),
            ),
        };

        await service.run({
            llm: llm as never,
            getRetriever: () => Promise.resolve(retriever as never),
            transcript,
        });

        const queries = retriever.invoke.mock.calls.map(([query]) => query);
        // Два kind × окна: каждый вызов короче лимита, окон не больше шести на kind.
        expect(queries.length).toBeGreaterThan(2);
        expect(queries.length).toBeLessThanOrEqual(
            2 * RETRIEVAL_QUERY_MAX_WINDOWS,
        );
        for (const query of queries) {
            expect(query.length).toBeLessThanOrEqual(RETRIEVAL_QUERY_MAX_CHARS);
        }
        // Первое окно начинается с начала разговора, последнее — концом.
        expect(queries[0].startsWith('Реплика номер 0 ')).toBe(true);
        expect(
            queries[queries.length - 1].endsWith(
                'номер 89 про потребность клиента и условия поставки.',
            ),
        ).toBe(true);

        // Контекст: дубли схлопнуты, потолок документов на kind соблюдён.
        const [messages] = llm.invoke.mock.calls[0] as [{ content: string }[]];
        const context = messages[0].content;
        expect(context.split('общий документ').length - 1).toBe(1);
        const fragments = context.split('\n\n---\n\n');
        expect(fragments.length).toBeLessThanOrEqual(
            2 * MAX_CONTEXT_DOCS_PER_KIND,
        );
        // Транскрипт в LLM уходит целиком — режется только запрос к ретриверу.
        expect(messages[1].content).toBe(transcript);
    });

    it('ответ без маркеров — исключение (сигнал провайдеру на fallback)', async () => {
        const service = new CombinedCallAnalysisService();
        const llm = {
            invoke: jest.fn().mockResolvedValue({ content: 'без маркеров' }),
        };
        await expect(
            service.run({
                llm: llm as never,
                getRetriever: () => Promise.resolve(makeRetriever([]) as never),
                transcript: 'текст',
            }),
        ).rejects.toThrow('без маркеров секций');
    });
});
