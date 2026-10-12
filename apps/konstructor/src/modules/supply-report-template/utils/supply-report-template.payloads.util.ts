import { randomUUID } from 'crypto';
import { serializeTemplateList } from '@lib/portal-lib/konstructor/document-template';
import type { Prisma } from 'generated/prisma';
import type { CreateSupplyReportTemplateBodyDto } from '../dto/create-supply-report-template.dto';
import type { UpdateSupplyReportTemplateDto } from '../dto/update-supply-report-template.dto';
import type { SupplyReportTemplateScopePair } from './supply-report-template.scope.util';

/** `null`/пустая строка → NULL; иначе BIGINT. */
export function parseOptionalBigInt(
    value: string | null | undefined,
): bigint | null {
    if (value == null || value.trim() === '') {
        return null;
    }
    return BigInt(value);
}

/** Пути к файлам, уже сохранённым в хранилище. */
export type SupplyReportTemplateFilePaths = {
    filePath: string;
    demoPath: string | null;
};

/**
 * Полный payload создания.
 *
 * `created_at` / `updated_at` проставляются ЯВНО: у колонок нет DB-дефолта
 * и нет `@updatedAt` в схеме, поэтому без этих двух полей запись уходит с
 * NULL-таймстемпами и сортировка по свежести врёт.
 *
 * Пустые списки нормализуются в NULL (`serializeTemplateList`): NULL —
 * это «для любого типа» / «обязательность как в форме по умолчанию», а
 * строка `"[]"` означала бы «ни для кого».
 */
export function buildSupplyReportTemplateCreateData(
    body: CreateSupplyReportTemplateBodyDto,
    scope: SupplyReportTemplateScopePair,
    files: SupplyReportTemplateFilePaths,
    now: Date = new Date(),
): Prisma.SupplyReportTemplateCreateInput {
    return {
        name: body.name,
        code: `supply-report-${randomUUID()}`,
        client_types: serializeTemplateList(body.client_types),
        supply_types: serializeTemplateList(body.supply_types),
        required_fields: serializeTemplateList(body.required_fields),
        optional_fields: serializeTemplateList(body.optional_fields),
        description: body.description ?? null,
        file_path: files.filePath,
        demo_path: files.demoPath,
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
}

/**
 * Патч для UPDATE: только переданные поля.
 *
 * Отсутствие поля = «не менять», поэтому в payload оно не попадает — иначе
 * частичное обновление затирало бы колонки, которых админка не касалась.
 * Пустой массив в списках = «сбросить в NULL».
 */
export function buildSupplyReportTemplateUpdateData(
    dto: UpdateSupplyReportTemplateDto,
    portalId: bigint | null,
    agentId: bigint | null,
): Prisma.SupplyReportTemplateUpdateInput {
    const data: Prisma.SupplyReportTemplateUpdateInput = {
        updated_at: new Date(),
    };
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.client_types !== undefined) {
        data.client_types = serializeTemplateList(dto.client_types);
    }
    if (dto.supply_types !== undefined) {
        data.supply_types = serializeTemplateList(dto.supply_types);
    }
    if (dto.required_fields !== undefined) {
        data.required_fields = serializeTemplateList(dto.required_fields);
    }
    if (dto.optional_fields !== undefined) {
        data.optional_fields = serializeTemplateList(dto.optional_fields);
    }
    if (dto.portal_id !== undefined) data.portal_id = portalId;
    if (dto.agent_id !== undefined) data.agent_id = agentId;
    if (dto.is_active !== undefined) data.is_active = dto.is_active;
    if (dto.is_default !== undefined) data.is_default = dto.is_default;
    return data;
}

/**
 * Payload архивации/разархивации.
 *
 * Архивный шаблон не может оставаться «по умолчанию»: иначе область
 * указывает на строку, которую подбор не видит. При возврате из архива флаг
 * НЕ восстанавливается — кто там по умолчанию, решает администратор.
 */
export function buildSupplyReportTemplateArchiveData(
    isArchived: boolean,
): Prisma.SupplyReportTemplateUpdateInput {
    return {
        is_archived: isArchived,
        archived_at: isArchived ? new Date() : null,
        ...(isArchived ? { is_default: false } : {}),
        updated_at: new Date(),
    };
}
