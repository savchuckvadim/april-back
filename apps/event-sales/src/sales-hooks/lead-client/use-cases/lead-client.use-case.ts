import { Injectable, Logger } from '@nestjs/common';
import { getErrorDetails } from '@/shared';
import {
    EnumPortalAppCode,
    PortalAppSettingsService,
} from '@lib/portal-lib/store/app-settings';
import { EnumSalesHookCode } from '../../core/constants/sales-hook-code.enum';
import {
    ISalesHookUseCase,
    SalesHookExecutionContext,
} from '../../core/contracts/sales-hook-use-case.contract';
import { LeadDealCompletion } from '../../../shared/lead-client/lead-deal-completion';
import { ILeadClientItem } from '../dto/lead-client.dto';
import {
    LeadClientItemResultDto,
    LeadClientResultDto,
} from '../dto/lead-client-result.dto';

/**
 * Хук «клиент из лида»: сделка → её лиды → контакт/компания → сделка.
 *
 * Та же достройка, что в хуке «лид → работа» и в перегоне
 * (`LeadDealCompletion`), только по готовой сделке и БЕЗ оглядки на
 * настройку «клиент из заявки»: раз хук позвали — клиента делаем.
 *
 * Идемпотентность доменная: клиент ищется по `LEAD_ID`, привязки сделки и
 * дел перечитываются перед записью — повтор ничего не дублирует.
 * Пишет прямыми вызовами (не батчем): шаги зависят от id, созданных
 * предыдущими шагами.
 */
@Injectable()
export class LeadClientUseCase
    implements ISalesHookUseCase<ILeadClientItem, LeadClientResultDto>
{
    readonly hook = EnumSalesHookCode.LEAD_CLIENT;
    private readonly logger = new Logger(LeadClientUseCase.name);

    constructor(private readonly appSettings: PortalAppSettingsService) {}

    async execute(
        ctx: SalesHookExecutionContext,
        items: ILeadClientItem[],
    ): Promise<LeadClientResultDto> {
        const settings = await this.appSettings.resolve(
            ctx.domain,
            EnumPortalAppCode.eventSales,
        );
        const completion = new LeadDealCompletion(
            ctx.bitrix,
            ctx.portal,
            ctx.domain,
            {
                linkClient: true,
                companyDepartmentIds: settings.leadClientCompanyDepartmentIds,
                activitiesLimit: settings.leadWorkCopyActivitiesLimit,
            },
        );

        const results: LeadClientItemResultDto[] = [];
        for (const item of items) {
            results.push(await this.completeOne(completion, item));
        }

        const created = results.reduce((sum, r) => sum + r.created.length, 0);
        const linked = results.filter(
            r => r.dealContactsAdded.length || r.dealCompanySet,
        ).length;
        return {
            implemented: true,
            items: results,
            message: `Сделок: ${results.length}, создано клиентов: ${created}, привязано к сделкам: ${linked}.`,
        };
    }

    private async completeOne(
        completion: LeadDealCompletion,
        item: ILeadClientItem,
    ): Promise<LeadClientItemResultDto> {
        const empty: LeadClientItemResultDto = {
            dealId: item.dealId,
            created: [],
            dealContactsAdded: [],
            dealCompanySet: null,
            activitiesBound: 0,
            inns: [],
            warnings: [],
        };
        try {
            const outcome = await completion.complete(item.dealId, undefined, {
                kind: item.kind,
            });
            return {
                ...empty,
                created: outcome.link?.created ?? [],
                dealContactsAdded: outcome.link?.dealContactsAdded ?? [],
                dealCompanySet: outcome.link?.dealCompanySet ?? null,
                activitiesBound: outcome.link?.activitiesBound ?? 0,
                inns: outcome.inns,
                warnings: outcome.warnings,
            };
        } catch (error) {
            const { message } = getErrorDetails(error);
            this.logger.warn(`lead-client: сделка ${item.dealId} — ${message}`);
            return { ...empty, warnings: [`Ошибка: ${message}`] };
        }
    }
}
