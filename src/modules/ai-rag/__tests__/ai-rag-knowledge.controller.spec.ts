import { AiRagKnowledgeController } from '../controllers/ai-rag-knowledge.controller';
import { KnowledgeStorageService } from '../infrastructure/knowledge/knowledge-storage.service';
import { KnowledgeUploadParamsDto } from '../dto/knowledge-upload-params.dto';
import { KnowledgeUploadBodyDto } from '../dto/knowledge-upload-body.dto';
import { KnowledgeListQueryDto } from '../dto/knowledge-list-query.dto';

describe('AiRagKnowledgeController', () => {
    const storage: jest.Mocked<
        Pick<
            KnowledgeStorageService,
            'listKinds' | 'listDocuments' | 'saveDocument'
        >
    > = {
        listKinds: jest.fn(),
        listDocuments: jest.fn(),
        saveDocument: jest.fn(),
    };

    const controller = new AiRagKnowledgeController(
        storage as unknown as KnowledgeStorageService,
    );

    afterEach(() => jest.clearAllMocks());

    it('GET kinds — проксирует в storage.listKinds', async () => {
        storage.listKinds.mockResolvedValue(['general', 'resume']);
        const result: string[] = await controller.listKinds();
        expect(result).toEqual(['general', 'resume']);
    });

    it('GET / — без kind использует general', async () => {
        storage.listDocuments.mockResolvedValue([]);
        const query: KnowledgeListQueryDto = {};
        await controller.listDocuments(query);
        expect(storage.listDocuments).toHaveBeenCalledWith(
            undefined,
            'general',
        );
    });

    it('GET / — пробрасывает domain и kind', async () => {
        storage.listDocuments.mockResolvedValue([]);
        const query: KnowledgeListQueryDto = {
            domain: 'april.bitrix24.ru',
            kind: 'resume',
        };
        await controller.listDocuments(query);
        expect(storage.listDocuments).toHaveBeenCalledWith(
            'april.bitrix24.ru',
            'resume',
        );
    });

    it('POST /:kind — без domain — сохраняет в общую базу', async () => {
        storage.saveDocument.mockResolvedValue({
            absolutePath: '/x/y/note.pdf',
            fileName: 'note.pdf',
            kind: 'resume',
            source: 'shared',
        });
        const params: KnowledgeUploadParamsDto = { kind: 'resume' };
        const body: KnowledgeUploadBodyDto = {};
        const file = {
            buffer: Buffer.from('pdf'),
            originalname: 'note.pdf',
        } as Express.Multer.File;

        const result = await controller.upload(params, body, file);

        expect(storage.saveDocument).toHaveBeenCalledWith(
            { buffer: file.buffer, originalname: 'note.pdf' },
            'resume',
            undefined,
        );
        expect(result.source).toBe('shared');
    });

    it('POST /:kind — с domain — сохраняет в клиентскую базу', async () => {
        storage.saveDocument.mockResolvedValue({
            absolutePath: '/x/y/april.bitrix24.ru/resume/note.pdf',
            fileName: 'note.pdf',
            kind: 'resume',
            source: 'april.bitrix24.ru',
        });
        const params: KnowledgeUploadParamsDto = { kind: 'resume' };
        const body: KnowledgeUploadBodyDto = { domain: 'april.bitrix24.ru' };
        const file = {
            buffer: Buffer.from('pdf'),
            originalname: 'note.pdf',
        } as Express.Multer.File;

        await controller.upload(params, body, file);

        expect(storage.saveDocument).toHaveBeenCalledWith(
            { buffer: file.buffer, originalname: 'note.pdf' },
            'resume',
            'april.bitrix24.ru',
        );
    });
});
