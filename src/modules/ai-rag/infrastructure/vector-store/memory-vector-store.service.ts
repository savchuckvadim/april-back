import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MemoryVectorStore } from 'langchain/vectorstores/memory';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import { Document } from '@langchain/core/documents';
import { EmbeddingsInterface } from '@langchain/core/embeddings';
import { BaseRetrieverInterface } from '@langchain/core/retrievers';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { FileLoaderService } from '../file-loader/file-loader.service';
import { KnowledgeStorageService } from '../knowledge/knowledge-storage.service';
import { KnowledgeDocument } from '../../domain/types/knowledge.type';
import { VectorStoreFactory } from '../../domain/interfaces/vector-store.interface';

const DEFAULT_VECTORSTORE_PATH = path.join(
    process.cwd(),
    'storage',
    'private',
    'ai-rag',
    'vector-store',
);

const INDEX_FILE_NAME = 'index.json';
const CHUNK_SIZE = 1000;
const CHUNK_OVERLAP = 200;
const TOP_K = 2;

interface PersistedVector {
    content: string;
    embedding: number[];
    metadata: Record<string, unknown>;
}

interface PersistedIndex {
    embeddingId: string;
    domainLabel: string;
    kind: string;
    contentHash: string;
    createdAt: string;
    vectors: PersistedVector[];
}

@Injectable()
export class MemoryVectorStoreService implements VectorStoreFactory {
    private readonly logger = new Logger(MemoryVectorStoreService.name);
    private readonly vectorstoreRoot: string;

    constructor(
        configService: ConfigService,
        private readonly fileLoaderService: FileLoaderService,
        private readonly knowledgeStorage: KnowledgeStorageService,
    ) {
        this.vectorstoreRoot =
            configService.get<string>('AI_RAG_VECTORSTORE_PATH') ??
            DEFAULT_VECTORSTORE_PATH;
    }

    async getRetriever(
        embeddings: EmbeddingsInterface,
        embeddingId: string,
        domain?: string,
        kind = 'general',
    ): Promise<BaseRetrieverInterface> {
        const store = await this.getVectorstore(
            embeddings,
            embeddingId,
            domain,
            kind,
        );
        return store.asRetriever({ k: TOP_K });
    }

    async getVectorstore(
        embeddings: EmbeddingsInterface,
        embeddingId: string,
        domain: string | undefined,
        kind: string,
    ): Promise<MemoryVectorStore> {
        const knowledgeDocs = await this.knowledgeStorage.listDocuments(
            domain,
            kind,
        );
        const supportedDocs = knowledgeDocs.filter(doc =>
            this.fileLoaderService.isSupported(doc.absolutePath),
        );
        const domainLabel = supportedDocs[0]?.source ?? domain ?? 'shared';
        const contentHash = await this.computeContentHash(supportedDocs);
        const indexDir = this.buildIndexDir(
            embeddingId,
            domainLabel,
            kind,
            contentHash,
        );
        const indexFile = path.join(indexDir, INDEX_FILE_NAME);

        const persisted = await this.tryLoadPersisted(indexFile);
        if (
            persisted &&
            persisted.contentHash === contentHash &&
            persisted.domainLabel === domainLabel &&
            persisted.kind === kind
        ) {
            this.logger.log(
                `Reusing vector index ${indexFile} (${persisted.vectors.length} vectors, source=${domainLabel}, kind=${kind})`,
            );
            return this.restoreStore(embeddings, persisted);
        }

        this.logger.log(
            `Building vector index for embeddingId=${embeddingId}, source=${domainLabel}, kind=${kind}, files=${supportedDocs.length}`,
        );
        const documents = await this.buildDocuments(supportedDocs);
        if (documents.length === 0) {
            throw new Error(
                `Нет корпоративных материалов для source=${domainLabel}, kind=${kind}. ` +
                    `Загрузите файлы через POST /ai-rag/knowledge/{kind}.`,
            );
        }

        const splitter = new RecursiveCharacterTextSplitter({
            chunkSize: CHUNK_SIZE,
            chunkOverlap: CHUNK_OVERLAP,
        });
        const splits = await splitter.splitDocuments(documents);

        const store = await MemoryVectorStore.fromDocuments(splits, embeddings);
        await this.persistStore(
            store,
            embeddingId,
            domainLabel,
            kind,
            contentHash,
            indexFile,
        );
        return store;
    }

    private async computeContentHash(
        docs: KnowledgeDocument[],
    ): Promise<string> {
        const hash = crypto.createHash('sha256');
        const sorted = [...docs].sort((a, b) =>
            a.absolutePath.localeCompare(b.absolutePath),
        );
        for (const doc of sorted) {
            const stat = await fs.stat(doc.absolutePath);
            hash.update(
                `${doc.kind}|${doc.fileName}|${stat.size}|${stat.mtimeMs}`,
            );
        }
        return hash.digest('hex').slice(0, 16);
    }

    private buildIndexDir(
        embeddingId: string,
        domainLabel: string,
        kind: string,
        contentHash: string,
    ): string {
        const key = [
            this.sanitize(embeddingId),
            this.sanitize(domainLabel),
            this.sanitize(kind),
            contentHash,
        ].join('__');
        return path.join(this.vectorstoreRoot, key);
    }

    private sanitize(value: string): string {
        return value.replace(/[^A-Za-z0-9_\-.]/g, '_');
    }

    private async tryLoadPersisted(
        indexFile: string,
    ): Promise<PersistedIndex | null> {
        try {
            const raw = await fs.readFile(indexFile, 'utf-8');
            return JSON.parse(raw) as PersistedIndex;
        } catch {
            return null;
        }
    }

    private restoreStore(
        embeddings: EmbeddingsInterface,
        persisted: PersistedIndex,
    ): MemoryVectorStore {
        const store = new MemoryVectorStore(embeddings);
        store.memoryVectors = persisted.vectors.map(vector => ({
            content: vector.content,
            embedding: vector.embedding,
            metadata: vector.metadata,
        }));
        return store;
    }

    private async buildDocuments(
        docs: KnowledgeDocument[],
    ): Promise<Document[]> {
        const documents: Document[] = [];
        for (const doc of docs) {
            try {
                const content = await this.fileLoaderService.extractText(
                    doc.absolutePath,
                );
                if (!content.trim()) continue;
                documents.push(
                    new Document({
                        pageContent: content,
                        metadata: {
                            source: doc.fileName,
                            kind: doc.kind,
                            origin: doc.source,
                        },
                    }),
                );
            } catch (error) {
                this.logger.warn(
                    `Пропущен ${doc.absolutePath}: ${(error as Error).message}`,
                );
            }
        }
        return documents;
    }

    private async persistStore(
        store: MemoryVectorStore,
        embeddingId: string,
        domainLabel: string,
        kind: string,
        contentHash: string,
        indexFile: string,
    ): Promise<void> {
        await fs.mkdir(path.dirname(indexFile), { recursive: true });
        const payload: PersistedIndex = {
            embeddingId,
            domainLabel,
            kind,
            contentHash,
            createdAt: new Date().toISOString(),
            vectors: store.memoryVectors.map(vector => ({
                content: vector.content,
                embedding: vector.embedding,
                metadata: vector.metadata,
            })),
        };
        await fs.writeFile(indexFile, JSON.stringify(payload));
    }
}
