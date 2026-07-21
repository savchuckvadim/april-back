import { NotFoundException } from '@nestjs/common';
import { KnowledgeContentService } from '../application/knowledge-content.service';

const DOCUMENT = {
    absolutePath: '/storage/app/ai-rag/knowledge/presentation/script.docx',
    fileName: 'script.docx',
    kind: 'presentation',
    source: 'shared',
};

const makeDeps = (options?: {
    documents?: (typeof DOCUMENT)[];
    findResult?: typeof DOCUMENT | undefined;
    unsupported?: boolean;
}) => {
    const knowledgeStorage = {
        findDocument: jest.fn().mockResolvedValue(options?.findResult),
        listDocuments: jest
            .fn()
            .mockResolvedValue(options?.documents ?? [DOCUMENT]),
    };
    const fileLoader = {
        isSupported: jest.fn(() => !options?.unsupported),
        extractText: jest.fn().mockResolvedValue('текст скрипта'),
    };
    const service = new KnowledgeContentService(
        knowledgeStorage as never,
        fileLoader as never,
    );
    return { service, knowledgeStorage, fileLoader };
};

describe('KnowledgeContentService', () => {
    it('readDocument возвращает извлечённый текст найденного документа', async () => {
        const { service } = makeDeps({ findResult: DOCUMENT });
        const content = await service.readDocument(
            undefined,
            'presentation',
            'script.docx',
        );
        expect(content).toEqual({
            fileName: 'script.docx',
            kind: 'presentation',
            source: 'shared',
            text: 'текст скрипта',
        });
    });

    it('readDocument бросает NotFound для несуществующего документа', async () => {
        const { service } = makeDeps({ findResult: undefined });
        await expect(
            service.readDocument(undefined, 'presentation', 'missing.docx'),
        ).rejects.toThrow(NotFoundException);
    });

    it('readAll пропускает неподдерживаемые форматы файлов', async () => {
        const { service, fileLoader } = makeDeps({ unsupported: true });
        const contents = await service.readAll(undefined, 'presentation');
        expect(contents).toEqual([]);
        expect(fileLoader.extractText).not.toHaveBeenCalled();
    });
});
