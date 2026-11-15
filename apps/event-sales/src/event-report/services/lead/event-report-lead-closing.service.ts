import { Logger } from '@nestjs/common';
import { BitrixService } from '@/modules/bitrix';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { dealLeadIds } from '../../../cold-hook-v2/lib/deal-link-fields';
import { LeadClosingTarget } from '../../../lead-closing/lead-closing.decision';
import {
    LeadClosingCase,
    LeadClosingLead,
    LeadClosingReader,
} from '../../../lead-closing/lead-closing.reader';
import {
    LeadClosingLine,
    LeadClosingRunner,
} from '../../../lead-closing/lead-closing.runner';
import { EventReportContext } from '../context/event-report.context';

/** Флаги отчёта, от которых зависит, закрывать ли лиды. */
export interface LeadClosingTriggerFlags {
    isNoCall: boolean;
    isResult: boolean;
    isFail: boolean;
    isSuccessSale: boolean;
}

/**
 * Закрывать ли лиды по этому отчёту (решения владельца 11–15.11.2026):
 * разговор состоялся, отказ или продажа — да; недозвон с перезвоном и
 * кнопка «Недозвон» — нет: лид остаётся во временном статусе до
 * окончательного отчёта.
 */
export const shouldCloseLeads = (flags: LeadClosingTriggerFlags): boolean =>
    !flags.isNoCall && (flags.isResult || flags.isFail || flags.isSuccessSale);

/**
 * Можно ли перевести лид с такой семантикой статуса в цель:
 *  - в работе (P) — да;
 *  - успех (S, уже «Сконвертирован») — только в брак «Не ЦА» задним числом;
 *  - провал (F) — нет: закрытый браком лид отчёт не переоткрывает.
 */
export const leadClosingAllowed = (
    semantic: string,
    target: LeadClosingTarget | null,
): boolean => {
    if (target === null) return false;
    if (semantic === 'P') return true;
    return semantic === 'S' && target === 'lead_junk';
};

/**
 * Закрытие лидов рабочей основной сделки после отчёта «Звонков» — шаг ПОСЛЕ
 * основного батча: стадия сделки уже сдвинута отчётом, по ней и решаем
 * (тем же модулем, что и разовый прогон 14–15.11). Лиды сделки — её «Лид»,
 * «из лида», «присоединённые» и лид отчёта.
 *
 * Ошибка здесь отчёт не роняет: отчёт уже записан, лид дозакроется
 * следующим отчётом.
 *
 * НЕ @Injectable: создаётся `new` с инстансом Битрикса конкретного портала.
 */
export class EventReportLeadClosingService {
    private readonly logger = new Logger(EventReportLeadClosingService.name);

    constructor(
        private readonly bitrix: BitrixService,
        private readonly portal: PortalModel,
        private readonly reader = new LeadClosingReader(bitrix, portal),
        private readonly runner = new LeadClosingRunner(bitrix, portal),
    ) {}

    async run(
        ctx: EventReportContext,
        baseDealId: number | null,
    ): Promise<LeadClosingLine[]> {
        if (!baseDealId || !shouldCloseLeads(ctx)) return [];
        try {
            const leadIds = [
                ...new Set([
                    ...dealLeadIds(this.portal, ctx.currentBaseDeal),
                    Number(ctx.lead?.ID ?? 0),
                ]),
            ].filter(id => id > 0);
            if (!leadIds.length) return [];

            const rows = await this.bitrix.lead.all({ '@ID': leadIds }, [
                'ID',
                'STATUS_ID',
                'STATUS_SEMANTIC_ID',
                'COMPANY_ID',
                'CONTACT_ID',
            ]);
            const semantic = new Map(
                rows.map(row => [
                    Number(row.ID),
                    String(row.STATUS_SEMANTIC_ID ?? ''),
                ]),
            );
            const leads: LeadClosingLead[] = rows.map(row => ({
                id: Number(row.ID),
                statusId: String(row.STATUS_ID ?? ''),
                companyId: Number(row.COMPANY_ID ?? 0) || 0,
                contactId: Number(row.CONTACT_ID ?? 0) || 0,
                dealId: baseDealId,
            }));
            const cases: LeadClosingCase[] = (
                await this.reader.read(leads)
            ).map(item =>
                leadClosingAllowed(
                    semantic.get(item.lead.id) ?? '',
                    item.decision.target,
                )
                    ? item
                    : {
                          ...item,
                          decision: {
                              ...item.decision,
                              target: null,
                              linkDealId: null,
                          },
                      },
            );
            if (!cases.some(item => item.decision.target !== null)) return [];

            const lines = await this.runner.close(cases);
            this.logger.log(
                `[lead-closing] ${ctx.domain}: сделка ${baseDealId}, ` +
                    lines
                        .filter(line => line.entry || line.skipped)
                        .map(
                            line =>
                                `лид ${line.leadId} → ${line.case.decision.target}` +
                                `${line.skipped ? ' [пропущен]' : ''}`,
                        )
                        .join('; '),
            );
            return lines;
        } catch (error) {
            this.logger.warn(
                `[lead-closing] ${ctx.domain}: сделка ${baseDealId} — лиды не закрыты: ${(error as Error).message}`,
            );
            return [];
        }
    }
}

/**
 * Номер рабочей основной сделки после батча отчёта: реальный id либо — если
 * отчёт её только что создал — id из ответа команды `set_base_deal`.
 */
export const resolveReportBaseDealId = (
    ref: string | null,
    createdId: unknown,
): number | null => {
    const direct = Number(ref);
    if (ref && Number.isFinite(direct) && direct > 0) return direct;
    const created = Number(createdId);
    return Number.isFinite(created) && created > 0 ? created : null;
};
