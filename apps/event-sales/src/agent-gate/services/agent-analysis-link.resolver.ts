import { TranscriptionPipelineView } from '@lib/call-lib';
import { resolveCallManagerId } from '@lib/call-lib/call-report/services/call-manager.util';
import {
    CallReportDealFamily,
    CallReportDealFamilyService,
} from '@lib/call-lib/call-report/services/call-report-deal-family.service';
import { CallReportDealVerifyService } from '@lib/call-lib/call-report/services/call-report-deal-verify.service';
import { AgentCallAnalysisDto } from '../dto/agent-analysis-request.dto';
import { callOwnerIds } from './agent-analysis-crm-context.loader';
import { AgentCrmEntityContext } from './agent-analysis-intake.types';

/**
 * Связи элемента разбора и его ответственный (раскладка по CRM, владелец
 * звонка, проверенные догадки агента) — вынесены из intake по лимиту файла.
 */

/** Сведённые связи и ответственный для записи элемента. */
export interface AgentAnalysisLinks {
    family: CallReportDealFamily;
    managerId: number | undefined;
}

/** НЕ Injectable: сервисы раскладки и проверки передаются оркестратором. */
export class AgentAnalysisLinkResolver {
    constructor(
        private readonly dealFamily: CallReportDealFamilyService,
        private readonly dealVerify: CallReportDealVerifyService,
    ) {}

    async resolve(
        domain: string,
        row: TranscriptionPipelineView,
        context: AgentCrmEntityContext,
        dto: AgentCallAnalysisDto,
    ): Promise<AgentAnalysisLinks> {
        // Звонок может быть по сделке ИЛИ по лиду — хотя бы одна из связей
        // (сделка/лид/компания) должна встать на элемент.
        const owner = callOwnerIds(row);
        // Корневая сделка — из CRM-поля «Корневая сделка Продажи», а не
        // владелец звонка: звонят из презентации, и без раскладки в поле
        // «ОП: основная сделка» уезжала сделка-презентация (alfacentr,
        // 28.08.2026). Сделку ЧУЖОЙ воронки раскладка в «основную» не
        // пустит, а недостающую дотянет по компании/контакту звонка.
        // Шаг 0 раскладки — элемент «ОП История» этого звонка (§4
        // прод-фиксов): чтобы его найти, раскладке нужны лид-владелец,
        // владелец звонка и тип звонка, а не только клиент.
        const family = await this.dealFamily.resolve(domain, owner.dealId, {
            companyId: context.companyId,
            contactId: context.contactId,
            callStartedAt: row.callStartedAt,
            leadId: owner.leadId,
            callerId: row.userId,
            callType: dto.callType,
        });
        // Ответственный карточки и автор записей — владелец звонка из
        // телефонии; ответственный сущности только запасной вариант и
        // только у «своей» сделки (иначе разбор уезжал чужому сотруднику).
        const managerId = resolveCallManagerId({
            callOwnerUserId: row.userId,
            entityManagerId: context.managerId,
            entityIsOwn: owner.isLead || family.ownerCategoryCode !== undefined,
        });
        // Догадки агента принимаем ТОЛЬКО там, где раскладка по CRM молчит,
        // и ТОЛЬКО после проверки воронки И КЛИЕНТА: DTO агента валидирует
        // лишь «целое > 0», и без проверки в связи уезжала любая сделка
        // портала (в том числе чужой воронки и чужого клиента).
        const guess = await this.dealVerify.filterAgentDeals(
            domain,
            {
                mainDealId: family.mainDealId
                    ? undefined
                    : dto.relatedDeals?.mainDealId,
                presentationDealId: family.presentationDealId
                    ? undefined
                    : dto.relatedDeals?.presentationDealId,
                xoDealId: family.xoDealId
                    ? undefined
                    : dto.relatedDeals?.xoDealId,
            },
            { companyId: context.companyId, contactId: context.contactId },
        );
        return {
            family: {
                ...family,
                mainDealId: family.mainDealId ?? guess.mainDealId,
                presentationDealId:
                    family.presentationDealId ?? guess.presentationDealId,
                xoDealId: family.xoDealId ?? guess.xoDealId,
            },
            managerId,
        };
    }
}
