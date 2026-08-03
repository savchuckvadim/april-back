import { CallDeepAnalysisService } from '../services/call-deep-analysis.service';

/** Профиль типа из реестра — калибровка разбора под этап продаж. */
const coldProfile = {
    code: 'cold',
    title: 'Холодный звонок',
    focus: 'Выход на ЛПР: проход секретаря, зацепка.',
    sectionRelevance: {
        GREETING: 100,
        NEEDS: 60,
        PRESENTATION: 20,
        OBJECTIONS: 70,
        PRICE: 10,
        CLOSING: 80,
        REFUSAL: 60,
    },
    talkRatioNorm: { min: 30, max: 55 },
    questionsNorm: { min: 3, max: 8 },
    knowledgeKind: 'call-analysis-cold',
};

const ANALYSIS_RESPONSE = {
    summary: 'Разговор с ЛПР',
    productive: true,
    score: 7,
    sections: [{ section: 'GREETING', relevance: 100, score: 8 }],
    // Черновик карточки события — уходит в ais.report_result.
    flow: {
        report: { resultStatus: 'result', noresultReasonCode: null },
        plan: {
            isPlanned: true,
            typeCode: 'presentation',
            name: 'Провести презентацию',
            deadlineDate: '2026-08-05',
        },
    },
};

const makeDeps = (options?: {
    documents?: { kind: string; text: string }[];
    profileMissing?: boolean;
    registryError?: boolean;
    completionError?: boolean;
}) => {
    const vibeCodeClient = {
        structuredCompletion: options?.completionError
            ? jest.fn().mockRejectedValue(new Error('vibecode down'))
            : jest.fn().mockResolvedValue(ANALYSIS_RESPONSE),
    };
    const vibeKeyResolver = { resolve: jest.fn().mockResolvedValue('key-1') };
    const knowledgeContent = {
        readAll: jest.fn().mockResolvedValue(options?.documents ?? []),
    };
    const callTypeRegistry = {
        resolve: options?.registryError
            ? jest.fn().mockRejectedValue(new Error('knowledge down'))
            : jest.fn().mockResolvedValue({
                  codes: ['cold'],
                  types: options?.profileMissing ? {} : { cold: coldProfile },
                  source: 'builtin',
              }),
    };
    const service = new CallDeepAnalysisService(
        vibeCodeClient as never,
        vibeKeyResolver as never,
        knowledgeContent as never,
        callTypeRegistry as never,
    );
    return { service, vibeCodeClient, knowledgeContent, callTypeRegistry };
};

/** Системный промпт — первый аргумент structuredCompletion. */
const systemPromptOf = (client: {
    structuredCompletion: jest.Mock;
}): string => {
    const calls = client.structuredCompletion.mock.calls as string[][];
    return calls[0][0];
};

describe('CallDeepAnalysisService', () => {
    afterEach(() => jest.clearAllMocks());

    it('промпт калибруется профилем этапа: фокус и приоры разделов', async () => {
        const { service, vibeCodeClient } = makeDeps();
        await service.run('test.bitrix24.ru', 'алло', 'cold');

        const prompt = systemPromptOf(vibeCodeClient);
        expect(prompt).toContain('Холодный звонок');
        expect(prompt).toContain('проход секретаря');
        // Приор PRESENTATION=20 — в холодном презентовать не требуется.
        expect(prompt).toContain('Презентация под потребности: 20');
        expect(prompt).toContain('30-55%');
    });

    it('kind методички берётся из профиля, а не собирается строкой', async () => {
        const { service, knowledgeContent } = makeDeps();
        await service.run('test.bitrix24.ru', 'алло', 'cold');

        expect(knowledgeContent.readAll).toHaveBeenCalledWith(
            'test.bitrix24.ru',
            'call-analysis-cold',
        );
    });

    it('методички компании подмешиваются в промпт', async () => {
        const { service, vibeCodeClient } = makeDeps({
            documents: [
                {
                    kind: 'call-analysis-cold',
                    text: 'Скрипт прохода секретаря',
                },
                // general подмешивается listDocuments — в промпт попасть не должен.
                { kind: 'general', text: 'Каталог продуктов' },
            ],
        });
        await service.run('test.bitrix24.ru', 'алло', 'cold');

        const prompt = systemPromptOf(vibeCodeClient);
        expect(prompt).toContain('Скрипт прохода секретаря');
        expect(prompt).not.toContain('Каталог продуктов');
    });

    it('callType проставляется из классификатора, а не из ответа модели', async () => {
        const { service } = makeDeps();
        const result = await service.run('test.bitrix24.ru', 'алло', 'cold');

        expect(result?.callType).toBe('cold');
        expect(result?.summary).toBe('Разговор с ЛПР');
    });

    it('черновик события flow доезжает до DTO (пишется в ais.report_result)', async () => {
        const { service } = makeDeps();
        const result = await service.run('test.bitrix24.ru', 'алло', 'cold');

        expect(result?.flow?.report.resultStatus).toBe('result');
        expect(result?.flow?.plan.typeCode).toBe('presentation');
        expect(result?.flow?.plan.deadlineDate).toBe('2026-08-05');
    });

    it('в промпте расшифрованы коды flow — модель не выдумывает свои', async () => {
        const { service, vibeCodeClient } = makeDeps();
        await service.run('test.bitrix24.ru', 'алло', 'cold');

        const prompt = systemPromptOf(vibeCodeClient);
        expect(prompt).toContain('noresultReasonCode');
        expect(prompt).toContain('secretar');
        expect(prompt).toContain('moneyAwait');
    });

    it('тип вне реестра — разбор идёт без калибровки, но идёт', async () => {
        const { service, vibeCodeClient } = makeDeps({ profileMissing: true });
        const result = await service.run('test.bitrix24.ru', 'алло', 'exotic');

        expect(result).not.toBeNull();
        expect(systemPromptOf(vibeCodeClient)).not.toContain('ЭТАП РАЗГОВОРА');
    });

    it('недоступный реестр не роняет разбор', async () => {
        const { service } = makeDeps({ registryError: true });

        await expect(
            service.run('test.bitrix24.ru', 'алло', 'cold'),
        ).resolves.not.toBeNull();
    });

    it('ошибка модели гасится — конвейер продолжает работу', async () => {
        const { service } = makeDeps({ completionError: true });

        await expect(
            service.run('test.bitrix24.ru', 'алло', 'cold'),
        ).resolves.toBeNull();
    });

    it('пустой транскрипт — разбор не запускается', async () => {
        const { service, vibeCodeClient } = makeDeps();
        const result = await service.run('test.bitrix24.ru', '   ', 'cold');

        expect(result).toBeNull();
        expect(vibeCodeClient.structuredCompletion).not.toHaveBeenCalled();
    });

    // Выключатель шага живёт в processor (настройки портала → env → дефолт,
    // CallReportSettingsService) — см. call-report.processor.spec.

    it('модель из настроек портала уезжает в structuredCompletion', async () => {
        const { service, vibeCodeClient } = makeDeps();
        await service.run('test.bitrix24.ru', 'алло', 'cold', undefined, {
            model: 'bitrix/custom-model',
        });

        const options = (
            vibeCodeClient.structuredCompletion.mock.calls[0] as unknown[]
        )[5];
        expect(options).toEqual({ model: 'bitrix/custom-model' });
    });
});
