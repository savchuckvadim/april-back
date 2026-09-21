import { Logger } from '@nestjs/common';
import { BitrixService } from '@lib/bitrix';
import { TranscriptionPipelineView } from '@lib/call-lib';
import { CallAnalysisBitrixService } from '@lib/call-lib/call-analysis/services/call-analysis-bitrix.service';
import {
    AgentCallActivity,
    AgentCrmEntityContext,
} from './agent-analysis-intake.types';

/**
 * Чтение CRM-контекста звонка (лид/сделка, активность) для связей элемента —
 * вынесено из intake по лимиту файла; НЕ Injectable: bitrix аргументом.
 */

/** Минимальный контракт api-инстанса Битрикса (уже привязан к домену). */
interface AgentCrmApi {
    call(method: string, data: Record<string, unknown>): Promise<unknown>;
}

/** Поля лида/сделки, нужные для связей и ответственного элемента. */
interface AgentCrmEntityRow {
    COMPANY_ID?: string | number;
    CONTACT_ID?: string | number;
    ASSIGNED_BY_ID?: string | number;
}

/** Владелец звонка по строке транскрипции: лид или сделка (entityType). */
export interface AgentCallOwnerIds {
    isLead: boolean;
    dealId?: number;
    leadId?: number;
}

export function callOwnerIds(
    row: TranscriptionPipelineView,
): AgentCallOwnerIds {
    const isLead = row.entityType === 'lead';
    const id = row.entityId ? Number(row.entityId) : undefined;
    return isLead ? { isLead, leadId: id } : { isLead, dealId: id };
}

export class AgentAnalysisCrmContextLoader {
    constructor(
        private readonly bitrix: BitrixService,
        private readonly logger: Logger,
    ) {}

    /**
     * Компания/контакт/ответственный сущности-владельца звонка: звонок
     * может быть по сделке ИЛИ по лиду — читаем то, что есть.
     */
    async loadEntityContext(
        row: TranscriptionPipelineView,
    ): Promise<AgentCrmEntityContext> {
        return row.entityType === 'lead'
            ? this.loadEntity('crm.lead.get', row.entityId)
            : this.loadEntity('crm.deal.get', row.entityId);
    }

    /** Активность звонка (для направления, binding и fallback-аудио). */
    async loadActivity(
        row: TranscriptionPipelineView,
    ): Promise<AgentCallActivity> {
        if (!row.activityId) return null;
        try {
            const bx = new CallAnalysisBitrixService(this.bitrix);
            return await bx.getActivityById(Number(row.activityId));
        } catch (error) {
            this.logger.warn(
                `Активность ${row.activityId} не получена: ${(error as Error).message}`,
            );
            return null;
        }
    }

    /** Лид или сделка по id; ошибка чтения — пустой контекст (fail-open). */
    private async loadEntity(
        method: 'crm.lead.get' | 'crm.deal.get',
        entityId: string | null,
    ): Promise<AgentCrmEntityContext> {
        if (!entityId) return {};
        const api: AgentCrmApi = this.bitrix.api;
        try {
            const response = (await api.call(method, { id: entityId })) as {
                result?: AgentCrmEntityRow;
            };
            const entity = response?.result;
            if (!entity) return {};
            return {
                companyId: Number(entity.COMPANY_ID) || undefined,
                contactId: Number(entity.CONTACT_ID) || undefined,
                managerId: Number(entity.ASSIGNED_BY_ID) || undefined,
            };
        } catch (error) {
            this.logger.warn(
                `${method} для контекста не выполнен: ${(error as Error).message}`,
            );
            return {};
        }
    }
}
