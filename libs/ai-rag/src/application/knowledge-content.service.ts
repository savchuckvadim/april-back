import { Injectable, NotFoundException } from '@nestjs/common';
import { KnowledgeStorageService } from '../infrastructure/knowledge/knowledge-storage.service';
import { FileLoaderService } from '../infrastructure/file-loader/file-loader.service';
import { KnowledgeDocument } from '../domain/types/knowledge.type';

export interface KnowledgeDocumentContent {
    fileName: string;
    kind: string;
    source: string;
    /** Извлечённый текст документа (PDF/DOCX/XLSX/TXT/MD → plain text). */
    text: string;
}

/**
 * Отдаёт содержимое документов базы знаний в виде извлечённого текста.
 * Нужен внешним потребителям (Agent API, админка), которым удобнее
 * работать с готовым текстом, чем с бинарными файлами.
 */
@Injectable()
export class KnowledgeContentService {
    constructor(
        private readonly knowledgeStorage: KnowledgeStorageService,
        private readonly fileLoader: FileLoaderService,
    ) {}

    /** Текст одного документа по (domain?, kind, fileName). */
    async readDocument(
        domain: string | undefined,
        kind: string,
        fileName: string,
    ): Promise<KnowledgeDocumentContent> {
        const document = await this.knowledgeStorage.findDocument(
            domain,
            kind,
            fileName,
        );
        if (!document) {
            throw new NotFoundException(
                `Документ "${fileName}" не найден для (${domain ?? 'shared'}, ${kind}).`,
            );
        }
        return this.extract(document);
    }

    /** Тексты всех документов пары (domain?, kind) — материал для скилла агента. */
    async readAll(
        domain: string | undefined,
        kind: string,
    ): Promise<KnowledgeDocumentContent[]> {
        const documents = await this.knowledgeStorage.listDocuments(
            domain,
            kind,
        );
        const contents: KnowledgeDocumentContent[] = [];
        for (const document of documents) {
            if (!this.fileLoader.isSupported(document.absolutePath)) continue;
            contents.push(await this.extract(document));
        }
        return contents;
    }

    private async extract(
        document: KnowledgeDocument,
    ): Promise<KnowledgeDocumentContent> {
        const text = await this.fileLoader.extractText(document.absolutePath);
        return {
            fileName: document.fileName,
            kind: document.kind,
            source: document.source,
            text,
        };
    }
}
