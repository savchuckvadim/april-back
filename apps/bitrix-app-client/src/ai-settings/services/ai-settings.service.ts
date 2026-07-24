import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { PortalStoreService } from '@lib/portal-lib/store/portal-store.service';
import {
    KnowledgeContentService,
    KnowledgeStorageService,
    KNOWN_KNOWLEDGE_KINDS,
    KnowledgeKindInfo,
} from '@lib/ai-rag';
import { CallTypeRegistry, CallTypeRegistryService } from '@lib/call-lib';
import {
    AiSettingsDocumentContentDto,
    AiSettingsDocumentDto,
    AiSettingsPortalDto,
} from '../dto/ai-settings.dto';

/**
 * Клиентское управление СВОИМИ AI-материалами (кабинет в приложении
 * Bitrix): документы клиентского слоя базы знаний по доменам порталов
 * клиента. Общие материалы April видны только на чтение — редактирует
 * их админка.
 *
 * Изоляция: каждый метод проверяет, что домен принадлежит порталам
 * авторизованного клиента (client_id из JWT) — чужой домен = 403.
 * После правок сбрасываются связанные in-memory кэши (реестр типов).
 */
@Injectable()
export class AiSettingsService {
    private readonly logger = new Logger(AiSettingsService.name);

    constructor(
        private readonly portalStore: PortalStoreService,
        private readonly knowledgeStorage: KnowledgeStorageService,
        private readonly knowledgeContent: KnowledgeContentService,
        private readonly callTypeRegistry: CallTypeRegistryService,
    ) {}

    /** Порталы клиента (для выбора домена в UI). */
    async getPortals(clientId: number): Promise<AiSettingsPortalDto[]> {
        const portals = await this.portalStore.getPortalsByClientId(clientId);
        return (portals ?? [])
            .filter(portal => portal.domain)
            .map(portal => ({
                id: Number(portal.id),
                domain: portal.domain as string,
            }));
    }

    /** Разделы базы знаний, доступные клиенту (реестр kind'ов). */
    kinds(): readonly KnowledgeKindInfo[] {
        return KNOWN_KNOWLEDGE_KINDS;
    }

    /**
     * Документы раздела для домена клиента: клиентские (editable) +
     * общие материалы April (только чтение) — клиент видит полную
     * картину того, что реально попадёт в анализ.
     */
    async listDocuments(
        clientId: number,
        domain: string,
        kind: string,
    ): Promise<AiSettingsDocumentDto[]> {
        await this.assertClientDomain(clientId, domain);
        // Оба слоя явно: клиентская база замещающая, а показать надо всё.
        const shared = await this.knowledgeStorage.listDocuments(
            undefined,
            kind,
        );
        const client = (
            await this.knowledgeStorage.listDocuments(domain, kind)
        ).filter(doc => doc.source === domain);
        return [
            ...client.map(doc => ({
                fileName: doc.fileName,
                kind: doc.kind,
                source: doc.source,
                editable: true,
            })),
            ...shared.map(doc => ({
                fileName: doc.fileName,
                kind: doc.kind,
                source: doc.source,
                editable: false,
            })),
        ];
    }

    /** Текст документа (клиентского или общего — общий только читается). */
    async readDocument(
        clientId: number,
        domain: string,
        kind: string,
        fileName: string,
    ): Promise<AiSettingsDocumentContentDto> {
        await this.assertClientDomain(clientId, domain);
        // Сначала ищем в клиентской базе, затем в общей.
        const clientDoc = await this.knowledgeStorage.findDocument(
            domain,
            kind,
            fileName,
        );
        const useClient = clientDoc?.source === domain;
        const content = await this.knowledgeContent.readDocument(
            useClient ? domain : undefined,
            kind,
            fileName,
        );
        return {
            fileName: content.fileName,
            kind: content.kind,
            source: content.source,
            editable: content.source === domain,
            text: content.text,
        };
    }

    /** Сохранение клиентского документа (upsert текста). */
    async upsertDocument(
        clientId: number,
        domain: string,
        kind: string,
        fileName: string,
        content: string,
    ): Promise<void> {
        await this.assertClientDomain(clientId, domain);
        await this.knowledgeStorage.saveTextDocument(
            kind,
            fileName,
            content,
            domain,
        );
        this.invalidateCaches(domain, kind);
        this.logger.log(
            `Клиент ${clientId} сохранил ${domain}/${kind}/${fileName}`,
        );
    }

    /** Удаление СТРОГО клиентского документа (общие клиент не трогает). */
    async deleteDocument(
        clientId: number,
        domain: string,
        kind: string,
        fileName: string,
    ): Promise<void> {
        await this.assertClientDomain(clientId, domain);
        await this.knowledgeStorage.deleteDocument(domain, kind, fileName);
        this.invalidateCaches(domain, kind);
        this.logger.log(
            `Клиент ${clientId} удалил ${domain}/${kind}/${fileName}`,
        );
    }

    /** Итоговый реестр типов звонков домена (встроенные+общие+клиентские). */
    async getCallTypes(
        clientId: number,
        domain: string,
    ): Promise<CallTypeRegistry> {
        await this.assertClientDomain(clientId, domain);
        return this.callTypeRegistry.resolve(domain);
    }

    /** Домен обязан принадлежать порталам клиента; иначе 403. */
    private async assertClientDomain(
        clientId: number,
        domain: string,
    ): Promise<void> {
        const portals = await this.getPortals(clientId);
        if (!portals.some(portal => portal.domain === domain)) {
            throw new ForbiddenException(
                'Домен не принадлежит порталам вашего аккаунта',
            );
        }
    }

    /** Правка материалов инвалидирует связанные in-memory кэши. */
    private invalidateCaches(domain: string, kind: string): void {
        if (kind === 'call-type-registry') {
            this.callTypeRegistry.invalidate(domain);
        }
    }
}
