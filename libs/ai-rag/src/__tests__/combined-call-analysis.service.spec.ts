import {
    CombinedCallAnalysisService,
    parseCombinedAnalysis,
} from '../application/combined-call-analysis.service';
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
