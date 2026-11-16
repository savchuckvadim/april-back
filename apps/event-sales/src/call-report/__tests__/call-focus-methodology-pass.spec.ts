import { POLYANSKY_METHODOLOGY, type ResolvedMethodology } from '@lib/call-lib';
import { CallFocusAnalysisService } from '../services/call-focus-analysis.service';

const DOMAIN = 'gsr.bitrix24.ru';

const RESOLVED: ResolvedMethodology = {
    methodology: POLYANSKY_METHODOLOGY,
    scope: 'portal',
    source: 'table',
    versionTag: 'polyansky@1.0.0',
};

/** Ответ модели на проход или ошибка вызова. */
type PassAnswer = Record<string, unknown> | Error;

const makeDeps = (answer: PassAnswer = { checkpoints: [], spirals: null }) => {
    const llm = {
        structuredCompletionWithUsage: jest.fn(() =>
            answer instanceof Error
                ? Promise.reject(answer)
                : Promise.resolve({
                      result: answer,
                      usage: {
                          promptTokens: 9000,
                          completionTokens: 400,
                          totalTokens: 9400,
                      },
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
                    text: `ТЕКСТ[${request.kind}]`,
                    chars: 12,
                    truncated: false,
                })),
            ),
        ),
    };
    const callTypeRegistry = {
        resolve: jest.fn().mockResolvedValue({
            types: {
                cold: {
                    title: 'Холодный звонок',
                    focus: 'выйти на ЛПР',
                    sectionRelevance: {},
                    talkRatioNorm: { min: 30, max: 55 },
                    questionsNorm: null,
                    knowledgeKind: 'call-analysis-cold',
                },
            },
        }),
    };
    const appSettings = {
        resolve: jest.fn().mockResolvedValue({ withCheckPresentation: false }),
    };
    const reportSettings = {
        resolve: jest
            .fn()
            .mockResolvedValue({ presentationStrictness: 'strict' }),
    };
    // Реестр методик в проверке черновика не участвует: конфиг приходит снаружи.
    const methodologyRegistry = { resolve: jest.fn() };
    const service = new CallFocusAnalysisService(
        llm as never,
        materials as never,
        callTypeRegistry as never,
        appSettings as never,
        reportSettings as never,
        methodologyRegistry as never,
    );
    return { service, llm, materials, methodologyRegistry };
};

/**
 * Один проход методики по заданному конфигу — основа проверки черновика
 * методики на готовом звонке (форма методики в админке).
 */
describe('CallFocusAnalysisService.runMethodologyPass', () => {
    it('вызывает только проход методики: тот же контекст материалов, паспорт и модель портала', async () => {
        const { service, llm, materials, methodologyRegistry } = makeDeps({
            checkpoints: [],
            spirals: null,
        });

        const outcome = await service.runMethodologyPass(
            DOMAIN,
            '[00:05] Менеджер: добрый день',
            'cold',
            RESOLVED,
            'ПАСПОРТ ЗВОНКА',
            { model: 'bitrix/own-model' },
        );

        expect(llm.structuredCompletionWithUsage).toHaveBeenCalledTimes(1);
        const [system, user, schemaName, , domain, options] = llm
            .structuredCompletionWithUsage.mock.calls[0] as unknown as [
            string,
            string,
            string,
            unknown,
            string,
            { model?: string; deferExhaustedAlert?: boolean },
        ];
        expect(schemaName).toBe('call_focus_methodology');
        expect(domain).toBe(DOMAIN);
        expect(options).toEqual({
            model: 'bitrix/own-model',
            deferExhaustedAlert: false,
        });
        // Общий слой и материалы, объявленные методикой.
        expect(system).toContain('ТЕКСТ[sales-script]');
        expect(system).toContain('ТЕКСТ[product-facts]');
        expect(user).toContain('ПАСПОРТ ЗВОНКА');
        expect(user).toContain('Менеджер: добрый день');
        expect((materials.collect.mock.calls[0] as unknown[])[0]).toBe(DOMAIN);
        // Методика портала из реестра не читается — проверяется черновик.
        expect(methodologyRegistry.resolve).not.toHaveBeenCalled();
        expect(outcome).toEqual({
            result: { checkpoints: [], spirals: null },
            model: 'bitrix/bitrixgpt-5.5',
            tokens: 9400,
            talkRatioMax: 55,
        });
    });

    it('у методики нет прохода для типа звонка — модель не вызывается', async () => {
        const { service, llm, materials } = makeDeps();

        const outcome = await service.runMethodologyPass(
            DOMAIN,
            'текст',
            'event_invite',
            {
                ...RESOLVED,
                methodology: {
                    ...POLYANSKY_METHODOLOGY,
                    types: [],
                    checkpoints: [],
                    spirals: { enabled: false, minFull: 0, types: [] },
                },
            },
        );

        expect(outcome).toBeNull();
        expect(llm.structuredCompletionWithUsage).not.toHaveBeenCalled();
        expect(materials.collect).not.toHaveBeenCalled();
    });

    it('ошибку модели не глотает — её обрабатывает вызывающий', async () => {
        const { service } = makeDeps(new Error('LLM недоступна'));

        await expect(
            service.runMethodologyPass(DOMAIN, 'текст', 'cold', RESOLVED),
        ).rejects.toThrow('LLM недоступна');
    });
});
