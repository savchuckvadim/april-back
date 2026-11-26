import { Logger } from '@nestjs/common';
import {
    AFTER_PRESENTATION_CLOSING_RULE,
    AFTER_PRESENTATION_STRICT_BLOCK,
} from '../contracts/call-deep-analysis.contract';
import {
    FOCUS_CLOSING_SCHEMA,
    FOCUS_CONTENT_SCHEMA,
} from '../contracts/call-focus-analysis.contract';
import { CallFocusAnalysisService } from '../services/call-focus-analysis.service';
import { noLongCall } from './call-long-input.fake';

/**
 * Фокус-разбор с цитатами (focus-v3.4): включается опцией запуска (проверка
 * разбора на звонке) или выключателем; без опции — прежнее задание.
 */

const USAGE = { promptTokens: 100, completionTokens: 20, totalTokens: 120 };

const makeDeps = (options?: {
    responses?: Record<string, Record<string, unknown> | Error>;
    withCheckPresentation?: boolean;
}) => {
    const responses = options?.responses ?? {};
    const llm = {
        structuredCompletionWithUsage: jest.fn(
            (_system: string, _user: string, schemaName: string) => {
                const answer = responses[schemaName];
                if (answer instanceof Error) return Promise.reject(answer);
                return Promise.resolve({
                    result: answer ?? { sections: [] },
                    usage: USAGE,
                    model: 'bitrix/bitrixgpt-5.5',
                });
            },
        ),
        reportExhausted: jest.fn().mockResolvedValue(undefined),
    };
    const materials = {
        collect: jest
            .fn()
            .mockImplementation(
                (_domain: string, requests: { kind: string }[]) =>
                    Promise.resolve(
                        requests.map(request => ({
                            kind: request.kind,
                            text: '',
                            chars: 0,
                            truncated: false,
                        })),
                    ),
            ),
    };
    const service = new CallFocusAnalysisService(
        llm as never,
        materials as never,
        { resolve: jest.fn().mockResolvedValue({ types: {} }) } as never,
        {
            resolve: jest.fn().mockResolvedValue({
                withCheckPresentation: options?.withCheckPresentation ?? false,
            }),
        } as never,
        {
            resolve: jest
                .fn()
                .mockResolvedValue({ presentationStrictness: 'strict' }),
        } as never,
        { resolve: jest.fn().mockResolvedValue(null) } as never,
        noLongCall() as never,
    );
    return { service, llm };
};

/** Вызов прохода по имени схемы: системный текст и схема. */
const callOf = (
    llm: ReturnType<typeof makeDeps>['llm'],
    schemaName: string,
): { system: string; schema: Record<string, unknown> } => {
    const call = llm.structuredCompletionWithUsage.mock.calls.find(
        args => args[2] === schemaName,
    ) as unknown[] | undefined;
    if (!call) throw new Error(`не было вызова ${schemaName}`);
    return {
        system: call[0] as string,
        schema: call[3] as Record<string, unknown>,
    };
};

const propertyKeys = (schema: Record<string, unknown>): string[] =>
    Object.keys(schema.properties as Record<string, unknown>);

describe('CallFocusAnalysisService — задание с цитатами', () => {
    beforeEach(() => {
        jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
        jest.spyOn(Logger.prototype, 'warn').mockImplementation(
            () => undefined,
        );
    });

    afterEach(() => jest.restoreAllMocks());

    it('без опции — прежнее задание: схемы те же объекты, блока цитат нет', async () => {
        const { service, llm } = makeDeps();
        await service.run('test.bitrix24.ru', 'текст', 'presentation');

        expect(callOf(llm, 'call_focus_content').schema).toBe(
            FOCUS_CONTENT_SCHEMA,
        );
        expect(callOf(llm, 'call_focus_closing').schema).toBe(
            FOCUS_CLOSING_SCHEMA,
        );
        expect(callOf(llm, 'call_focus_form').system).not.toContain(
            'ЦИТАТЫ И ВРЕМЯ',
        );
    });

    it('с цитатами: потребности needItems → needs собирает код, у разделов цитата и секунда', async () => {
        const { service, llm } = makeDeps({
            responses: {
                call_focus_content: {
                    sections: [
                        {
                            section: 'NEEDS',
                            relevance: 100,
                            score: 6,
                            asWas: 'Спросил про задачи бухгалтерии',
                            quote: 'а какие задачи у бухгалтерии сейчас',
                            startSec: 95,
                        },
                    ],
                    needsFound: true,
                    needItems: [
                        {
                            need: 'Следить за НДС',
                            quote: 'нам важно не пропустить изменения по НДС',
                            startSec: 120,
                        },
                        {
                            need: ' Шаблоны договоров ',
                            quote: null,
                            startSec: null,
                        },
                    ],
                },
            },
        });
        const dto = await service.run(
            'test.bitrix24.ru',
            'текст',
            'presentation',
            undefined,
            { quoteEvidence: true },
        );

        expect(dto?.needs).toEqual(['Следить за НДС', 'Шаблоны договоров']);
        expect(dto?.needItems).toHaveLength(2);
        expect(dto?.sections?.[0]).toMatchObject({
            quote: 'а какие задачи у бухгалтерии сейчас',
            startSec: 95,
        });
        expect(
            propertyKeys(callOf(llm, 'call_focus_content').schema),
        ).toContain('needItems');
        expect(callOf(llm, 'call_focus_form').system).toContain(
            'ЦИТАТЫ И ВРЕМЯ',
        );
    });

    it('с цитатами: «хвост» и 5К с местами пунктов — у презентации, у доработки их в задании нет', async () => {
        const presentation = makeDeps();
        await presentation.service.run(
            'test.bitrix24.ru',
            'текст',
            'presentation',
            undefined,
            { quoteEvidence: true },
        );
        expect(
            propertyKeys(callOf(presentation.llm, 'call_focus_closing').schema),
        ).toEqual(expect.arrayContaining(['hvostSteps', 'hvostEvidence']));

        const refine = makeDeps();
        await refine.service.run(
            'test.bitrix24.ru',
            'текст',
            'refine',
            undefined,
            {
                quoteEvidence: true,
            },
        );
        const closing = callOf(refine.llm, 'call_focus_closing');
        expect(
            propertyKeys(closing.schema).filter(key => /hvost|fiveK/.test(key)),
        ).toEqual([]);
    });

    it('обязательная отчётность с цитатами: у решения — правило закрытия без «хвоста» и 5К, у презентации — весь блок, без цитат — прежний блок', async () => {
        const run = async (
            callType: string,
            quoteEvidence?: boolean,
        ): Promise<string> => {
            const deps = makeDeps({ withCheckPresentation: true });
            await deps.service.run(
                'test.bitrix24.ru',
                'текст',
                callType,
                undefined,
                quoteEvidence === undefined ? undefined : { quoteEvidence },
            );
            return callOf(deps.llm, 'call_focus_form').system;
        };

        const decision = await run('decision', true);
        expect(decision).toContain(AFTER_PRESENTATION_CLOSING_RULE);
        expect(decision).not.toContain('«хвост»');
        expect(decision).not.toContain('5К');

        expect(await run('presentation', true)).toContain(
            AFTER_PRESENTATION_STRICT_BLOCK,
        );
        expect(await run('decision')).toContain(
            AFTER_PRESENTATION_STRICT_BLOCK,
        );
        expect(await run('refine', true)).not.toContain(
            'ОБЯЗАТЕЛЬНАЯ ОТЧЁТНОСТЬ ПОСЛЕ ПРЕЗЕНТАЦИИ',
        );
    });

    it('с цитатами разбор помнит тип, по которому строилось задание; без цитат — нет', async () => {
        const quoted = await makeDeps().service.run(
            'test.bitrix24.ru',
            'текст',
            'refine',
            undefined,
            { quoteEvidence: true },
        );
        expect(quoted?.taskCallType).toBe('refine');

        const legacy = await makeDeps().service.run(
            'test.bitrix24.ru',
            'текст',
            'refine',
        );
        expect(legacy?.taskCallType).toBeUndefined();
    });

    it('неполный разбор с цитатами сохраняет проходы с версией 3.6 — догон прежней версии их не возьмёт', async () => {
        const { service } = makeDeps({
            responses: { call_focus_closing: new Error('negodny JSON') },
        });
        const dto = await service.run(
            'test.bitrix24.ru',
            'текст',
            'presentation',
            undefined,
            { quoteEvidence: true },
        );
        const stored = dto?.extra?.focusPasses as { promptVersion: string };
        expect(stored.promptVersion).toBe('focus-v3.6-2026-11-26');
    });
});
