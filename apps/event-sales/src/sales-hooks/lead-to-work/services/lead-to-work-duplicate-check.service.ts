import { Injectable, Logger } from '@nestjs/common';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { PBX_SALES_EVENT_FIELD_CODES } from '@lib/portal-lib/pbx';
import {
    EnumPortalAppCode,
    PortalAppSettingsService,
} from '@lib/portal-lib/store/app-settings';
import { EnumSalesHookCode } from '../../core/constants/sales-hook-code.enum';
import { EnumSalesHookSource } from '../../core/contracts/sales-hook-job.type';
import { SalesHookDispatchService } from '../../core/services/sales-hook-dispatch.service';
import { SalesHookIdempotencyService } from '../../core/services/sales-hook-idempotency.service';
import { buildDuplicateCheckItem } from '../../duplicate-check/dto/duplicate-check.dto';

type BxRow = Record<string, unknown>;

/** Лид, назначенный этим прогоном хука. */
export interface ILeadForDuplicateCheck {
    leadId: number;
    /** Состояние лида ДО записи — по нему видно, проверяли ли дубли. */
    leadRow: BxRow;
    /** Входящая работа (ХО/заявка): только её и проверяем автоматически. */
    isIncoming: boolean;
}

/**
 * Автопроверка на дубли при входе заявки.
 *
 * Смысл шага: дубль надо увидеть ДО того, как менеджер начнёт звонить —
 * иначе он ведёт клиента, по которому уже работает коллега. Руками эту
 * кнопку никто не жмёт, поэтому проверка ставится в очередь тем же
 * прогоном, что назначает заявку.
 *
 * Ограничения намеренные:
 *  - только входящая работа (ХО/заявка): конвертация идёт по клиенту,
 *    которого уже ведут, там проверка бессмысленна;
 *  - только ОДИН раз на лид — гейт по маркеру `op_lead_is_duplicate_check`,
 *    который ставит сам дубль-хук. Иначе каждая передача заявки гоняла бы
 *    тяжёлый DEEP-поиск заново;
 *  - выключено по умолчанию, включается настройкой портала.
 */
@Injectable()
export class LeadToWorkDuplicateCheckService {
    private readonly logger = new Logger(LeadToWorkDuplicateCheckService.name);

    constructor(
        private readonly appSettings: PortalAppSettingsService,
        private readonly dispatch: SalesHookDispatchService,
        private readonly idempotency: SalesHookIdempotencyService,
    ) {}

    /** Ставит проверку в очередь; возвращает предупреждения для результата. */
    async queueForLeads(
        domain: string,
        portal: PortalModel,
        leads: ILeadForDuplicateCheck[],
    ): Promise<string[]> {
        const warnings: string[] = [];
        const candidates = leads.filter(lead => lead.isIncoming);
        if (!candidates.length) return warnings;

        const settings = await this.appSettings.resolve(
            domain,
            EnumPortalAppCode.eventSales,
        );
        if (!settings.leadIntakeDuplicateCheckEnabled) return warnings;

        const checkedName = this.checkedFieldName(portal);
        for (const lead of candidates) {
            if (checkedName && this.isChecked(lead.leadRow[checkedName])) {
                continue;
            }
            const item = buildDuplicateCheckItem({
                entityType: 'lead',
                entityId: lead.leadId,
                level: settings.leadIntakeDuplicateCheckDeep ? 'deep' : 'fast',
            });
            const entityKey = `lead:${lead.leadId}`;
            const operation = await this.dispatch.accept(
                EnumSalesHookCode.DUPLICATE_CHECK,
                domain,
                EnumSalesHookSource.ROBOT,
                [
                    {
                        entityKey,
                        fingerprint: this.idempotency.fingerprint(
                            EnumSalesHookCode.DUPLICATE_CHECK,
                            entityKey,
                            { intake: true, ...item },
                        ),
                        data: item,
                    },
                ],
            );
            if (operation) {
                this.logger.log(
                    `[intake-dup] ${domain}: проверка дублей поставлена по лиду ${lead.leadId}`,
                );
            } else {
                warnings.push(
                    `Лид ${lead.leadId}: проверка на дубли уже выполняется другой операцией`,
                );
            }
        }
        return warnings;
    }

    /** UF-имя маркера «дубли уже проверялись»; поля нет → null. */
    private checkedFieldName(portal: PortalModel): string | null {
        const field = portal.getEntityFieldByCode(
            'lead',
            PBX_SALES_EVENT_FIELD_CODES.op_lead_is_duplicate_check,
        );
        return field ? portal.getFieldBitrixId(field) : null;
    }

    /** Битрикс отдаёт чекбокс как '1'/'0', 'Y'/'N' либо true/false. */
    private isChecked(raw: unknown): boolean {
        if (raw === true || raw === 1) return true;
        if (typeof raw !== 'string') return false;
        const text = raw.trim().toUpperCase();
        return text === '1' || text === 'Y';
    }
}
