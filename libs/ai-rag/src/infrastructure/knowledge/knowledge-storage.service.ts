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
     * Возвращает документы для запроса (domain?, kind): ОБЩАЯ база плюс
     * материалы портала. Внутри базы сначала general/, затем {kind}/.
     *
     * СЛИЯНИЕ, А НЕ ЗАМЕЩЕНИЕ (прод-баг, найден 23.08.2026): раньше
     * выбирался ОДИН источник — при наличии папки портала общая база не
     * читалась вообще, и один портальный документ молча отключал ВСЕ
     * методички компании для этого портала. Теперь портальные документы
     * ДОПОЛНЯЮТ общие, а одноимённый файл портала ПЕРЕОПРЕДЕЛЯЕТ общий
     * (в паре (kind, fileName) побеждает портальный).
     */
    async listDocuments(
        domain: string | undefined,
        kind: string,
    ): Promise<KnowledgeDocument[]> {
        const sanitizedDomain = this.sanitizeOptionalDomain(domain);
        const sanitizedKind = this.requireValidKind(kind);

        const kinds =
            sanitizedKind === KNOWLEDGE_GENERAL_KIND
                ? [KNOWLEDGE_GENERAL_KIND]
                : [KNOWLEDGE_GENERAL_KIND, sanitizedKind];

        const shared: KnowledgeDocument[] = [];
        for (const item of kinds) {
            shared.push(
                ...(await this.listInSubPath(
                    KNOWLEDGE_ROOT_SUBPATH,
                    item,
                    'shared',
                )),
            );
        }
        if (!sanitizedDomain) return shared;

        const domainSubPath = path.join(
            KNOWLEDGE_ROOT_SUBPATH,
            sanitizedDomain,
        );
        const portal: KnowledgeDocument[] = [];
        for (const item of kinds) {
            portal.push(
                ...(await this.listInSubPath(
                    domainSubPath,
                    item,
                    sanitizedDomain,
                )),
            );
        }
        if (!portal.length) return shared;

        const overridden = new Set(
            portal.map(doc => `${doc.kind}/${doc.fileName}`),
        );
        return [
            ...shared.filter(
                doc => !overridden.has(`${doc.kind}/${doc.fileName}`),
            ),
            ...portal,
        ];
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

    /**
     * Домены, у которых есть собственная база знаний
     * (папки с точкой в имени внутри knowledge-корня).
     */
    async listDomains(): Promise<string[]> {
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
            .filter(entry => entry.name.includes('.'))
            .map(entry => entry.name)
            .sort((a, b) => a.localeCompare(b));
    }

    /**
     * Находит конкретный документ по (domain?, kind, fileName) среди
     * документов, которые реально попадут в RAG для этой пары.
     */
    async findDocument(
        domain: string | undefined,
        kind: string,
        fileName: string,
    ): Promise<KnowledgeDocument | undefined> {
        const safeFileName = this.requireSafeFileName(fileName);
        const documents = await this.listDocuments(domain, kind);
        return documents.find(doc => doc.fileName === safeFileName);
    }

    /**
     * Удаляет документ строго из указанной базы (без фолбэка на общую):
     * domain задан → клиентская папка, нет → общая.
     */
    async deleteDocument(
        domain: string | undefined,
        kind: string,
        fileName: string,
    ): Promise<void> {
        const sanitizedKind = this.requireValidKind(kind);
        const sanitizedDomain = this.sanitizeOptionalDomain(domain);
        const safeFileName = this.requireSafeFileName(fileName);
        const subPath = this.buildKindSubPath(sanitizedDomain, sanitizedKind);
        const absolutePath = this.storageService.getFilePath(
            StorageType.APP,
            subPath,
            safeFileName,
        );
        const exists = await this.storageService.fileExists(absolutePath);
        if (!exists) {
            throw new BadRequestException(
                `Документ "${fileName}" не найден в ${sanitizedDomain ?? 'shared'}/${sanitizedKind}.`,
            );
        }
        await this.storageService.deleteFile(absolutePath);
        this.logger.log(`Удалён документ ${safeFileName} из ${subPath}`);
    }

    /**
     * Сохраняет ТЕКСТОВЫЙ документ (редактор админки, без multipart):
     * контент строкой → файл .md/.txt/.json в kind-папке. Тот же fileName —
     * перезапись (upsert). Валидация имени — на уровне DTO endpoint'а.
     */
    async saveTextDocument(
        kind: string,
        fileName: string,
        content: string,
        domain?: string,
    ): Promise<KnowledgeUploadResult> {
        return this.saveDocument(
            { buffer: Buffer.from(content, 'utf-8'), originalname: fileName },
            kind,
            domain,
        );
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
