import {
    KnowledgeMaterialsService,
    renderMaterialBlock,
} from '../services/knowledge-materials.service';

const DOMAIN = 'alfacentr.bitrix24.ru';

const makeDeps = () => {
    const knowledgeContent = { readAll: jest.fn() };
    const service = new KnowledgeMaterialsService(knowledgeContent as never);
    return { service, knowledgeContent };
};

describe('KnowledgeMaterialsService', () => {
    it('у каждого вида свой бюджет: объёмный документ не вытесняет другой вид', async () => {
        const { service, knowledgeContent } = makeDeps();
        knowledgeContent.readAll.mockImplementation(
            (_domain: string, kind: string) =>
                Promise.resolve([
                    {
                        kind,
                        text:
                            kind === 'product-facts'
                                ? 'ф'.repeat(50_000)
                                : 'СКРИПТ',
                    },
                ]),
        );

        const blocks = await service.collect(DOMAIN, [
            { kind: 'sales-script', budgetChars: 6000 },
            { kind: 'product-facts', budgetChars: 4000 },
        ]);

        const script = blocks.find(block => block.kind === 'sales-script');
        const facts = blocks.find(block => block.kind === 'product-facts');
        // Скрипт цел, хотя рядом лежит документ на 50к символов.
        expect(script?.text).toBe('СКРИПТ');
        expect(script?.truncated).toBe(false);
        // Факты ужаты до СВОЕГО бюджета с явной пометкой.
        expect(facts?.truncated).toBe(true);
        expect(facts?.chars).toBe(4000);
        expect(facts?.text).toContain('усечены по бюджету');
    });

    it('чужие виды из выдачи хранилища отбрасываются (general подмешивается к любому)', async () => {
        const { service, knowledgeContent } = makeDeps();
        knowledgeContent.readAll.mockResolvedValue([
            { kind: 'general', text: 'ОБЩЕЕ' },
            { kind: 'sales-script', text: 'СКРИПТ' },
        ]);

        const blocks = await service.collect(DOMAIN, [
            { kind: 'sales-script', budgetChars: 6000 },
        ]);

        expect(blocks[0].text).toBe('СКРИПТ');
        expect(blocks[0].text).not.toContain('ОБЩЕЕ');
    });

    it('сбой одного вида не мешает остальным', async () => {
        const { service, knowledgeContent } = makeDeps();
        knowledgeContent.readAll.mockImplementation(
            (_domain: string, kind: string) =>
                kind === 'sales-regulation'
                    ? Promise.reject(new Error('битый PDF'))
                    : Promise.resolve([{ kind, text: 'СКРИПТ' }]),
        );

        const blocks = await service.collect(DOMAIN, [
            { kind: 'sales-script', budgetChars: 6000 },
            { kind: 'sales-regulation', budgetChars: 3000 },
        ]);

        expect(blocks[0].text).toBe('СКРИПТ');
        expect(blocks[1].text).toBe('');
        expect(blocks[1].chars).toBe(0);
    });

    it('несколько документов вида склеиваются разделителем', async () => {
        const { service, knowledgeContent } = makeDeps();
        knowledgeContent.readAll.mockResolvedValue([
            { kind: 'sales-script', text: 'ЧАСТЬ 1' },
            { kind: 'sales-script', text: 'ЧАСТЬ 2' },
        ]);

        const blocks = await service.collect(DOMAIN, [
            { kind: 'sales-script', budgetChars: 6000 },
        ]);
        expect(blocks[0].text).toBe('ЧАСТЬ 1\n\n---\n\nЧАСТЬ 2');
    });

    it('пустой блок не добавляет в промпт заголовок', () => {
        expect(
            renderMaterialBlock('ЗАГОЛОВОК:', {
                kind: 'sales-script',
                text: '',
                chars: 0,
                truncated: false,
            }),
        ).toBe('');
        expect(renderMaterialBlock('ЗАГОЛОВОК:', undefined)).toBe('');
        expect(
            renderMaterialBlock('ЗАГОЛОВОК:', {
                kind: 'sales-script',
                text: 'ТЕКСТ',
                chars: 5,
                truncated: false,
            }),
        ).toBe('ЗАГОЛОВОК:\n\nТЕКСТ');
    });
});
