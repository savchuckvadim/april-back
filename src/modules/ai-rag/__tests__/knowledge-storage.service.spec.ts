import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StorageService } from '@/core/storage/storage.service';
import { KnowledgeStorageService } from '../infrastructure/knowledge/knowledge-storage.service';

function makeConfig(storagePath: string): ConfigService {
    return {
        get: jest
            .fn()
            .mockImplementation((key: string) =>
                key === 'STORAGE_PATH' ? storagePath : undefined,
            ),
    } as unknown as ConfigService;
}

describe('KnowledgeStorageService', () => {
    let tmpDir: string;
    let knowledgeRoot: string;
    let service: KnowledgeStorageService;

    beforeEach(async () => {
        tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-rag-knowledge-'));
        knowledgeRoot = path.join(tmpDir, 'app', 'ai-rag', 'knowledge');
        await fs.mkdir(knowledgeRoot, { recursive: true });
        const storage = new StorageService(makeConfig(tmpDir));
        service = new KnowledgeStorageService(storage);
    });

    afterEach(async () => {
        await fs.rm(tmpDir, { recursive: true, force: true });
    });

    async function touch(relPath: string, content = 'data'): Promise<void> {
        const full = path.join(knowledgeRoot, relPath);
        await fs.mkdir(path.dirname(full), { recursive: true });
        await fs.writeFile(full, content);
    }

    describe('listKinds', () => {
        it('возвращает имена kind-папок без доменов (с точкой)', async () => {
            await fs.mkdir(path.join(knowledgeRoot, 'general'), {
                recursive: true,
            });
            await fs.mkdir(path.join(knowledgeRoot, 'resume'), {
                recursive: true,
            });
            await fs.mkdir(path.join(knowledgeRoot, 'recomendation'), {
                recursive: true,
            });
            await fs.mkdir(path.join(knowledgeRoot, 'april.bitrix24.ru'), {
                recursive: true,
            });
            await touch('readme.md');

            const kinds = await service.listKinds();
            expect(kinds).toEqual(['general', 'recomendation', 'resume']);
        });

        it('возвращает пустой массив если папка не существует', async () => {
            await fs.rm(knowledgeRoot, { recursive: true, force: true });
            await expect(service.listKinds()).resolves.toEqual([]);
        });
    });

    describe('listDocuments', () => {
        it('без domain — берёт общую базу: general + kind', async () => {
            await touch('general/global.txt');
            await touch('resume/r.txt');
            await touch('recomendation/c.txt');

            const docs = await service.listDocuments(undefined, 'resume');
            const names = docs.map(d => d.fileName).sort();
            expect(names).toEqual(['global.txt', 'r.txt']);
            for (const doc of docs) {
                expect(doc.source).toBe('shared');
            }
        });

        it('с domain, но без папки домена — fallback на общую', async () => {
            await touch('general/global.txt');
            await touch('resume/r.txt');

            const docs = await service.listDocuments(
                'unknown.bitrix24.ru',
                'resume',
            );
            for (const doc of docs) {
                expect(doc.source).toBe('shared');
            }
        });

        it('с domain и папкой — берёт ТОЛЬКО клиентскую базу', async () => {
            await touch('general/shared-global.txt');
            await touch('resume/shared-r.txt');
            await touch('april.bitrix24.ru/general/client-global.txt');
            await touch('april.bitrix24.ru/resume/client-r.txt');

            const docs = await service.listDocuments(
                'april.bitrix24.ru',
                'resume',
            );
            const names = docs.map(d => d.fileName).sort();
            expect(names).toEqual(['client-global.txt', 'client-r.txt']);
            for (const doc of docs) {
                expect(doc.source).toBe('april.bitrix24.ru');
            }
        });

        it('kind=general — возвращает только содержимое general/, не дублирует', async () => {
            await touch('general/a.txt');
            await touch('resume/b.txt');

            const docs = await service.listDocuments(undefined, 'general');
            expect(docs.map(d => d.fileName).sort()).toEqual(['a.txt']);
        });

        it('бросает BadRequestException на невалидный kind', async () => {
            await expect(
                service.listDocuments(undefined, '../escape'),
            ).rejects.toBeInstanceOf(BadRequestException);
        });

        it('бросает BadRequestException на невалидный domain', async () => {
            await expect(
                service.listDocuments('../escape', 'resume'),
            ).rejects.toBeInstanceOf(BadRequestException);
        });
    });

    describe('saveDocument', () => {
        const file = { buffer: Buffer.from('hi'), originalname: 'note.txt' };

        it('без domain — сохраняет в общую базу', async () => {
            const result = await service.saveDocument(file, 'resume');
            expect(result.source).toBe('shared');
            expect(result.kind).toBe('resume');
            expect(result.fileName).toBe('note.txt');
            const expected = path.join(knowledgeRoot, 'resume', 'note.txt');
            await expect(fs.readFile(expected, 'utf-8')).resolves.toBe('hi');
        });

        it('с domain — сохраняет в клиентскую базу (создаёт папку)', async () => {
            const result = await service.saveDocument(
                file,
                'resume',
                'april.bitrix24.ru',
            );
            expect(result.source).toBe('april.bitrix24.ru');
            const expected = path.join(
                knowledgeRoot,
                'april.bitrix24.ru',
                'resume',
                'note.txt',
            );
            await expect(fs.readFile(expected, 'utf-8')).resolves.toBe('hi');
        });

        it('бросает BadRequestException на kind с пробелом', async () => {
            await expect(
                service.saveDocument(file, 'bad kind'),
            ).rejects.toBeInstanceOf(BadRequestException);
        });

        it('бросает BadRequestException на путь с ".." в имени файла', async () => {
            await expect(
                service.saveDocument(
                    { buffer: Buffer.from('x'), originalname: '../evil.txt' },
                    'resume',
                ),
            ).rejects.toBeInstanceOf(BadRequestException);
        });
    });
});
