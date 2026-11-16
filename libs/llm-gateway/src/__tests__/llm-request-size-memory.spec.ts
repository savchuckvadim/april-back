import {
    LLM_TOO_LARGE_MEMORY_MS,
    LlmRequestSizeMemory,
} from '../llm-request-size-memory';

const KEY = 'https://api.groq.com/openai/v1|openai/gpt-oss-120b|abc';
const NOW = 1_700_000_000_000;

describe('LlmRequestSizeMemory — «запрос такого размера поставщик не принимает»', () => {
    it('ничего не помнит — запрос любого размера идёт', () => {
        expect(new LlmRequestSizeMemory().blocks(KEY, 1_000_000, NOW)).toBe(
            false,
        );
    });

    it('после отказа блокирует такой же и больший запрос, меньший пропускает', () => {
        const memory = new LlmRequestSizeMemory();
        memory.remember(KEY, 40_000, NOW);

        expect(memory.blocks(KEY, 40_000, NOW + 1)).toBe(true);
        expect(memory.blocks(KEY, 90_000, NOW + 1)).toBe(true);
        expect(memory.blocks(KEY, 39_999, NOW + 1)).toBe(false);
    });

    it('помнит наименьший размер отказа: больший отказ порог не поднимает', () => {
        const memory = new LlmRequestSizeMemory();
        memory.remember(KEY, 40_000, NOW);
        memory.remember(KEY, 70_000, NOW + 10);
        expect(memory.blocks(KEY, 50_000, NOW + 20)).toBe(true);

        memory.remember(KEY, 30_000, NOW + 30);
        expect(memory.blocks(KEY, 35_000, NOW + 40)).toBe(true);
    });

    it('через час запись гаснет — поставщика пробуем снова', () => {
        const memory = new LlmRequestSizeMemory();
        memory.remember(KEY, 40_000, NOW);

        expect(
            memory.blocks(KEY, 40_000, NOW + LLM_TOO_LARGE_MEMORY_MS - 1),
        ).toBe(true);
        expect(memory.blocks(KEY, 40_000, NOW + LLM_TOO_LARGE_MEMORY_MS)).toBe(
            false,
        );
    });

    it('у другого адреса, модели или ключа своя память', () => {
        const memory = new LlmRequestSizeMemory();
        memory.remember(KEY, 40_000, NOW);
        expect(memory.blocks(`${KEY}-other`, 40_000, NOW)).toBe(false);
    });
});
