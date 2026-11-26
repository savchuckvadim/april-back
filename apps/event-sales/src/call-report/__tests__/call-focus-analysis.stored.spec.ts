import { Logger } from '@nestjs/common';
import { POLYANSKY_METHODOLOGY, type ResolvedMethodology } from '@lib/call-lib';
import { CALL_REPORT_PROMPT_VERSION } from '../contracts/call-report-versions.const';
import { CallFocusAnalysisService } from '../services/call-focus-analysis.service';
import { noLongCall } from './call-long-input.fake';
import {
    usableStoredFocusPasses,
    type StoredFocusPasses,
} from '../services/call-focus-stored.util';

/**
 * 16.11.2026: неполный разбор уносит ответы выживших проходов, догон зовёт
 * только недостающее — два вызова модели вместо всех. С 17.11.2026
 * фокус-проходов четыре: form, content, movement, closing.
 */
const DOMAIN = 'test.bitrix24.ru';
const USAGE = { promptTokens: 100, completionTokens: 20, totalTokens: 120 };

const focusResult = (overrides?: Record<string, unknown>) => ({
    sections: [],
    ...overrides,
});

type FocusAnswer = Record<string, unknown> | Error;

function makeService(options?: {
    responses?: Record<string, FocusAnswer>;
    methodology?: ResolvedMethodology | null;
}) {
    const responses = options?.responses ?? {};
    const llm = {
        structuredCompletionWithUsage: jest.fn(
            (
                _system: string,
                _user: string,
                schemaName: string,
            ): Promise<unknown> => {
                const answer = responses[schemaName];
                if (answer instanceof Error) return Promise.reject(answer);
                return Promise.resolve({
                    result: answer ?? focusResult(),
                    usage: USAGE,
                    model: 'bitrix/bitrixgpt-5.5',
                });
            },
        ),
        reportExhausted: jest.fn().mockResolvedValue(undefined),
    };
    const materials = {
        collect: jest.fn((_domain: string, requests: { kind: string }[]) =>
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
            resolve: jest
                .fn()
                .mockResolvedValue({ withCheckPresentation: false }),
        } as never,
        {
            resolve: jest
                .fn()
                .mockResolvedValue({ presentationStrictness: 'strict' }),
        } as never,
        {
            resolve: jest.fn().mockResolvedValue(options?.methodology ?? null),
        } as never,
        noLongCall() as never,
    );
    /** Имена схем вызовов модели по порядку. */
    const schemas = (): unknown[] =>
        (llm.structuredCompletionWithUsage.mock.calls as unknown[][]).map(
            call => call[2],
        );
    return { service, llm, schemas };
}

const storedOf = (
    passes: StoredFocusPasses['passes'],
    methodology?: StoredFocusPasses['methodology'],
): StoredFocusPasses => ({
    promptVersion: CALL_REPORT_PROMPT_VERSION,
    passes,
    ...(methodology ? { methodology } : {}),
});

describe('CallFocusAnalysisService: сохранённые проходы неполного разбора', () => {
    beforeEach(() => {
        jest.spyOn(Logger.prototype, 'warn').mockImplementation(
            () => undefined,
        );
        jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    });
    afterEach(() => jest.restoreAllMocks());

    it('неполный разбор несёт ответы выживших проходов и версию промпта; полный — нет', async () => {
        const partial = makeService({
            responses: {
                call_focus_form: focusResult({ sentiment: 'neutral' }),
                call_focus_movement: new Error('down'),
                call_focus_synthesis: { summary: 'Итог', score: 5 },
            },
        });
        const dto = await partial.service.run(DOMAIN, 'текст', 'call');

        expect(dto?.incompleteParts).toEqual(['movement']);
        // Три выживших прохода из четырёх: «закрытие» среди них.
        expect(dto?.extra?.focusPasses).toEqual(
            storedOf({
                form: focusResult({ sentiment: 'neutral' }),
                content: focusResult(),
                closing: focusResult(),
            }),
        );

        const full = makeService({
            responses: { call_focus_synthesis: { summary: 'Итог', score: 5 } },
        });
        const complete = await full.service.run(DOMAIN, 'текст', 'call');
        expect(complete?.incompleteParts).toEqual([]);
        expect(complete?.extra).toBeUndefined();
    });

    it('догон с сохранёнными form, content, movement: зовутся только closing и синтез, расход — только за них', async () => {
        const { service, schemas } = makeService({
            responses: {
                call_focus_closing: focusResult({ dealProgress: 4 }),
                call_focus_synthesis: { summary: 'Итог', score: 7 },
            },
        });

        const dto = await service.run(DOMAIN, 'текст', 'call', undefined, {
            stored: storedOf({
                form: focusResult({ sentiment: 'neutral' }),
                content: focusResult({ needsFound: true }),
                movement: focusResult({ priceDiscussed: true }),
            }),
        });

        expect(schemas()).toEqual([
            'call_focus_closing',
            'call_focus_synthesis',
        ]);
        expect(dto).toMatchObject({
            sentiment: 'neutral',
            needsFound: true,
            priceDiscussed: true,
            dealProgress: 4,
            score: 7,
            incompleteParts: [],
        });
        expect(dto?.usage).toMatchObject({ tokens: 240, calls: 2 });
        expect(dto?.extra).toBeUndefined();
    });

    it('догон с сохранёнными form, content, closing: зовутся только movement и синтез', async () => {
        const { service, schemas } = makeService({
            responses: {
                call_focus_movement: focusResult({ priceDiscussed: true }),
                call_focus_synthesis: { summary: 'Итог', score: 7 },
            },
        });

        const dto = await service.run(DOMAIN, 'текст', 'call', undefined, {
            stored: storedOf({
                form: focusResult(),
                content: focusResult(),
                closing: focusResult({ dealProgress: 3 }),
            }),
        });

        expect(schemas()).toEqual([
            'call_focus_movement',
            'call_focus_synthesis',
        ]);
        expect(dto).toMatchObject({
            priceDiscussed: true,
            dealProgress: 3,
            incompleteParts: [],
        });
    });

    it('не хватало только синтеза — один вызов', async () => {
        const { service, schemas } = makeService({
            responses: { call_focus_synthesis: { summary: 'Итог', score: 6 } },
        });

        const dto = await service.run(DOMAIN, 'текст', 'call', undefined, {
            stored: storedOf({
                form: focusResult(),
                content: focusResult(),
                movement: focusResult(),
                closing: focusResult(),
            }),
        });

        expect(schemas()).toEqual(['call_focus_synthesis']);
        expect(dto?.incompleteParts).toEqual([]);
    });

    it('догон опять неполный — в разборе копятся и прежние, и новые проходы', async () => {
        const { service } = makeService({
            responses: {
                call_focus_content: focusResult({ needsFound: true }),
                call_focus_movement: new Error('down'),
                call_focus_synthesis: { summary: 'Итог', score: 5 },
            },
        });

        const dto = await service.run(DOMAIN, 'текст', 'call', undefined, {
            stored: storedOf({ form: focusResult({ sentiment: 'neutral' }) }),
        });

        expect(dto?.incompleteParts).toEqual(['movement']);
        expect(dto?.extra?.focusPasses).toEqual(
            storedOf({
                form: focusResult({ sentiment: 'neutral' }),
                content: focusResult({ needsFound: true }),
                closing: focusResult(),
            }),
        );
    });

    it('сохранённые проходы прежнего промпта не годятся: догон переделывает разбор целиком', () => {
        const old = {
            ...storedOf({ form: focusResult(), movement: focusResult() }),
            promptVersion: 'focus-v3.2-2026-11-16',
        };
        expect(usableStoredFocusPasses(old, CALL_REPORT_PROMPT_VERSION)).toBe(
            false,
        );
        expect(
            usableStoredFocusPasses(
                storedOf({ form: focusResult() }),
                CALL_REPORT_PROMPT_VERSION,
            ),
        ).toBe(true);
    });

    it('ответ методики берётся из сохранённого только при той же метке методики', async () => {
        const methodology: ResolvedMethodology = {
            methodology: POLYANSKY_METHODOLOGY,
            scope: 'common',
            source: 'builtin',
            versionTag: 'polyansky@1.0.0',
        };
        const passes = {
            form: focusResult(),
            content: focusResult(),
            movement: focusResult(),
            closing: focusResult(),
        };
        const responses = {
            call_focus_methodology: { checkpoints: [], spirals: [] },
            call_focus_synthesis: { summary: 'Итог', score: 6 },
        };
        const kept = { checkpoints: [], spirals: [] };

        const same = makeService({ methodology, responses });
        await same.service.run(DOMAIN, 'текст', 'presentation', undefined, {
            stored: storedOf(passes, {
                tag: 'polyansky@1.0.0',
                result: kept,
            }),
        });
        expect(same.schemas()).toEqual(['call_focus_synthesis']);

        const changed = makeService({ methodology, responses });
        await changed.service.run(DOMAIN, 'текст', 'presentation', undefined, {
            stored: storedOf(passes, {
                tag: 'polyansky@0.9.0',
                result: kept,
            }),
        });
        expect(changed.schemas()).toEqual([
            'call_focus_methodology',
            'call_focus_synthesis',
        ]);
    });
});
