import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from 'generated/prisma';
import type { CreateSupplyReportTemplateBodyDto } from '../dto/create-supply-report-template.dto';
import type { UpdateSupplyReportTemplateDto } from '../dto/update-supply-report-template.dto';
import type { SupplyReportTemplateResponseDto } from '../dto/supply-report-template-response.dto';
import { SupplyReportTemplateRepository } from '../repositories/supply-report-template.repository';
import { resolveSupplyReportTemplateScope } from '../utils/supply-report-template.scope.util';
import {
    buildSupplyReportTemplateArchiveData,
    buildSupplyReportTemplateCreateData,
    buildSupplyReportTemplateUpdateData,
    parseOptionalBigInt,
} from '../utils/supply-report-template.payloads.util';
import {
    SupplyReportTemplateFilesService,
    type SupplyReportTemplateUploads,
} from './supply-report-template-files.service';
import { SupplyReportTemplateQueryService } from './supply-report-template-query.service';
import { SupplyReportTemplateScopeService } from './supply-report-template-scope.service';

export type { SupplyReportTemplateUploads };

/**
 * Запись и смена состояния шаблонов отчёта о поставке.
 *
 * Имя `...CrudService`, а не `SupplyReportTemplateService`, НАМЕРЕННО:
 * класс с последним именем уже существует
 * (`document-supply-report/services/template/supply-report-template.service.ts`)
 * и занимается рендером docx. Два провайдера с одинаковым именем класса в
 * одном приложении — источник путаницы при инъекции и в стектрейсах.
 *
 * Чтение живёт в `SupplyReportTemplateQueryService`, файлы — в
 * `SupplyReportTemplateFilesService`, инварианты области — в
 * `SupplyReportTemplateScopeService`, сборка payload-ов — в
 * `supply-report-template.payloads.util`. Этот класс только связывает их в
 * доменные операции.
 */
@Injectable()
export class SupplyReportTemplateCrudService {
    constructor(
        private readonly repository: SupplyReportTemplateRepository,
        private readonly queryService: SupplyReportTemplateQueryService,
        private readonly filesService: SupplyReportTemplateFilesService,
        private readonly scopeService: SupplyReportTemplateScopeService,
    ) {}

    async create(
        body: CreateSupplyReportTemplateBodyDto,
        uploads: SupplyReportTemplateUploads,
    ): Promise<SupplyReportTemplateResponseDto> {
        // Файлы и область проверяются ДО сохранения в хранилище: иначе
        // отказ по области оставил бы осиротевший файл.
        this.filesService.assertUploadsValid(uploads, true);

        const scope = resolveSupplyReportTemplateScope(
            body.scope,
            parseOptionalBigInt(body.portal_id),
            parseOptionalBigInt(body.agent_id),
        );
        if (scope.agent_id != null && scope.portal_id != null) {
            await this.scopeService.assertAgentBelongsToPortal(
                scope.agent_id,
                scope.portal_id,
            );
        }

        const file = uploads.file;
        if (!file) {
            // Недостижимо после assertUploadsValid, нужно для сужения типа.
            throw new NotFoundException('Файл шаблона не получен');
        }
        const data = buildSupplyReportTemplateCreateData(body, scope, {
            filePath: await this.filesService.save(file),
            demoPath: uploads.demo
                ? await this.filesService.save(uploads.demo)
                : null,
        });

        // Создание + снятие флага у остальных — в одной транзакции: падение
        // между ними оставляет в области два шаблона по умолчанию.
        const created = await this.repository.runInTransaction(async tx => {
            const row = await this.repository.create(data, tx);
            if (row.is_default) {
                await this.scopeService.clearOtherDefaults(
                    scope.portal_id,
                    scope.agent_id,
                    row.id,
                    tx,
                );
            }
            return row;
        });

        return this.queryService.toDto(created);
    }

    async update(
        id: bigint,
        dto: UpdateSupplyReportTemplateDto,
        uploads: SupplyReportTemplateUploads = {},
    ): Promise<SupplyReportTemplateResponseDto> {
        const existing = await this.queryService.getRowOrFail(id);
        this.filesService.assertUploadsValid(uploads, false);

        const portalId =
            dto.portal_id !== undefined
                ? parseOptionalBigInt(dto.portal_id)
                : existing.portal_id;
        const agentId =
            dto.agent_id !== undefined
                ? parseOptionalBigInt(dto.agent_id)
                : existing.agent_id;
        await this.scopeService.assertPairValid(portalId, agentId);

        const data = buildSupplyReportTemplateUpdateData(
            dto,
            portalId,
            agentId,
        );
        if (uploads.file) {
            data.file_path = await this.filesService.replace(
                uploads.file,
                existing.file_path,
            );
        }
        if (uploads.demo) {
            data.demo_path = await this.filesService.replace(
                uploads.demo,
                existing.demo_path,
            );
        }

        const isDefaultAfter = dto.is_default ?? existing.is_default;

        const updated = await this.repository.runInTransaction(async tx => {
            const row = await this.repository.update(id, data, tx);
            if (isDefaultAfter) {
                await this.scopeService.clearOtherDefaults(
                    portalId,
                    agentId,
                    id,
                    tx,
                );
            }
            return row;
        });

        return this.queryService.toDto(updated);
    }

    async setPortal(
        id: bigint,
        portalId: string | null | undefined,
    ): Promise<SupplyReportTemplateResponseDto> {
        await this.queryService.getRowOrFail(id);
        const parsed = parseOptionalBigInt(portalId);
        const data: Prisma.SupplyReportTemplateUpdateInput = {
            portal_id: parsed,
            updated_at: new Date(),
        };
        // Портал снят → шаблон становится общим, поставщик обязан уйти с ним.
        if (parsed == null) {
            data.agent_id = null;
        }
        return this.applyUpdate(id, data);
    }

    async setAgent(
        id: bigint,
        agentId: string | null | undefined,
    ): Promise<SupplyReportTemplateResponseDto> {
        const existing = await this.queryService.getRowOrFail(id);
        const parsed = parseOptionalBigInt(agentId);
        if (parsed != null) {
            await this.scopeService.assertPairValid(existing.portal_id, parsed);
        }
        return this.applyUpdate(id, { agent_id: parsed });
    }

    async setActive(
        id: bigint,
        isActive: boolean,
    ): Promise<SupplyReportTemplateResponseDto> {
        await this.queryService.getRowOrFail(id);
        return this.applyUpdate(id, { is_active: isActive });
    }

    /** Флаг «по умолчанию» в области (портал + поставщик). */
    async setDefault(
        id: bigint,
        isDefault: boolean,
    ): Promise<SupplyReportTemplateResponseDto> {
        const existing = await this.queryService.getRowOrFail(id);

        const updated = await this.repository.runInTransaction(async tx => {
            const row = await this.repository.update(
                id,
                { is_default: isDefault, updated_at: new Date() },
                tx,
            );
            if (isDefault) {
                await this.scopeService.clearOtherDefaults(
                    existing.portal_id,
                    existing.agent_id,
                    id,
                    tx,
                );
            }
            return row;
        });

        return this.queryService.toDto(updated);
    }

    async setArchived(
        id: bigint,
        isArchived: boolean,
    ): Promise<SupplyReportTemplateResponseDto> {
        await this.queryService.getRowOrFail(id);
        return this.queryService.toDto(
            await this.repository.update(
                id,
                buildSupplyReportTemplateArchiveData(isArchived),
            ),
        );
    }

    async delete(id: bigint): Promise<void> {
        const existing = await this.queryService.getRowOrFail(id);
        await this.filesService.remove(existing.file_path);
        await this.filesService.remove(existing.demo_path);
        await this.repository.delete(id);
    }

    /** Метаданные файла для скачивания — используется download-сервисом. */
    async getFileForDownload(
        id: bigint,
        demo = false,
    ): Promise<{ file_path: string; name: string }> {
        const row = await this.queryService.getRowOrFail(id);
        const path = demo ? row.demo_path : row.file_path;
        if (!path) {
            throw new NotFoundException(
                demo
                    ? 'Демонстрационный файл не загружен'
                    : 'Файл шаблона не задан',
            );
        }
        return { file_path: path, name: row.name };
    }

    /** Точечный UPDATE: `updated_at` поднимается всегда. */
    private async applyUpdate(
        id: bigint,
        data: Prisma.SupplyReportTemplateUpdateInput,
    ): Promise<SupplyReportTemplateResponseDto> {
        return this.queryService.toDto(
            await this.repository.update(id, {
                ...data,
                updated_at: new Date(),
            }),
        );
    }
}
