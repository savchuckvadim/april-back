import {
    BadRequestException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '@/core/prisma/prisma.service';
import { StorageService, StorageType } from '@/core/storage/storage.service';
import { validateDocxFile } from '@/modules/offer-template/word/lib/file-validator';
import type { InvoiceTemplate, Prisma } from 'generated/prisma';
import {
    InvoiceTemplateType,
    InvoiceTemplateTypeValue,
    InvoiceTemplateVisibility,
    InvoiceTemplateVisibilityValue,
} from '../dto/invoice-template.enums';
import type { CreateInvoiceTemplateBodyDto } from '../dto/create-invoice-template.dto';
import type { InvoiceTemplateQueryDto } from '../dto/invoice-template-query.dto';
import { InvoiceTemplateResponseDto } from '../dto/invoice-template-response.dto';
import { UpdateInvoiceTemplateDto } from '../dto/update-invoice-template.dto';
import { InvoiceTemplateRepository } from '../repositories/invoice-template.repository';
import {
    mapInvoiceTemplateRowToDownloadMeta,
    mapInvoiceTemplateToResponseDto,
} from '../utils/invoice-template.mapper';
import { invoiceTemplateQueryToFindManyFilters } from '../utils/invoice-template.query-filters.util';
import { buildClearOtherDefaultsWhereInput } from '../utils/invoice-template.prisma-where.util';
import {
    buildConnectProviderAgentUpdateInput,
    buildDisconnectAgentUpdateInput,
} from '../utils/invoice-template.update-payloads.util';
import { parseInvoiceTemplateVisibilityScope } from '../utils/invoice-template.visibility-scope.util';
import { ConfigService } from '@nestjs/config';

const STORAGE_SUBPATH = 'konstructor/invoice-templates';

@Injectable()
export class InvoiceTemplateService {
    constructor(
        private readonly repository: InvoiceTemplateRepository,
        private readonly prisma: PrismaService,
        private readonly storageService: StorageService,
        private readonly configService: ConfigService,
    ) {}

    private templateDownloadPath(id: string): string {
        const baseUrl = this.configService.get<string>('APP_URL');
        return `${baseUrl}/api/invoice-templates/${id}/download`;
    }

    public toDto(row: InvoiceTemplate): InvoiceTemplateResponseDto {
        return mapInvoiceTemplateToResponseDto(row, id =>
            this.templateDownloadPath(id),
        );
    }

    private async assertAgentBelongsToPortal(
        agentId: bigint,
        portalId: bigint,
    ): Promise<void> {
        const agent = await this.prisma.agents.findUnique({
            where: { id: agentId },
        });
        if (!agent) {
            throw new NotFoundException(`Агент ${agentId} не найден`);
        }
        if (agent.portalId !== portalId) {
            throw new BadRequestException(
                'Агент не принадлежит указанному порталу',
            );
        }
    }

    private async clearOtherDefaultsInScope(
        visibility: InvoiceTemplateVisibilityValue,
        portal_id: bigint | null,
        agent_id: bigint | null,
        exceptId: string,
    ): Promise<void> {
        await this.repository.updateMany(
            buildClearOtherDefaultsWhereInput(
                visibility,
                portal_id,
                agent_id,
                exceptId,
            ),
            { is_default: false },
        );
    }

    async findById(id: string): Promise<InvoiceTemplateResponseDto> {
        const row = await this.repository.findById(id);
        if (!row) {
            throw new NotFoundException(`Шаблон счёта ${id} не найден`);
        }
        return this.toDto(row);
    }

    async innerFindById(id: string): Promise<InvoiceTemplate> {
        const row = await this.repository.findById(id);
        if (!row) {
            throw new NotFoundException(`Шаблон счёта ${id} не найден`);
        }
        return row;
    }

    async findMany(
        query?: InvoiceTemplateQueryDto,
    ): Promise<InvoiceTemplateResponseDto[]> {
        const rows = await this.repository.findMany(
            invoiceTemplateQueryToFindManyFilters(query),
        );
        return rows.map(r => this.toDto(r));
    }

    async findPublic(): Promise<InvoiceTemplateResponseDto[]> {
        const rows = await this.repository.findMany({
            visibility: InvoiceTemplateVisibility.PUBLIC,
            is_archived: false,
        });
        return rows.map(r => this.toDto(r));
    }

    async findByPortal(
        portalId: bigint,
    ): Promise<InvoiceTemplateResponseDto[]> {
        const rows = await this.repository.findMany({
            portal_id: portalId,
            is_archived: false,
        });
        return rows.map(r => this.toDto(r));
    }

    async create(
        body: CreateInvoiceTemplateBodyDto,
        file?: Express.Multer.File,
    ): Promise<InvoiceTemplateResponseDto> {
        validateDocxFile(file);
        if (!file) {
            throw new BadRequestException('Нужен файл шаблона (.docx)');
        }

        const visibility = body.visibility ?? InvoiceTemplateVisibility.PORTAL;
        let portalId: bigint | null =
            body.portal_id != null ? BigInt(body.portal_id) : null;
        let agentId: bigint | null =
            body.agent_id != null ? BigInt(body.agent_id) : null;

        const scope = parseInvoiceTemplateVisibilityScope(
            visibility,
            portalId,
            agentId,
        );
        portalId = scope.portal_id;
        agentId = scope.agent_id;

        if (agentId != null && portalId != null) {
            await this.assertAgentBelongsToPortal(agentId, portalId);
        }

        const id = randomUUID();
        const code = `invoice-${randomUUID()}`;
        const fileName = `${Date.now()}_${file.originalname}`;
        const filePath = await this.storageService.saveFile(
            file.buffer,
            fileName,
            StorageType.PUBLIC,
            STORAGE_SUBPATH,
        );

        const createData: Prisma.InvoiceTemplateCreateInput = {
            id,
            name: body.name,
            visibility,
            file_path: filePath,
            type: body.type ?? InvoiceTemplateType.WORD,
            code,
            counter: 0,
            description: body.description ?? null,
            is_default: body.is_default ?? false,
            is_active: body.is_active ?? true,
            is_archived: false,
        };
        if (portalId != null) {
            createData.portal = { connect: { id: portalId } };
        }
        if (agentId != null) {
            createData.agent = { connect: { id: agentId } };
        }
        if (body.creator_bitrix_user_id != null) {
            createData.creator_bitrix_user_id = BigInt(
                body.creator_bitrix_user_id,
            );
        }

        const created = await this.repository.create(createData);

        const defaultChosen = body.is_default ?? false;
        if (defaultChosen) {
            await this.clearOtherDefaultsInScope(
                visibility,
                portalId,
                agentId,
                id,
            );
        }

        return this.toDto(created);
    }

    async update(
        id: string,
        dto: UpdateInvoiceTemplateDto,
        file?: Express.Multer.File,
    ): Promise<InvoiceTemplateResponseDto> {
        const existing = await this.repository.findById(id);
        if (!existing) {
            throw new NotFoundException(`Шаблон счёта ${id} не найден`);
        }

        const visibility = (dto.visibility ??
            existing.visibility) as InvoiceTemplateVisibilityValue;
        let portalId: bigint | null =
            dto.portal_id !== undefined
                ? dto.portal_id != null
                    ? BigInt(dto.portal_id)
                    : null
                : existing.portal_id;
        let agentId: bigint | null =
            dto.agent_id !== undefined
                ? dto.agent_id != null
                    ? BigInt(dto.agent_id)
                    : null
                : existing.agent_id;

        if (visibility === InvoiceTemplateVisibility.PUBLIC) {
            portalId = null;
            agentId = null;
        }

        if (
            dto.visibility !== undefined ||
            dto.portal_id !== undefined ||
            dto.agent_id !== undefined
        ) {
            const scope = parseInvoiceTemplateVisibilityScope(
                visibility,
                portalId,
                agentId,
            );
            portalId = scope.portal_id;
            agentId = scope.agent_id;
        }

        if (agentId != null && portalId != null) {
            await this.assertAgentBelongsToPortal(agentId, portalId);
        }

        const updateData: Prisma.InvoiceTemplateUpdateInput = {
            name: dto.name,
            description: dto.description,
            is_default: dto.is_default,
            is_active: dto.is_active,
        };
        if (dto.visibility !== undefined) {
            updateData.visibility = dto.visibility;
        }
        if (dto.type !== undefined) {
            updateData.type = dto.type;
        }

        if (
            dto.visibility !== undefined ||
            dto.portal_id !== undefined ||
            dto.agent_id !== undefined
        ) {
            updateData.portal =
                portalId != null
                    ? { connect: { id: portalId } }
                    : { disconnect: true };
            updateData.agent =
                agentId != null
                    ? { connect: { id: agentId } }
                    : { disconnect: true };
        }

        if (file) {
            validateDocxFile(file);
            if (existing.file_path) {
                try {
                    await this.storageService.deleteFile(existing.file_path);
                } catch {
                    /* ignore */
                }
            }
            const fileName = `${Date.now()}_${file.originalname}`;
            updateData.file_path = await this.storageService.saveFile(
                file.buffer,
                fileName,
                StorageType.PUBLIC,
                STORAGE_SUBPATH,
            );
        }

        const isDefaultAfterUpdate =
            dto.is_default !== undefined ? dto.is_default : existing.is_default;

        const updated = await this.repository.update(id, updateData);

        if (isDefaultAfterUpdate) {
            await this.clearOtherDefaultsInScope(
                visibility,
                portalId,
                agentId,
                id,
            );
        }

        return this.toDto(updated);
    }

    async delete(id: string): Promise<void> {
        const existing = await this.repository.findById(id);
        if (!existing) {
            throw new NotFoundException(`Шаблон счёта ${id} не найден`);
        }
        if (existing.file_path) {
            try {
                await this.storageService.deleteFile(existing.file_path);
            } catch {
                /* ignore */
            }
        }
        await this.repository.delete(id);
    }

    async setPortal(
        id: string,
        portal_id: string | null | undefined,
    ): Promise<InvoiceTemplateResponseDto> {
        if (portal_id === undefined) {
            throw new BadRequestException('Укажите portal_id или null');
        }
        const existing = await this.repository.findById(id);
        if (!existing) {
            throw new NotFoundException(`Шаблон счёта ${id} не найден`);
        }

        const portalBig = portal_id != null ? BigInt(portal_id) : null;

        const updateData: Prisma.InvoiceTemplateUpdateInput = {
            portal:
                portalBig != null
                    ? { connect: { id: portalBig } }
                    : { disconnect: true },
        };

        if (portalBig == null) {
            updateData.agent = { disconnect: true };
            if (existing.visibility !== InvoiceTemplateVisibility.PUBLIC) {
                updateData.visibility = InvoiceTemplateVisibility.PUBLIC;
            }
        }

        const updated = await this.repository.update(id, updateData);
        return this.toDto(updated);
    }

    async setAgent(
        id: string,
        agent_id: string | null | undefined,
    ): Promise<InvoiceTemplateResponseDto> {
        if (agent_id === undefined) {
            throw new BadRequestException('Укажите agent_id или null');
        }
        const existing = await this.repository.findById(id);
        if (!existing) {
            throw new NotFoundException(`Шаблон счёта ${id} не найден`);
        }

        if (agent_id == null) {
            const updated = await this.repository.update(
                id,
                buildDisconnectAgentUpdateInput(existing.portal_id != null),
            );
            return this.toDto(updated);
        }

        const agentBig = BigInt(agent_id);
        if (existing.portal_id == null) {
            throw new BadRequestException(
                'Сначала привяжите портал — agent возможен только с portal_id',
            );
        }
        await this.assertAgentBelongsToPortal(agentBig, existing.portal_id);

        const updated = await this.repository.update(
            id,
            buildConnectProviderAgentUpdateInput(agentBig),
        );
        return this.toDto(updated);
    }

    async setActive(
        id: string,
        is_active: boolean,
    ): Promise<InvoiceTemplateResponseDto> {
        await this.findById(id);
        const updated = await this.repository.update(id, { is_active });
        return this.toDto(updated);
    }

    async setDefault(
        id: string,
        is_default: boolean,
    ): Promise<InvoiceTemplateResponseDto> {
        const existing = await this.repository.findById(id);
        if (!existing) {
            throw new NotFoundException(`Шаблон счёта ${id} не найден`);
        }

        if (is_default) {
            await this.clearOtherDefaultsInScope(
                existing.visibility as InvoiceTemplateVisibilityValue,
                existing.portal_id,
                existing.agent_id,
                id,
            );
        }

        const updated = await this.repository.update(id, { is_default });
        return this.toDto(updated);
    }

    async archive(id: string): Promise<InvoiceTemplateResponseDto> {
        await this.findById(id);
        const updated = await this.repository.update(id, {
            is_archived: true,
            archived_at: new Date(),
        });
        return this.toDto(updated);
    }

    async unarchive(id: string): Promise<InvoiceTemplateResponseDto> {
        await this.findById(id);
        const updated = await this.repository.update(id, {
            is_archived: false,
            archived_at: null,
        });
        return this.toDto(updated);
    }

    /** Для скачивания: сырой путь к файлу */
    async getFilePathForDownload(id: string): Promise<{
        file_path: string;
        name: string;
        type: InvoiceTemplateTypeValue;
    }> {
        const row = await this.repository.findById(id);
        if (!row) {
            throw new NotFoundException(`Шаблон счёта ${id} не найден`);
        }
        if (!row.file_path) {
            throw new NotFoundException('Файл шаблона не задан');
        }
        return mapInvoiceTemplateRowToDownloadMeta(row);
    }
}
