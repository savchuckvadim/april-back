import { uniq } from '@lib/portal-lib/pbx-duplicate';
import { InnFieldMap } from '../lib/inn-fields';
import {
    IInnBitrix,
    innId,
    innList,
    InnRow,
    innText,
} from '../lib/inn-row.util';
import {
    INN_SYNC_KINDS,
    INN_SYNC_SOURCES,
    InnSyncPlan,
    InnSyncSource,
} from '../lib/inn-sync.plan';
import { INN_AUDIT_ACTIONS } from '../type/inn.type';
import { InnAuditWriter } from './inn-audit.writer';
import { InnMirrorWriter } from './inn-mirror.writer';
import type { IInnChooseResult } from './inn-pool.service';

/** Откуда взят ИНН — подпись записи в ленте сделки. */
const SOURCE_LABEL: Record<InnSyncSource, string> = {
    [INN_SYNC_SOURCES.company]: 'ИНН компании',
    [INN_SYNC_SOURCES.requisite]: 'ИНН из реквизитов компании',
    [INN_SYNC_SOURCES.lead]: 'ИНН заявки',
};

/**
 * Выровнять текущий ИНН сделки и компании по плану (inn-sync.plan):
 * текущий ИНН — один в обеих (владелец, 06.10.2026).
 *
 * Компании пишем в пустое поле, сделке — с записью в ленте, откуда взят
 * ИНН. Вызывается только через InnPoolService — единственного писателя.
 *
 * НЕ `@Injectable()`: инстанс Битрикса свой на каждый домен.
 */
export class InnCurrentSyncWriter {
    constructor(
        private readonly bitrix: IInnBitrix,
        private readonly fields: InnFieldMap,
        private readonly mirror: InnMirrorWriter,
        private readonly audit: InnAuditWriter,
    ) {}

    /** Возвращает новый текущий ИНН сделки и её пул. */
    async sync(
        dealId: number,
        deal: InnRow,
        plan: InnSyncPlan,
    ): Promise<IInnChooseResult> {
        const innName = this.fields.inn('deal');
        const poolName = this.fields.pool('deal');
        const result: IInnChooseResult = {
            pool: poolName ? innList(deal[poolName]) : [],
            current: innName ? innText(deal[innName]) : '',
            warnings: [],
        };
        const companyId = innId(deal.COMPANY_ID);

        if (plan.kind === INN_SYNC_KINDS.toCompany) {
            if (companyId) {
                await this.mirror.syncCompany(
                    companyId,
                    [plan.inn],
                    result.warnings,
                    plan.inn,
                );
            }
            return result;
        }
        if (plan.kind !== INN_SYNC_KINDS.toDeal || !innName || !poolName) {
            return result;
        }

        const pool = uniq([...result.pool, plan.inn]);
        try {
            await this.bitrix.api.call('crm.deal.update', {
                id: dealId,
                fields: { [innName]: plan.inn, [poolName]: pool },
            });
        } catch (error) {
            result.warnings.push(
                `ИНН сделки ${dealId} не записан: ${(error as Error).message}`,
            );
            return result;
        }
        result.pool = pool;
        result.current = plan.inn;
        await this.audit.write(dealId, result.warnings, {
            action: INN_AUDIT_ACTIONS.auto,
            inn: plan.inn,
            sourceLabel: SOURCE_LABEL[plan.from],
        });
        // ИНН пришёл с заявкой или из реквизита — компании (если она есть и
        // пуста) тоже: текущий ИНН один в сделке и компании.
        if (plan.from !== INN_SYNC_SOURCES.company && companyId) {
            await this.mirror.syncCompany(
                companyId,
                [plan.inn],
                result.warnings,
                plan.inn,
            );
        }
        return result;
    }
}
