import type { Prisma } from 'generated/prisma';
import { serializeTemplateList } from '@lib/portal-lib/konstructor/document-template';
import type { UpdateContractTemplateDto } from '../dto/update-contract-template.dto';

/**
 * Скалярная часть payload-а обновления (без файлов).
 *
 * Отсутствие поля в DTO = «не менять», поэтому каждое поле переносится
 * только при `!== undefined`: иначе `whitelist`-прошедший частичный PATCH
 * затирал бы колонки значением `undefined` → Prisma писала бы NULL там,
 * где администратор ничего не просил.
 *
 * `updated_at` ставится ВСЕГДА и явно: у колонки нет ни `@default(now())`,
 * ни `@updatedAt` в схеме, так что без этой строки дата изменения
 * навсегда осталась бы датой создания.
 *
 * `portal_id`/`agent_id` принимаются уже разобранными: их нормализация
 * (пустая строка → NULL) и проверка инварианта «поставщик без портала
 * невозможен» — забота сервиса, а не сборщика payload-а.
 */
export function buildContractTemplateUpdateData(
    dto: UpdateContractTemplateDto,
    resolved: { portal_id: bigint | null; agent_id: bigint | null },
    now: Date,
): Prisma.ContractTemplateUpdateInput {
    const data: Prisma.ContractTemplateUpdateInput = { updated_at: now };

    if (dto.name !== undefined) {
        data.name = dto.name;
    }
    if (dto.contract_type !== undefined) {
        data.contract_type = dto.contract_type;
    }
    if (dto.description !== undefined) {
        data.description = dto.description;
    }
    if (dto.client_types !== undefined) {
        data.client_types = serializeTemplateList(dto.client_types);
    }
    if (dto.supply_types !== undefined) {
        data.supply_types = serializeTemplateList(dto.supply_types);
    }
    if (dto.portal_id !== undefined) {
        data.portal_id = resolved.portal_id;
    }
    if (dto.agent_id !== undefined) {
        data.agent_id = resolved.agent_id;
    }
    if (dto.is_active !== undefined) {
        data.is_active = dto.is_active;
    }
    if (dto.is_default !== undefined) {
        data.is_default = dto.is_default;
    }

    return data;
}
