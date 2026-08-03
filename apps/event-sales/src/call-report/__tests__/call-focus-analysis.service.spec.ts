import { CALL_REPORT_SECTION_CODES } from '@lib/call-lib';
import { FOCUS_SECTION_CODES } from '../contracts/call-focus-analysis.contract';
import { CallFocusAnalysisService } from '../services/call-focus-analysis.service';

const focusResult = (overrides?: Record<string, unknown>) => ({
    sections: [],
    ...overrides,
});

const makeDeps = (options?: {
    /** schemaName → ответ (или Error для падения прохода). */
    responses?: Record<string, Record<string, unknown> | Error>;
}) => {
    const responses = options?.responses ?? {};
    const vibeCodeClient = {
        structuredCompletion: jest.fn(
            (
                _system: string,
                _user: string,
                schemaName: string,
            ): Promise<unknown> => {
                const answer = responses[schemaName];
                if (answer instanceof Error) return Promise.reject(answer);
                return Promise.resolve(answer ?? focusResult());
            },
        ),
    };
    const vibeKeyResolver = { resolve: jest.fn().mockResolvedValue('key') };
    const knowledgeContent = { readAll: jest.fn().mockResolvedValue([]) };
    const callTypeRegistry = {
        resolve: jest.fn().mockResolvedValue({ types: {} }),
    };
    const service = new CallFocusAnalysisService(
        vibeCodeClient as never,
        vibeKeyResolver as never,
        knowledgeContent as never,
        callTypeRegistry as never,
    );
    return { service, vibeCodeClient };
};

describe('контракт фокусов', () => {
    it('фокусы покрывают ВСЕ разделы смарта без пересечений', () => {
        const union = Object.values(FOCUS_SECTION_CODES).flat();
        expect([...union].sort()).toEqual(
            [...CALL_REPORT_SECTION_CODES].sort(),
        );
        expect(new Set(union).size).toBe(union.length);
    });
});

describe('CallFocusAnalysisService', () => {
    it('собирает dto из трёх фокусов и синтеза; секции объединяются', async () => {
        const { service, vibeCodeClient } = makeDeps({
            responses: {
                call_focus_form: focusResult({
                    sections: [
                        { section: 'GREETING', relevance: 100, score: 8 },
                    ],
                    sentiment: 'positive',
                }),
                call_focus_content: focusResult({
                    sections: [{ section: 'NEEDS', relevance: 80, score: 6 }],
                    needsFound: true,
                    needs: ['практика 44-ФЗ'],
                }),
                call_focus_movement: focusResult({
                    sections: [{ section: 'PRICE', relevance: 0 }],
                    priceDiscussed: false,
                    nextStep: { set: true, description: 'созвон', date: null },
                }),
                call_focus_synthesis: {
                    summary: 'Итог звонка',
                    score: 7,
                    recommendations: ['приём → «фраза» → зачем'],
                },
            },
        });
        const dto = await service.run(
            'test.bitrix24.ru',
            'текст разговора',
            'call',
            'ПАСПОРТ',
        );

        expect(dto).not.toBeNull();
        expect(dto?.sections?.map(section => section.section)).toEqual([
            'GREETING',
            'NEEDS',
            'PRICE',
        ]);
        expect(dto?.summary).toBe('Итог звонка');
        expect(dto?.score).toBe(7);
        expect(dto?.callType).toBe('call');
        expect(dto?.priceDiscussed).toBe(false);
        // Все четыре вызова получили паспорт в user-контенте.
        for (const call of vibeCodeClient.structuredCompletion.mock.calls) {
            expect(String(call[1])).toContain('ПАСПОРТ');
        }
    });

    it('один упавший фокус не роняет разбор; его разделы отсутствуют', async () => {
        const { service } = makeDeps({
            responses: {
                call_focus_content: new Error('vibecode down'),
                call_focus_synthesis: { summary: 'Итог', score: 5 },
            },
        });
        const dto = await service.run('test.bitrix24.ru', 'текст', 'call');
        expect(dto).not.toBeNull();
        expect(
            dto?.sections?.some(section =>
                ['NEEDS', 'PRESENTATION'].includes(section.section),
            ),
        ).toBe(false);
    });

    it('два упавших фокуса → результат отброшен (null)', async () => {
        const { service } = makeDeps({
            responses: {
                call_focus_form: new Error('down'),
                call_focus_content: new Error('down'),
            },
        });
        const dto = await service.run('test.bitrix24.ru', 'текст', 'call');
        expect(dto).toBeNull();
    });

    it('упавший синтез не фатален: секции есть, итоговых полей нет', async () => {
        const { service } = makeDeps({
            responses: {
                call_focus_synthesis: new Error('down'),
            },
        });
        const dto = await service.run('test.bitrix24.ru', 'текст', 'call');
        expect(dto).not.toBeNull();
        expect(dto?.summary).toBeUndefined();
    });
});
