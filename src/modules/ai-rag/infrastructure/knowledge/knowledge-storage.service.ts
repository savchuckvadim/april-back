import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { StorageService, StorageType } from '@/core/storage/storage.service';
import {
    KNOWLEDGE_DOMAIN_PATTERN,
    KNOWLEDGE_GENERAL_KIND,
    KNOWLEDGE_KIND_PATTERN,
    KnowledgeDocument,
} from '../../domain/types/knowledge.type';

const KNOWLEDGE_ROOT_SUBPATH = path.join('ai-rag', 'knowledge');

interface UploadFile {
    buffer: Buffer;
    originalname: string;
}

@Injectable()
export class KnowledgeStorageService {
    private readonly logger = new Logger(KnowledgeStorageService.name);

    constructor(private readonly storageService: StorageService) {}

    /**
     * Возвращает документы для запроса (domain?, kind):
     * - если есть папка домена → берём её, иначе общую;
     * - в выбранной базе сначала general/, затем {kind}/.
     */
    async listDocuments(
        domain: string | undefined,
        kind: string,
    ): Promise<KnowledgeDocument[]> {
        const sanitizedDomain = this.sanitizeOptionalDomain(domain);
        const sanitizedKind = this.requireValidKind(kind);

        const baseSource = await this.resolveBaseSource(sanitizedDomain);
        const generalDocs = await this.listInSubPath(
            baseSource.subPath,
            KNOWLEDGE_GENERAL_KIND,
            baseSource.label,
        );

        if (sanitizedKind === KNOWLEDGE_GENERAL_KIND) {
            return generalDocs;
        }

        const typedDocs = await this.listInSubPath(
            baseSource.subPath,
            sanitizedKind,
            baseSource.label,
        );
        return [...generalDocs, ...typedDocs];
    }

    /**
     * Возвращает имена kind-папок в общей базе (без поддоменов; домены
     * распознаются по точке в имени).
     */
    async listKinds(): Promise<string[]> {
        const rootAbs = this.storageService.getFilePath(
            StorageType.APP,
            KNOWLEDGE_ROOT_SUBPATH,
            '',
        );
        let entries: import('node:fs').Dirent[];
        try {
            entries = await fs.readdir(rootAbs, { withFileTypes: true });
        } catch {
            return [];
        }
        return entries
            .filter(entry => entry.isDirectory())
            .filter(entry => !entry.name.includes('.'))
            .filter(entry => KNOWLEDGE_KIND_PATTERN.test(entry.name))
            .map(entry => entry.name)
            .sort((a, b) => a.localeCompare(b));
    }

    /** Сохраняет загруженный документ в общую (если domain не задан) или клиентскую базу. */
    async saveDocument(
        file: UploadFile,
        kind: string,
        domain?: string,
    ): Promise<KnowledgeUploadResult> {
        const sanitizedKind = this.requireValidKind(kind);
        const sanitizedDomain = this.sanitizeOptionalDomain(domain);
        const subPath = this.buildKindSubPath(sanitizedDomain, sanitizedKind);
        const safeFileName = this.requireSafeFileName(file.originalname);

        const absolutePath = await this.storageService.saveFile(
            file.buffer,
            safeFileName,
            StorageType.APP,
            subPath,
        );

        this.logger.log(
            `Загружен документ ${safeFileName} → ${subPath} (${absolutePath})`,
        );

        return {
            absolutePath,
            fileName: safeFileName,
            kind: sanitizedKind,
            source: sanitizedDomain ?? 'shared',
        };
    }

    private async resolveBaseSource(
        domain: string | undefined,
    ): Promise<{ subPath: string; label: string }> {
        if (!domain) {
            return { subPath: KNOWLEDGE_ROOT_SUBPATH, label: 'shared' };
        }
        const domainSubPath = path.join(KNOWLEDGE_ROOT_SUBPATH, domain);
        const absolute = this.storageService.getFilePath(
            StorageType.APP,
            domainSubPath,
            '',
        );
        const exists = await this.storageService.fileExists(absolute);
        if (exists) {
            return { subPath: domainSubPath, label: domain };
        }
        return { subPath: KNOWLEDGE_ROOT_SUBPATH, label: 'shared' };
    }

    private async listInSubPath(
        baseSubPath: string,
        kind: string,
        sourceLabel: string,
    ): Promise<KnowledgeDocument[]> {
        const subPath = path.join(baseSubPath, kind);
        const fileNames = await this.storageService.listFilesByType(
            StorageType.APP,
            subPath,
        );
        return fileNames
            .filter(
                name =>
                    !name.startsWith('.') && name.toLowerCase() !== 'readme.md',
            )
            .map(name => ({
                absolutePath: this.storageService.getFilePath(
                    StorageType.APP,
                    subPath,
                    name,
                ),
                fileName: name,
                kind,
                source: sourceLabel,
            }));
    }

    private buildKindSubPath(domain: string | undefined, kind: string): string {
        const base = domain
            ? path.join(KNOWLEDGE_ROOT_SUBPATH, domain)
            : KNOWLEDGE_ROOT_SUBPATH;
        return path.join(base, kind);
    }

    private requireValidKind(kind: string): string {
        const normalized = kind.trim().toLowerCase();
        if (!KNOWLEDGE_KIND_PATTERN.test(normalized)) {
            throw new BadRequestException(
                `Невалидный тип "${kind}". Допустимы латинские буквы, цифры и дефис.`,
            );
        }
        return normalized;
    }

    private sanitizeOptionalDomain(domain?: string): string | undefined {
        if (!domain) return undefined;
        const normalized = domain.trim().toLowerCase();
        if (!normalized) return undefined;
        if (!KNOWLEDGE_DOMAIN_PATTERN.test(normalized)) {
            throw new BadRequestException(`Невалидный domain "${domain}".`);
        }
        return normalized;
    }

    private requireSafeFileName(fileName: string): string {
        if (
            !fileName ||
            fileName.includes('/') ||
            fileName.includes('\\') ||
            fileName.includes('..') ||
            fileName.startsWith('.')
        ) {
            throw new BadRequestException(
                `Невалидное имя файла: "${fileName}".`,
            );
        }
        return fileName;
    }
}

export interface KnowledgeUploadResult {
    absolutePath: string;
    fileName: string;
    kind: string;
    source: string;
}
