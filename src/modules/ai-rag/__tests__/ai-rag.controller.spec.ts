import { AiRagController } from '../controllers/ai-rag.controller';
import { LlmOrchestratorService } from '../application/llm-orchestrator.service';
import { AiRagRequestDto } from '../dto/ai-rag-request.dto';

describe('AiRagController', () => {
    const orchestrator: jest.Mocked<
        Pick<LlmOrchestratorService, 'resume' | 'recomendation'>
    > = {
        resume: jest.fn(),
        recomendation: jest.fn(),
    };

    const controller = new AiRagController(
        orchestrator as unknown as LlmOrchestratorService,
    );

    const baseRequest: AiRagRequestDto = {
        query: 'текст разговора',
        model: 'fake',
    };

    afterEach(() => jest.clearAllMocks());

    it('resume отдаёт строку результата (оборачивает interceptor)', async () => {
        orchestrator.resume.mockResolvedValue('Готовое резюме');
        const response: string = await controller.resume(baseRequest);
        expect(orchestrator.resume).toHaveBeenCalledWith(
            'fake',
            'текст разговора',
            undefined,
        );
        expect(response).toBe('Готовое резюме');
    });

    it('recomendation отдаёт строку результата (оборачивает interceptor)', async () => {
        orchestrator.recomendation.mockResolvedValue('Готовые рекомендации');
        const response: string = await controller.recomendation(baseRequest);
        expect(orchestrator.recomendation).toHaveBeenCalledWith(
            'fake',
            'текст разговора',
            undefined,
        );
        expect(response).toBe('Готовые рекомендации');
    });

    it('пробрасывает ошибку оркестратора (для обработки глобальным фильтром)', async () => {
        orchestrator.resume.mockRejectedValue(new Error('LLM error'));
        await expect(controller.resume(baseRequest)).rejects.toThrow(
            'LLM error',
        );
    });
});
