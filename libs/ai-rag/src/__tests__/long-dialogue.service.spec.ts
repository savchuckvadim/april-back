import { ConfigService } from '@nestjs/config';
import { AIMessage, BaseMessage } from '@langchain/core/messages';
import { Document } from '@langchain/core/documents';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { BaseRetrieverInterface } from '@langchain/core/retrievers';
import { LongDialogueService } from '../application/long-dialogue.service';
import {
    SHORT_RAG_QUERY,
    TRANSCRIPT_CHAR_THRESHOLD,
} from '../domain/prompts/long-dialogue.prompts';

function makeConfig(value?: string): ConfigService {
    return {
        get: jest.fn().mockReturnValue(value),
    } as unknown as ConfigService;
}

function makeService(envValue?: string): LongDialogueService {
    return new LongDialogueService(makeConfig(envValue));
}

interface InvokeMock {
    invoke: jest.Mock<Promise<BaseMessage>, [BaseMessage[]]>;
}

function makeLlm(answers: string[]): BaseChatModel & InvokeMock {
    const invoke = jest.fn();
    answers.forEach(answer => {
        invoke.mockResolvedValueOnce(new AIMessage(answer));
    });
    return { invoke } as unknown as BaseChatModel & InvokeMock;
}

function makeRetriever(docs: Document[]): BaseRetrieverInterface & {
    invoke: jest.Mock<Promise<Document[]>, [string]>;
} {
    return {
        invoke: jest.fn().mockResolvedValue(docs),
    } as unknown as BaseRetrieverInterface & {
        invoke: jest.Mock<Promise<Document[]>, [string]>;
    };
}

describe('LongDialogueService', () => {
    describe('needsChunkedProcessing', () => {
        const service = makeService();

        it('false для пустой строки', () => {
            expect(service.needsChunkedProcessing('')).toBe(false);
        });

        it('false для короткого транскрипта', () => {
            const shortText = 'a'.repeat(TRANSCRIPT_CHAR_THRESHOLD);
            expect(service.needsChunkedProcessing(shortText)).toBe(false);
        });

        it('true когда длина превышает порог', () => {
            const longText = 'a'.repeat(TRANSCRIPT_CHAR_THRESHOLD + 1);
            expect(service.needsChunkedProcessing(longText)).toBe(true);
        });

        it('учитывает только trim-длину', () => {
            const padded = '   '.repeat(100) + 'короткое' + '   '.repeat(100);
            expect(service.needsChunkedProcessing(padded)).toBe(false);
        });

        it('читает порог из env GIGACHAT_CHUNK_TRANSCRIPT_OVER_CHARS', () => {
            const tight = makeService('50');
            expect(tight.needsChunkedProcessing('a'.repeat(40))).toBe(false);
            expect(tight.needsChunkedProcessing('a'.repeat(60))).toBe(true);
        });

        it('игнорирует невалидное значение env (fallback на дефолт)', () => {
            const broken = makeService('not-a-number');
            expect(
                broken.needsChunkedProcessing(
                    'a'.repeat(TRANSCRIPT_CHAR_THRESHOLD + 1),
                ),
            ).toBe(true);
        });
    });

    describe('segmentTranscript', () => {
        const service = makeService();

        it('возвращает текст целиком если короткий', () => {
            expect(service.segmentTranscript('hello world', 100)).toEqual([
                'hello world',
            ]);
        });

        it('режет длинный текст на несколько кусков', () => {
            const text = 'a'.repeat(5000);
            const chunks = service.segmentTranscript(text, 1000, 100);
            expect(chunks.length).toBeGreaterThan(1);
            for (const chunk of chunks) {
                expect(chunk.length).toBeLessThanOrEqual(1000);
            }
        });

        it('склеенные куски покрывают исходный текст', () => {
            const text = 'a'.repeat(5000);
            const chunks = service.segmentTranscript(text, 1000, 100);
            // overlap гарантирует общую длину >= исходной
            const totalLen = chunks.reduce((sum, c) => sum + c.length, 0);
            expect(totalLen).toBeGreaterThanOrEqual(text.length);
        });

        it('режет по границе \\n когда возможно', () => {
            const head = 'a'.repeat(700);
            const tail = 'b'.repeat(700);
            const text = `${head}\n${tail}`;
            const chunks = service.segmentTranscript(text, 1000, 50);
            // первый кусок должен оборваться на \n (без хвоста b)
            expect(chunks[0]).not.toContain('b');
        });
    });

    describe('runResume', () => {
        const longTranscript = (
            'Менеджер: Здравствуйте, это компания ГАРАНТ. ' +
            'Клиент: А вы по какому вопросу? '
        ).repeat(200);

        it('вызывает retriever КОРОТКИМ фиксированным запросом (без лимита эмбеддингов)', async () => {
            const service = makeService();
            const retriever = makeRetriever([
                new Document({ pageContent: 'doc-1' }),
            ]);
            const llm = makeLlm(
                Array.from({ length: 20 }, (_, i) => `block-${i}`),
            );

            await service.runResume(longTranscript, llm, retriever);

            expect(retriever.invoke).toHaveBeenCalledTimes(1);
            expect(retriever.invoke).toHaveBeenCalledWith(SHORT_RAG_QUERY);
        });

        it('делает N+2 вызова llm: блоки + агрегация + финал', async () => {
            const service = makeService();
            const retriever = makeRetriever([
                new Document({ pageContent: 'doc-1' }),
            ]);
            const llm = makeLlm(
                Array.from({ length: 20 }, (_, i) => `text-${i}`),
            );

            const segments = service.segmentTranscript(longTranscript);
            await service.runResume(longTranscript, llm, retriever);

            expect(llm.invoke).toHaveBeenCalledTimes(segments.length + 2);
        });

        it('возвращает результат последнего (финального) llm-вызова', async () => {
            const service = makeService();
            const retriever = makeRetriever([
                new Document({ pageContent: 'doc-1' }),
            ]);
            const segments = makeService().segmentTranscript(longTranscript);
            const answers = [
                ...Array.from(
                    { length: segments.length },
                    (_, i) => `block-${i}`,
                ),
                'aggregated-text',
                'final-resume',
            ];
            const llm = makeLlm(answers);

            const result = await service.runResume(
                longTranscript,
                llm,
                retriever,
            );
            expect(result).toBe('final-resume');
        });
    });

    describe('runRecommendation', () => {
        const longTranscript = 'абв '.repeat(2000);

        it('возвращает результат последнего llm-вызова', async () => {
            const service = makeService();
            const retriever = makeRetriever([
                new Document({ pageContent: 'doc-x' }),
            ]);
            const segments = service.segmentTranscript(longTranscript);
            const answers = [
                ...Array.from(
                    { length: segments.length },
                    (_, i) => `block-${i}`,
                ),
                'aggregated-recs',
                'final-recomendation',
            ];
            const llm = makeLlm(answers);

            const result = await service.runRecommendation(
                longTranscript,
                llm,
                retriever,
            );
            expect(result).toBe('final-recomendation');
        });
    });
});
