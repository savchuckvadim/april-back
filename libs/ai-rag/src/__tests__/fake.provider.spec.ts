import { FakeProvider } from '../infrastructure/providers/fake.provider';

describe('FakeProvider', () => {
    const provider = new FakeProvider();

    it('возвращает непустую строку для resume', async () => {
        const result = await provider.resume('какой-то текст');
        expect(typeof result).toBe('string');
        expect(result.length).toBeGreaterThan(0);
    });

    it('возвращает непустую строку для recomendation', async () => {
        const result = await provider.recomendation('какой-то текст');
        expect(typeof result).toBe('string');
        expect(result.length).toBeGreaterThan(0);
    });

    it('игнорирует входной query (не падает на пустой строке)', async () => {
        await expect(provider.resume('')).resolves.toBeDefined();
        await expect(provider.recomendation('')).resolves.toBeDefined();
    });

    it('complete отдаёт пустой JSON-объект — заглушка годится шлюзу структурных вызовов', async () => {
        const result = await provider.complete('система', 'текст');
        expect(JSON.parse(result)).toEqual({});
    });
});
