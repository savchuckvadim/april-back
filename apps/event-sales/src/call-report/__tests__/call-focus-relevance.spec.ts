import { POLYANSKY_METHODOLOGY, type ResolvedMethodology } from '@lib/call-lib';
import { CallFocusAnalysisService } from '../services/call-focus-analysis.service';
import { methodologyRelevanceFor } from '../services/call-focus-anchors.util';

const DOMAIN = 'gsr.bitrix24.ru';

const resolvedWith = (
    relevance: ResolvedMethodology['methodology']['relevance'],
): ResolvedMethodology => ({
    methodology: { ...POLYANSKY_METHODOLOGY, relevance },
    scope: 'portal',
    source: 'table',
    versionTag: 'polyansky@1.0.0',
});

/** Сервис разбора: профиль холодного звонка с приорами 40 и 10. */
const makeService = (methodology: ResolvedMethodology | null) => {
    const llm = {
        structuredCompletionWithUsage: jest.fn().mockResolvedValue({
            result: { sections: [], checkpoints: [], spirals: null },
            usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
            model: null,
        }),
        reportExhausted: jest.fn().mockResolvedValue(undefined),
    };
    const service = new CallFocusAnalysisService(
        llm as never,
        { collect: jest.fn().mockResolvedValue([]) } as never,
        {
            resolve: jest.fn().mockResolvedValue({
                types: {
                    cold: {
                        title: 'Холодный звонок',
                        focus: 'выйти на ЛПР',
                        sectionRelevance: { NEEDS: 40, PRESENTATION: 10 },
                        talkRatioNorm: null,
                        questionsNorm: null,
                        knowledgeKind: 'call-analysis-cold',
                    },
                },
            }),
        } as never,
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
        { resolve: jest.fn().mockResolvedValue(methodology) } as never,
    );
    const promptOf = (schemaName: string): string =>
        String(
            (
                llm.structuredCompletionWithUsage.mock.calls.find(
                    call => (call as unknown[])[2] === schemaName,
                ) as unknown[]
            )[0],
        );
    return { service, promptOf };
};

/**
 * Приоры актуальности разделов из методики портала: раньше поле `relevance`
 * хранилось в конфиге, а разбор брал приоры только из профиля типа звонка.
 */
describe('приоры актуальности разделов из методики', () => {
    it('берутся приоры типа этого звонка; нет методики, типа или приоров — профиль типа', () => {
        const resolved = resolvedWith({ cold: { NEEDS: 95 } });

        expect(methodologyRelevanceFor(resolved, 'cold')).toEqual({
            NEEDS: 95,
        });
        expect(
            methodologyRelevanceFor(resolved, 'presentation'),
        ).toBeUndefined();
        expect(methodologyRelevanceFor(resolved, null)).toBeUndefined();
        expect(methodologyRelevanceFor(null, 'cold')).toBeUndefined();
        expect(
            methodologyRelevanceFor(resolvedWith({ cold: {} }), 'cold'),
        ).toBeUndefined();
        expect(
            methodologyRelevanceFor(resolvedWith(undefined), 'cold'),
        ).toBeUndefined();
    });

    it('разбор звонка: приор методики заменяет приор профиля, остальные разделы — из профиля', async () => {
        const { service, promptOf } = makeService(
            resolvedWith({ cold: { NEEDS: 95 } }),
        );

        await service.run(DOMAIN, 'текст', 'cold');

        for (const schemaName of [
            'call_focus_form',
            'call_focus_content',
            'call_focus_movement',
            'call_focus_closing',
            'call_focus_synthesis',
            'call_focus_methodology',
        ]) {
            const prompt = promptOf(schemaName);
            expect(prompt).toContain('Выявление потребностей: 95');
            expect(prompt).toContain('Презентация под потребности: 10');
        }
    });

    it('методики на портале нет — действуют приоры профиля типа звонка', async () => {
        const { service, promptOf } = makeService(null);

        await service.run(DOMAIN, 'текст', 'cold');

        expect(promptOf('call_focus_content')).toContain(
            'Выявление потребностей: 40',
        );
    });

    it('у методики нет приоров для типа этого звонка — профиль типа не трогается', async () => {
        const { service, promptOf } = makeService(
            resolvedWith({ presentation: { NEEDS: 95 } }),
        );

        await service.run(DOMAIN, 'текст', 'cold');

        expect(promptOf('call_focus_content')).toContain(
            'Выявление потребностей: 40',
        );
    });

    it('проверка черновика на звонке видит те же приоры, что и штатный проход', async () => {
        const { service, promptOf } = makeService(null);

        await service.runMethodologyPass(
            DOMAIN,
            'текст',
            'cold',
            resolvedWith({ cold: { NEEDS: 95 } }),
        );

        expect(promptOf('call_focus_methodology')).toContain(
            'Выявление потребностей: 95',
        );
    });
});
