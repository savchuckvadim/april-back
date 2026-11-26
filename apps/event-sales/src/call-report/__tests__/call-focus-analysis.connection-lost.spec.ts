import { Logger } from '@nestjs/common';
import {
    CALL_REPORT_ISSUE_CONNECTION_LOST,
    CALL_REPORT_OUTCOME_CONNECTION_LOST,
} from '@lib/portal-lib/pbx/pbx-aicall-smart';
import { CallFocusAnalysisService } from '../services/call-focus-analysis.service';

/**
 * Обрыв связи в фокус-разборе (26.11.2026): закрытие и отказ, до которых
 * разговор не дошёл, становятся неактуальными ДО ограничителей методики —
 * иначе ограничитель успел бы срезать оценку раздела, который перестал быть
 * актуальным. Ограничители про конец разговора при обрыве молчат.
 */
const DOMAIN = 'test.bitrix24.ru';
const USAGE = { promptTokens: 100, completionTokens: 20, totalTokens: 120 };
const END_CAPS = [
    'core.next_step_incomplete',
    'core.info_promise_without_date',
];

const makeService = (closing: Record<string, unknown>) => {
    const responses: Record<string, Record<string, unknown>> = {
        call_focus_form: {
            sections: [{ section: 'GREETING', relevance: 100, score: 8 }],
        },
        call_focus_content: {
            sections: [{ section: 'NEEDS', relevance: 80, score: 6 }],
            needsFound: true,
        },
        call_focus_movement: { sections: [{ section: 'PRICE', relevance: 0 }] },
        call_focus_closing: closing,
        call_focus_synthesis: { summary: 'Итог', score: 7 },
    };
    const llm = {
        structuredCompletionWithUsage: jest.fn(
            (_system: string, _user: string, schemaName: string) =>
                Promise.resolve({
                    result: responses[schemaName] ?? { sections: [] },
                    usage: USAGE,
                    model: 'bitrix/bitrixgpt-5.5',
                }),
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
    return new CallFocusAnalysisService(
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
        { resolve: jest.fn().mockResolvedValue(null) } as never,
    );
};

/** Закрытие и отказ с оценками, шаг назначен без даты — ловушка для core-ограничителей. */
const closingPass = (extra: Record<string, unknown>) => ({
    sections: [
        { section: 'CLOSING', relevance: 90, score: 8 },
        { section: 'REFUSAL', relevance: 60, score: 3, advice: 'совет' },
    ],
    nextStep: { set: true, description: 'созвон', date: null },
    ...extra,
});

const capCodes = (dto: Awaited<ReturnType<CallFocusAnalysisService['run']>>) =>
    (dto?.capsTriggered ?? []).map(cap => cap.code);

const sectionOf = (
    dto: Awaited<ReturnType<CallFocusAnalysisService['run']>>,
    code: string,
) => dto?.sections?.find(item => item.section === code);

describe('CallFocusAnalysisService: обрыв связи', () => {
    afterEach(() => jest.restoreAllMocks());

    it('исход «связь прервалась»: закрытие и отказ неактуальны, оценки не срезаны ограничителями, итог не пересчитан', async () => {
        const log = jest
            .spyOn(Logger.prototype, 'log')
            .mockImplementation(() => undefined);
        const service = makeService(
            closingPass({ outcome: CALL_REPORT_OUTCOME_CONNECTION_LOST }),
        );
        const dto = await service.run(DOMAIN, 'текст', 'call');

        expect(sectionOf(dto, 'CLOSING')).toEqual({
            section: 'CLOSING',
            relevance: 0,
        });
        expect(sectionOf(dto, 'REFUSAL')).toEqual({
            section: 'REFUSAL',
            relevance: 0,
        });
        expect(sectionOf(dto, 'GREETING')?.score).toBe(8);
        expect(capCodes(dto)).toEqual([]);
        expect(dto?.score).toBe(7);
        // Строка журнала называет раздел и разбор.
        expect(
            log.mock.calls.some(
                ([message]) =>
                    String(message).includes('Обрыв связи: раздел CLOSING') &&
                    String(message).includes(`Фокус-разбор (${DOMAIN})`),
            ),
        ).toBe(true);
    });

    it('обрыв отмечен только сбоем: разделы остаются, но ограничители про конец молчат', async () => {
        const service = makeService(
            closingPass({
                outcome: 'advanced',
                issues: [
                    {
                        code: CALL_REPORT_ISSUE_CONNECTION_LOST,
                        quote: 'и тогда',
                    },
                ],
            }),
        );
        const dto = await service.run(DOMAIN, 'текст', 'call');

        expect(sectionOf(dto, 'CLOSING')).toMatchObject({
            relevance: 90,
            score: 8,
        });
        for (const code of END_CAPS) expect(capCodes(dto)).not.toContain(code);
    });

    it('без обрыва всё как раньше: закрытие актуально, ограничители срезали его оценку', async () => {
        const service = makeService(closingPass({ outcome: 'callback_dated' }));
        const dto = await service.run(DOMAIN, 'текст', 'call');

        expect(sectionOf(dto, 'CLOSING')?.relevance).toBe(90);
        expect(capCodes(dto)).toEqual(expect.arrayContaining(END_CAPS));
        // «Финал без даты» режет закрытие до 5 из 8.
        expect(sectionOf(dto, 'CLOSING')?.score).toBe(5);
        expect(sectionOf(dto, 'REFUSAL')).toMatchObject({
            relevance: 60,
            score: 3,
        });
    });
});
