import { BadRequestException, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { serializeTemplateList } from '@lib/portal-lib/konstructor/document-template';
import type { Prisma } from 'generated/prisma';
import {
    CONTRACT_LTYPE,
    ContractTemplateScope,
} from '../dto/contract-template.enums';
import type { CreateContractTemplateBodyDto } from '../dto/create-contract-template.dto';
import type { UpdateContractTemplateDto } from '../dto/update-contract-template.dto';
import type { ContractTemplateResponseDto } from '../dto/contract-template-response.dto';
import {
    ContractTemplateRepository,
    type ContractTemplateTxClient,
} from '../repositories/contract-template.repository';
import { buildClearOtherDefaultsWhere } from '../utils/contract-template.prisma-where.util';
import {
    parseOptionalBigInt,
    resolveContractTemplateScope,
} from '../utils/contract-template.scope.util';
import { buildContractTemplateUpdateData } from '../utils/contract-template.update-payload.util';
import { ContractTemplateAgentService } from './contract-template-agent.service';
import {
    ContractTemplateFilesService,
    type ContractTemplateUploads,
} from './contract-template-files.service';
import { ContractTemplateQueryService } from './contract-template-query.service';

export type { ContractTemplateUploads };

/**
 * Команды над шаблонами договора: создание, обновление, флаги, архив,
 * удаление.
 *
 * Чтение живёт в {@link ContractTemplateQueryService}, файлы — в
 * {@link ContractTemplateFilesService}, проверка поставщика — в
 * {@link ContractTemplateAgentService}. Разделение не косметическое: до
 * него класс был 547 строк (лимит CLAUDE.md — 200–300) и тянул в юнит-тест
 * домена моки хранилища и Prisma.
 */
@Injectable()
export class ContractTemplateService {
    constructor(
        private readonly repository: ContractTemplateRepository,
        private readonly queryService: ContractTemplateQueryService,
        private readonly filesService: ContractTemplateFilesService,
        private readonly agentService: ContractTemplateAgentService,
    ) {}

    async create(
        body: CreateContractTemplateBodyDto,
        uploads: ContractTemplateUploads,
    ): Promise<ContractTemplateResponseDto> {
        this.filesService.assertCreateUploads(uploads);

        const scope = resolveContractTemplateScope(
            body.scope ?? ContractTemplateScope.PORTAL,
            parseOptionalBigInt(body.portal_id),
            parseOptionalBigInt(body.agent_id),
        );
        // Проверяем ДО записи файлов: иначе отказ по чужому поставщику
        // оставлял бы в хранилище осиротевший .docx.
        await this.agentService.assertScopeAgent(
            scope.agent_id,
            scope.portal_id,
        );

        const paths = await this.filesService.saveCreateUploads(uploads);

        // created_at / updated_at проставляются ЯВНО: у колонок нет
        // DB-дефолта и нет @updatedAt в схеме. Глобальное расширение
        // Prisma их тоже подставляет, но полагаться только на него нельзя —
        // модуль обязан быть корректен сам по себе.
        const now = new Date();
        const data: Prisma.ContractTemplateCreateInput = {
            name: body.name,
            code: `contract-${randomUUID()}`,
            contract_type: body.contract_type,
            client_types: serializeTemplateList(body.client_types),
            supply_types: serializeTemplateList(body.supply_types),
            description: body.description ?? null,
            file_path: paths.file_path,
            demo_path: paths.demo_path,
            portal_id: scope.portal_id,
            agent_id: scope.agent_id,
            is_default: body.is_default ?? false,
            is_active: body.is_active ?? true,
            is_archived: false,
            creator_bitrix_user_id: parseOptionalBigInt(
                body.creator_bitrix_user_id,
            ),
            created_at: now,
            updated_at: now,
        };

        // Создание + снятие флага у остальных — в одной транзакции, иначе
        // падение между ними оставляет в области два шаблона по умолчанию.
        const created = await this.repository.runInTransaction(async tx => {
            const row = await this.repository.create(data, tx);
            if (row.is_default) {
                await this.clearOtherDefaults(
                    scope.portal_id,
                    scope.agent_id,
                    body.contract_type,
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
        dto: UpdateContractTemplateDto,
        uploads: ContractTemplateUploads = {},
    ): Promise<ContractTemplateResponseDto> {
        const existing = await this.queryService.getEntityOrFail(id);

        const portalId =
            dto.portal_id !== undefined
                ? parseOptionalBigInt(dto.portal_id)
                : existing.portal_id;
        const agentId =
            dto.agent_id !== undefined
                ? parseOptionalBigInt(dto.agent_id)
                : existing.agent_id;

        // Поставщик без портала невозможен: область шаблона — пара
        // (portal_id, agent_id), и «любой портал + конкретный поставщик»
        // не имеет смысла.
        if (agentId != null && portalId == null) {
            throw new BadRequestException(
                'Нельзя оставить поставщика без портала: ' +
                    'сначала привяжите портал или снимите поставщика',
            );
        }
        await this.agentService.assertScopeAgent(agentId, portalId);

        const contractType = (dto.contract_type ??
            existing.contract_type) as CONTRACT_LTYPE;
        const now = new Date();
        const data = buildContractTemplateUpdateData(
            dto,
            { portal_id: portalId, agent_id: agentId },
            now,
        );

        if (uploads.file) {
            data.file_path = await this.filesService.replaceUpload(
                uploads.file,
                existing.file_path,
            );
        }
        if (uploads.demo) {
            data.demo_path = await this.filesService.replaceUpload(
                uploads.demo,
                existing.demo_path,
            );
        }

        const isDefaultAfter = dto.is_default ?? existing.is_default;

        const updated = await this.repository.runInTransaction(async tx => {
            const row = await this.repository.update(id, data, tx);
            if (isDefaultAfter) {
                await this.clearOtherDefaults(
                    portalId,
                    agentId,
                    contractType,
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
    ): Promise<ContractTemplateResponseDto> {
        await this.queryService.getEntityOrFail(id);
        const parsed = parseOptionalBigInt(portalId);
        // Портал снят → шаблон становится общим, поставщик обязан уйти с ним.
        const data: Prisma.ContractTemplateUpdateInput = {
            portal_id: parsed,
            updated_at: new Date(),
        };
        if (parsed == null) {
            data.agent_id = null;
        }
        return this.applyPatch(id, data);
    }

    async setAgent(
        id: bigint,
        agentId: string | null | undefined,
    ): Promise<ContractTemplateResponseDto> {
        const existing = await this.queryService.getEntityOrFail(id);
        const parsed = parseOptionalBigInt(agentId);

        if (parsed != null) {
            if (existing.portal_id == null) {
                throw new BadRequestException(
                    'Сначала привяжите портал: поставщик возможен только с portal_id',
                );
            }
            await this.agentService.assertAgentBelongsToPortal(
                parsed,
                existing.portal_id,
            );
        }

        return this.applyPatch(id, {
            agent_id: parsed,
            updated_at: new Date(),
        });
    }

    async setActive(
        id: bigint,
        isActive: boolean,
    ): Promise<ContractTemplateResponseDto> {
        await this.queryService.getEntityOrFail(id);
        return this.applyPatch(id, {
            is_active: isActive,
            updated_at: new Date(),
        });
    }

    /** Флаг «по умолчанию» в области (портал + поставщик + ТИП ДОГОВОРА). */
    async setDefault(
        id: bigint,
        isDefault: boolean,
    ): Promise<ContractTemplateResponseDto> {
        const existing = await this.queryService.getEntityOrFail(id);

        const updated = await this.repository.runInTransaction(async tx => {
            const row = await this.repository.update(
                id,
                { is_default: isDefault, updated_at: new Date() },
                tx,
            );
            if (isDefault) {
                await this.clearOtherDefaults(
                    existing.portal_id,
                    existing.agent_id,
                    existing.contract_type as CONTRACT_LTYPE,
                    id,
                    tx,
                );
            }
            return row;
        });

        return this.queryService.toDto(updated);
    }

    /** В архив: шаблон перестаёт участвовать в подборе. */
    async archive(id: bigint): Promise<ContractTemplateResponseDto> {
        await this.queryService.getEntityOrFail(id);
        const now = new Date();
        return this.applyPatch(id, {
            is_archived: true,
            archived_at: now,
            // Архивный шаблон не может оставаться «по умолчанию»: иначе
            // область указывает на строку, которую подбор не видит, и
            // генерация молча уходит в fallback.
            is_default: false,
            updated_at: now,
        });
    }

    /**
     * Из архива: снимаем и флаг, и дату. `is_default` НЕ восстанавливаем —
     * за время архива флаг мог уехать другой строке, и возврат двух
     * «по умолчанию» в одну область хуже, чем ни одного.
     */
    async unarchive(id: bigint): Promise<ContractTemplateResponseDto> {
        await this.queryService.getEntityOrFail(id);
        return this.applyPatch(id, {
            is_archived: false,
            archived_at: null,
            updated_at: new Date(),
        });
    }

    async delete(id: bigint): Promise<void> {
        const existing = await this.queryService.getEntityOrFail(id);
        await this.filesService.removeStoredFile(existing.file_path);
        await this.filesService.removeStoredFile(existing.demo_path);
        await this.repository.delete(id);
    }

    private async applyPatch(
        id: bigint,
        data: Prisma.ContractTemplateUpdateInput,
    ): Promise<ContractTemplateResponseDto> {
        return this.queryService.toDto(await this.repository.update(id, data));
    }

    /**
     * Снять «по умолчанию» у остальных шаблонов ТОЙ ЖЕ области.
     *
     * Область включает `contract_type` — см.
     * {@link buildClearOtherDefaultsWhere}: без него установка шаблона по
     * умолчанию для `service` молча снимала бы флаг у шаблона для `abon`.
     */
    private async clearOtherDefaults(
        portalId: bigint | null,
        agentId: bigint | null,
        contractType: CONTRACT_LTYPE,
        exceptId: bigint,
        tx: ContractTemplateTxClient,
    ): Promise<void> {
        await this.repository.updateMany(
            buildClearOtherDefaultsWhere(
                portalId,
                agentId,
                contractType,
                exceptId,
            ),
            { is_default: false, updated_at: new Date() },
            tx,
        );
    }
}
