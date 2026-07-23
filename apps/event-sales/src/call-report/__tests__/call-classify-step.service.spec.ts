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
    env?: Record<string, string>;
    vibecodeError?: boolean;
    confidence?: number;
}) => {
    const vibecode = {
        classifyCall: overrides?.vibecodeError
            ? jest.fn().mockRejectedValue(new Error('vibecode down'))
            : jest.fn().mockResolvedValue({
                  ...CLASSIFICATION,
                  confidence: overrides?.confidence ?? 0.9,
              }),
    };
    const keyResolver = {
        resolve: jest.fn().mockResolvedValue('portal-vibe-key'),
    };
    const instruction = {
        resolve: jest.fn().mockResolvedValue('инструкция классификации'),
    };
    const aiService = { create: jest.fn().mockResolvedValue({ id: '1' }) };
    const config = {
        get: jest.fn((key: string) => overrides?.env?.[key]),
    };
    const service = new CallClassifyStepService(
        vibecode as never,
        keyResolver as never,
        instruction as never,
        aiService as never,
        config as never,
    );
    return { service, vibecode, keyResolver, instruction, aiService };
};

describe('CallClassifyStepService', () => {
    afterEach(() => jest.clearAllMocks());

    it('классифицирует с подменной инструкцией и пер-портальным ключом', async () => {
        const { service, vibecode, keyResolver, instruction, aiService } =
            makeDeps();
        const result = await service.run('текст', PAYLOAD as never, '42');

        expect(instruction.resolve).toHaveBeenCalledWith('test.bitrix24.ru');
        expect(keyResolver.resolve).toHaveBeenCalledWith('test.bitrix24.ru');
        expect(vibecode.classifyCall).toHaveBeenCalledWith(
            'текст',
            'инструкция классификации',
            'portal-vibe-key',
        );
        expect(aiService.create).toHaveBeenCalledWith(
            expect.objectContaining({
                type: 'call-classify',
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

    it('порог эскалации настраивается env-ом', async () => {
        const { service, aiService } = makeDeps({
            env: { CALL_REPORT_CLASSIFY_ESCALATION_CONFIDENCE: '0.95' },
        });
        await service.run('текст', PAYLOAD as never, '42');
        // confidence 0.9 < порога 0.95 → эскалация.
        expect(aiService.create).toHaveBeenCalledWith(
            expect.objectContaining({
                user_result: expect.objectContaining({
                    needsEscalation: true,
                }) as object,
            }),
        );
    });

    it('CALL_REPORT_CLASSIFY_ENABLED=0 — шаг пропускается', async () => {
        const { service, vibecode } = makeDeps({
            env: { CALL_REPORT_CLASSIFY_ENABLED: '0' },
        });
        const result = await service.run('текст', PAYLOAD as never, '42');
        expect(result).toBeNull();
        expect(vibecode.classifyCall).not.toHaveBeenCalled();
    });

    it('ошибка VibeCode — null, без исключения', async () => {
        const { service, aiService } = makeDeps({ vibecodeError: true });
        const result = await service.run('текст', PAYLOAD as never, '42');
        expect(result).toBeNull();
        expect(aiService.create).not.toHaveBeenCalled();
    });
});
