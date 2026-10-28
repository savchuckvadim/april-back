import { CallClassifyStepService } from '../services/call-classify-step.service';

const PAYLOAD = {
    domain: 'test.bitrix24.ru',
    activityId: 101,
    dealId: 555,
};

const CLASSIFICATION = {
    callType: 'cold',
    interlocutorRole: 'secretary',
    confidence: 0.9,
    reason: 'Проход секретаря',
};

const makeDeps = (overrides?: {
    llmError?: boolean;
    confidence?: number;
    callType?: string;
}) => {
    // Шлюз LLM: провайдера шаг не знает — получает разобранный JSON,
    // расход и код ответившего провайдера.
    const llm = {
        structuredCompletionWithUsage: overrides?.llmError
            ? jest.fn().mockRejectedValue(new Error('LLM недоступна'))
            : jest.fn().mockResolvedValue({
                  result: {
                      ...CLASSIFICATION,
                      callType: overrides?.callType ?? CLASSIFICATION.callType,
                      confidence: overrides?.confidence ?? 0.9,
                  },
                  usage: {
                      promptTokens: 1,
                      completionTokens: 1,
                      totalTokens: 2,
                  },
                  model: 'bitrix/bitrixgpt-5.5',
                  provider: 'vibecode',
              }),
    };
    const instruction = {
        resolve: jest.fn().mockResolvedValue('инструкция классификации'),
    };
    const typeRegistry = {
        resolve: jest.fn().mockResolvedValue({
            codes: ['cold', 'renewal'],
            types: {
                cold: {
                    code: 'cold',
                    title: 'Холодный',
                    focus: 'Выход на ЛПР',
                },
                renewal: {
                    code: 'renewal',
                    title: 'Перезаключение',
                    focus: '',
                },
            },
            source: 'knowledge',
        }),
    };
    const aiService = { create: jest.fn().mockResolvedValue({ id: '1' }) };
    const service = new CallClassifyStepService(
        llm as never,
        instruction as never,
        typeRegistry as never,
        aiService as never,
    );
    return {
        service,
        llm,
        instruction,
        typeRegistry,
        aiService,
    };
};

describe('CallClassifyStepService', () => {
    afterEach(() => jest.clearAllMocks());

    it('классифицирует через шлюз LLM: подменная инструкция, каталог типов, схема с кодами реестра, домен портала', async () => {
        const { service, llm, instruction, aiService } = makeDeps();
        const result = await service.run('текст', PAYLOAD as never, '42');

        expect(instruction.resolve).toHaveBeenCalledWith('test.bitrix24.ru');
        // Инструкция дополняется каталогом типов из реестра, схема получает
        // динамический список кодов; ключ провайдера шаг не трогает — пятый
        // аргумент шлюза — домен портала.
        expect(llm.structuredCompletionWithUsage).toHaveBeenCalledWith(
            expect.stringContaining("'renewal' — Перезаключение"),
            expect.stringContaining('текст'),
            'call_classification',
            expect.objectContaining({
                properties: expect.objectContaining({
                    callType: { type: 'string', enum: ['cold', 'renewal'] },
                }) as object,
            }),
            'test.bitrix24.ru',
        );
        // Код провайдера в ais — исторический bitrix-vibecode.
        expect(aiService.create).toHaveBeenCalledWith(
            expect.objectContaining({
                type: 'call-classify',
                provider: 'bitrix-vibecode',
                result: 'cold',
                transcription_id: '42',
            }),
        );
        expect(result?.callType).toBe('cold');
    });

    it('низкая confidence помечается needsEscalation', async () => {
        const { service, aiService } = makeDeps({ confidence: 0.4 });
        await service.run('текст', PAYLOAD as never, '42');
        expect(aiService.create).toHaveBeenCalledWith(
            expect.objectContaining({
                user_result: expect.objectContaining({
                    needsEscalation: true,
                }) as object,
            }),
        );
    });

    it('уверенная классификация — needsEscalation=false', async () => {
        const { service, aiService } = makeDeps();
        await service.run('текст', PAYLOAD as never, '42');
        expect(aiService.create).toHaveBeenCalledWith(
            expect.objectContaining({
                user_result: expect.objectContaining({
                    needsEscalation: false,
                }) as object,
            }),
        );
    });

    it('enabledOverride=false из настроек портала пропускает шаг', async () => {
        const { service, llm } = makeDeps();
        const result = await service.run(
            'текст',
            PAYLOAD as never,
            '42',
            false,
        );
        expect(result).toBeNull();
        expect(llm.structuredCompletionWithUsage).not.toHaveBeenCalled();
    });

    it('ошибка шлюза LLM — null, без исключения', async () => {
        const { service, aiService } = makeDeps({ llmError: true });
        const result = await service.run('текст', PAYLOAD as never, '42');
        expect(result).toBeNull();
        expect(aiService.create).not.toHaveBeenCalled();
    });

    describe('приор из CRM', () => {
        const strong = {
            callType: 'presentation' as const,
            strength: 'strong' as const,
            reason: 'сделка на стадии sales_pres',
        };
        const weak = {
            callType: 'call' as const,
            strength: 'weak' as const,
            reason: 'сделка на стадии sales_new',
        };

        it('сильный приор перекрывает «другое» модели; исходный ответ сохраняется в ais', async () => {
            const { service, aiService } = makeDeps({
                callType: 'other',
                confidence: 0.8,
            });
            const result = await service.run(
                'текст',
                PAYLOAD as never,
                '42',
                true,
                null,
                strong,
            );
            expect(result?.callType).toBe('presentation');
            expect(result?.confidence).toBeGreaterThanOrEqual(0.7);
            expect(aiService.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    result: 'presentation',
                    user_result: expect.objectContaining({
                        priorApplied: true,
                        originalCallType: 'other',
                        originalConfidence: 0.8,
                        needsEscalation: false,
                    }) as object,
                }),
            );
        });

        it('сильный приор перекрывает и неуверенный НЕ-«другое» ответ', async () => {
            const { service } = makeDeps({ callType: 'call', confidence: 0.4 });
            const result = await service.run(
                'текст',
                PAYLOAD as never,
                '42',
                true,
                null,
                strong,
            );
            expect(result?.callType).toBe('presentation');
        });

        it('уверенный ответ модели приор не трогает, но CRM-подсказка сохраняется', async () => {
            const { service } = makeDeps({ callType: 'call', confidence: 0.9 });
            const result = await service.run(
                'текст',
                PAYLOAD as never,
                '42',
                true,
                null,
                strong,
            );
            expect(result?.callType).toBe('call');
            expect(result?.priorApplied).toBeUndefined();
            expect(result?.priorCallType).toBe('presentation');
        });

        it('слабый приор перекрывает только НЕУВЕРЕННОЕ «другое»', async () => {
            const sure = makeDeps({ callType: 'other', confidence: 0.85 });
            expect(
                (
                    await sure.service.run(
                        'текст',
                        PAYLOAD as never,
                        '42',
                        true,
                        null,
                        weak,
                    )
                )?.callType,
            ).toBe('other');
            const unsure = makeDeps({ callType: 'other', confidence: 0.4 });
            expect(
                (
                    await unsure.service.run(
                        'текст',
                        PAYLOAD as never,
                        '42',
                        true,
                        null,
                        weak,
                    )
                )?.callType,
            ).toBe('call');
        });

        it('без приора ответ модели уходит как есть', async () => {
            const { service } = makeDeps({
                callType: 'other',
                confidence: 0.3,
            });
            const result = await service.run(
                'текст',
                PAYLOAD as never,
                '42',
                true,
                null,
                null,
            );
            expect(result?.callType).toBe('other');
            expect(result?.priorCallType).toBeUndefined();
        });
    });
});
