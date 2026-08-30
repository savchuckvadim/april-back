import { ZprSmartInfo } from '@lib/portal-lib/pbx/pbx-zpr-smart';
import { FlowBitrix } from '../../shared/side-flow';
import { ZprFlowJobData } from '../dto/zpr-flow-job.dto';
import { BxRow } from '../types/zpr-flow-run.type';
import { hasLink, zprStageId, zprUfKey } from './zpr-element-fields.builder';

/**
 * Поиск ОТКРЫТОГО элемента ЗПР клиента — единственная операция чтения
 * потока, и вынесена она отдельно ровно поэтому: правило «какой элемент
 * считается тем самым» продуктовое и меняется само по себе, независимо от
 * того, что writer с найденным элементом делает.
 *
 * `bitrix` приходит в конструктор (класс создаётся на прогон джоба, а не
 * инжектится): инстанс привязан к домену портала — правило CLAUDE.md.
 */
export class ZprElementLookupService {
    constructor(private readonly bitrix: FlowBitrix) {}

    /**
     * Открытый элемент этого клиента: стадии план/ожидание, совпадение по
     * базовой сделке (или компании, когда сделки нет). Фильтр по стадиям —
     * серверный, матч по связи — в JS: фильтрация crm.item.list по значению
     * crm-поля ненадёжна, а открытых ЗПР у клиента единицы.
     */
    async findOpenElement(
        info: ZprSmartInfo,
        job: ZprFlowJobData,
    ): Promise<BxRow | null> {
        const openStages = [
            zprStageId(info, 'zpr_plan'),
            zprStageId(info, 'zpr_pending'),
        ].filter(Boolean);
        if (!openStages.length) return null;

        // listAll: у активного портала открытых ЗПР больше страницы crm.item
        // (50), одна страница теряла бы элемент клиента (находка ревью).
        const rows = (await this.bitrix.item.listAll(
            String(info.entityTypeId),
            {
                stageId: openStages,
            } as never,
        )) as unknown as BxRow[];

        const baseKey = zprUfKey(info, 'ZPR_BASE_DEAL');
        const companyKey = zprUfKey(info, 'ZPR_COMPANY');
        const leadKey = zprUfKey(info, 'ZPR_LEAD');
        const matches = rows.filter(row => {
            if (job.baseDealId && baseKey) {
                return hasLink(row[baseKey], 'D', job.baseDealId);
            }
            if (job.companyId && companyKey) {
                return hasLink(row[companyKey], 'CO', job.companyId);
            }
            // Лид-only клиент (заявка без компании и сделки) — элемент
            // связан только лидом, без этой ветки он не закрывался бы.
            if (job.leadId && leadKey) {
                return hasLink(row[leadKey], 'L', job.leadId);
            }
            return false;
        });
        if (!matches.length) return null;
        // Последний запланированный — самый свежий id.
        return matches.reduce((latest, row) =>
            Number(row.id) > Number(latest.id) ? row : latest,
        );
    }
}
