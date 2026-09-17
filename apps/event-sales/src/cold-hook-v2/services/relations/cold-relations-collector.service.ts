import { Logger } from '@nestjs/common';
import { BitrixService, IBXDeal } from '@/modules/bitrix';
import { EBXTaskStatus, IBXTask } from '@/modules/bitrix/domain/tasks/task';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { hasCrmLink } from '@lib/portal-lib/pbx/const-smart-registry';
import { PresentationSmartInfo } from '@lib/portal-lib/pbx/pbx-presentation-smart';
import { ZprSmartInfo } from '@lib/portal-lib/pbx/pbx-zpr-smart';
import { presUfKey } from '../../../presentation-flow/services/pres-element-fields.builder';
import { presOpenStageIds } from '../../../presentation-flow/services/pres-stage.resolver';
import { zprUfKey } from '../../../zpr-flow/services/zpr-element-fields.builder';
import { zprOpenStageIds } from '../../../zpr-flow/services/zpr-stage.resolver';
import {
    DEAL_TO_DEAL_LINK_CODES,
    dealLeadIds,
    dealLeadLinkKeys,
    dealLinkKey,
    toLinkedIds,
} from '../../lib/deal-link-fields';
import { EnumColdCallEntityType } from '../../dto/cold.dto';
import { dealAssignedAtName } from '../../../shared/lead-request/deal-work-timer.util';
import { PortalDealColdCategoryService } from '../enities/deal/portal-deal-cold-category.service';
import { EventColdCallEntityTargetFieldsModel } from '../enities/entity/event-entity-fields.model';
import { ColdTarget } from '../target/cold-target.types';
import {
    ColdRelations,
    ColdSmartInfos,
    ColdSmartRelations,
    SmartRow,
} from './cold-relations.types';

type Row = Record<string, unknown>;

const TASK_SELECT = ['ID', 'TITLE', 'RESPONSIBLE_ID', 'UF_CRM_TASK', 'STATUS'];

/**
 * Связи клиента для холодного старта (шаг 3 плана v2) — ТОЛЬКО чтение.
 *
 * Два корня:
 *  - компания — открытые сделки по `COMPANY_ID` (как v1), задачи по `CO_`
 *    и по `D_` каждой сделки, элементы смартов по компании и по сделкам;
 *  - сделка без компании — граф от входной: её `to_*`-ссылки, корневая
 *    основная, сделки по её лидам и сделки, которые ссылаются на корень
 *    через `to_base_sales`; задачи по `D_`/`L_`, элементы по сделкам/лидам.
 *
 * Открытые стадии сделок — те же четыре воронки без fail/noresult/double/
 * success, что закрывает v1. Элементы смартов читаются `listAll` по
 * открытым стадиям и матчатся по связи В JS — фильтр crm.item.list по
 * crm-полю ненадёжен (правило zpr/pres-lookup). Смарт не установлен —
 * его список пуст, ни одного вызова.
 *
 * Не injectable: портал и bitrix привязаны к домену, приходят снаружи.
 */
export class ColdRelationsCollectorV2Service {
    private readonly logger = new Logger(ColdRelationsCollectorV2Service.name);
    private readonly categories: PortalDealColdCategoryService;
    private readonly dealFields: EventColdCallEntityTargetFieldsModel;

    constructor(
        private readonly portal: PortalModel,
        private readonly bitrix: BitrixService,
    ) {
        this.categories = new PortalDealColdCategoryService(portal);
        this.dealFields = new EventColdCallEntityTargetFieldsModel(
            portal,
            EnumColdCallEntityType.DEAL,
        );
    }

    async collect(
        target: ColdTarget,
        smarts: ColdSmartInfos,
    ): Promise<ColdRelations> {
        const leadIds = dealLeadIds(this.portal, target.entryDeal);
        const deals =
            target.kind === 'company'
                ? await this.loadCompanyDeals(target.companyId as number)
                : await this.loadDealGraph(target, leadIds);

        const dealIds = this.uniqueIds([
            target.entryDeal ? Number(target.entryDeal.ID) : null,
            target.rootDealId,
            ...deals.map(deal => Number(deal.ID)),
        ]);
        const baseCategoryId = String(
            this.categories.getBaseCategory()?.bitrixId ?? '',
        );
        const openBaseDeals = baseCategoryId
            ? deals.filter(deal => String(deal.CATEGORY_ID) === baseCategoryId)
            : [];

        const tasks = await this.loadTasks(target, dealIds, leadIds);
        const pres = await this.loadPresElements(
            smarts.pres,
            target,
            dealIds,
            leadIds,
        );
        const zpr = await this.loadZprElements(
            smarts.zpr,
            target,
            dealIds,
            leadIds,
        );

        this.logger.log(
            `[relations] hook=${target.hookKey} kind=${target.kind}: deals=${deals.length} ` +
                `base=${openBaseDeals.length} tasks=${tasks.length} ` +
                `pres=${pres.rows.length} zpr=${zpr.rows.length} leads=${leadIds.length}`,
        );

        return { deals, openBaseDeals, dealIds, leadIds, tasks, pres, zpr };
    }

    // ---------- сделки ----------

    /** Как v1: все открытые сделки четырёх воронок по компании, постранично. */
    private async loadCompanyDeals(companyId: number): Promise<IBXDeal[]> {
        const openStages = this.categories.getTargetDealStagesForClosePreCold();
        if (!openStages.length) return [];
        return this.bitrix.deal.all(
            {
                '=STAGE_ID': openStages,
                '=COMPANY_ID': [companyId],
            } as never,
            this.dealSelect(),
        );
    }

    /**
     * Граф от входной сделки без компании: её ссылки + корень + сделки по
     * лидам + сделки, ссылающиеся на корень. Одним батчем; всё — только на
     * открытых стадиях.
     */
    private async loadDealGraph(
        target: ColdTarget,
        leadIds: number[],
    ): Promise<IBXDeal[]> {
        const openStages = this.categories.getTargetDealStagesForClosePreCold();
        if (!openStages.length) return [];
        const entry = target.entryDeal as IBXDeal;
        const ids = this.uniqueIds([
            Number(entry.ID),
            target.rootDealId,
            ...this.collectLinkedDealIds(entry),
        ]);
        const select = this.dealSelect();
        const prefix = `xo2_rel_${target.hookKey}`;

        this.bitrix.batch.deal.getList(
            `${prefix}_by_id`,
            { ID: ids, '=STAGE_ID': openStages } as never,
            select,
        );
        if (leadIds.length) {
            this.bitrix.batch.deal.getList(
                `${prefix}_by_lead`,
                { LEAD_ID: leadIds, '=STAGE_ID': openStages } as never,
                select,
            );
        }
        if (target.rootDealId) {
            // Сделки, которые ссылаются НА корень (pres/xo/tmc через to_base_sales).
            this.bitrix.batch.deal.getList(
                `${prefix}_by_root`,
                {
                    [dealLinkKey(this.portal, 'to_base_sales')]:
                        target.rootDealId,
                    '=STAGE_ID': openStages,
                } as never,
                select,
            );
        }
        const responses = await this.bitrix.api.callBatchWithConcurrency(1);
        const rows: Row[] = [];
        for (const chunk of responses) {
            for (const value of Object.values(
                (chunk?.result ?? {}) as Record<string, unknown>,
            )) {
                rows.push(...this.rowsOf(value));
            }
        }
        return this.dedupeDeals(rows as unknown as IBXDeal[]);
    }

    /**
     * Ссылки на лиды читаются у КАЖДОЙ сделки: адресный ХО переназначает и
     * лиды сохранённой основной — в том числе при входе-компании, где
     * входной сделки нет и лиды иначе не нашлись бы.
     */
    private dealSelect(): string[] {
        // Таймер подтверждения: адресный ХО снимает его с основной сделки.
        const assignedAt = dealAssignedAtName(this.portal);
        return [
            ...new Set([
                'ID',
                'TITLE',
                'STAGE_ID',
                'CATEGORY_ID',
                'COMPANY_ID',
                'ASSIGNED_BY_ID',
                'CLOSED',
                'LEAD_ID',
                ...dealLeadLinkKeys(this.portal),
                ...DEAL_TO_DEAL_LINK_CODES.map(code =>
                    dealLinkKey(this.portal, code),
                ),
                ...this.dealFields.getBitrixIds(),
                ...(assignedAt ? [assignedAt] : []),
            ]),
        ];
    }

    /** id сделок из `to_*`-ссылок входной сделки. */
    private collectLinkedDealIds(deal: IBXDeal): number[] {
        const raw = deal as unknown as Row;
        return this.uniqueIds(
            DEAL_TO_DEAL_LINK_CODES.flatMap(code =>
                toLinkedIds(raw[dealLinkKey(this.portal, code)], /^D_/i),
            ),
        );
    }

    // ---------- задачи ----------

    /**
     * Открытые задачи группы обзвона по привязкам: `CO_` у корня-компании,
     * `D_` по каждой сделке графа, `L_` по лидам. Форма `D_`/`L_` в фильтре
     * `UF_CRM_TASK` в бою работает (transfer-work, lead-to-work).
     */
    private async loadTasks(
        target: ColdTarget,
        dealIds: number[],
        leadIds: number[],
    ): Promise<IBXTask[]> {
        const bindings = [
            ...(target.companyId ? [`CO_${target.companyId}`] : []),
            ...dealIds.map(id => `D_${id}`),
            ...leadIds.map(id => `L_${id}`),
        ];
        if (!bindings.length) return [];
        const groupId = this.portal.getSalesTaskGroupId();
        for (const binding of bindings) {
            this.bitrix.batch.task.getList(
                `xo2_tasks_${target.hookKey}_${binding}`,
                {
                    UF_CRM_TASK: [binding],
                    '!STATUS': EBXTaskStatus.COMPLETED,
                    ...(groupId ? { GROUP_ID: groupId } : {}),
                } as never,
                TASK_SELECT,
            );
        }
        const responses = await this.bitrix.api.callBatchWithConcurrency(1);
        const tasks: IBXTask[] = [];
        const seen = new Set<string>();
        for (const chunk of responses) {
            for (const value of Object.values(
                (chunk?.result ?? {}) as Record<string, unknown>,
            )) {
                const list = (value as { tasks?: unknown })?.tasks;
                for (const row of this.rowsOf(list ?? value)) {
                    const raw = row['id'] ?? row['ID'];
                    const id =
                        typeof raw === 'string' || typeof raw === 'number'
                            ? String(raw)
                            : '';
                    if (!id || seen.has(id)) continue;
                    seen.add(id);
                    tasks.push(row as unknown as IBXTask);
                }
            }
        }
        return tasks;
    }

    // ---------- элементы смартов ----------

    private async loadPresElements(
        info: PresentationSmartInfo | null,
        target: ColdTarget,
        dealIds: number[],
        leadIds: number[],
    ): Promise<ColdSmartRelations<PresentationSmartInfo>> {
        if (!info) return { info: null, rows: [] };
        const rows = await this.listOpenElements(
            info.entityTypeId,
            presOpenStageIds(info),
            [
                presUfKey(info, 'PRES_BASE_DEAL'),
                presUfKey(info, 'PRES_DEAL'),
                presUfKey(info, 'PRES_TMC_DEAL'),
                presUfKey(info, 'PRES_COMPANY'),
                presUfKey(info, 'PRES_LEAD'),
            ],
        );
        return {
            info,
            rows: rows.filter(row =>
                this.isLinkedRow(row, {
                    dealKeys: [
                        presUfKey(info, 'PRES_BASE_DEAL'),
                        presUfKey(info, 'PRES_DEAL'),
                        presUfKey(info, 'PRES_TMC_DEAL'),
                    ],
                    companyKey: presUfKey(info, 'PRES_COMPANY'),
                    leadKey: presUfKey(info, 'PRES_LEAD'),
                    target,
                    dealIds,
                    leadIds,
                }),
            ),
        };
    }

    private async loadZprElements(
        info: ZprSmartInfo | null,
        target: ColdTarget,
        dealIds: number[],
        leadIds: number[],
    ): Promise<ColdSmartRelations<ZprSmartInfo>> {
        if (!info) return { info: null, rows: [] };
        const rows = await this.listOpenElements(
            info.entityTypeId,
            zprOpenStageIds(info),
            [
                zprUfKey(info, 'ZPR_BASE_DEAL'),
                zprUfKey(info, 'ZPR_PRES_DEAL'),
                zprUfKey(info, 'ZPR_COMPANY'),
                zprUfKey(info, 'ZPR_LEAD'),
            ],
        );
        return {
            info,
            rows: rows.filter(row =>
                this.isLinkedRow(row, {
                    dealKeys: [
                        zprUfKey(info, 'ZPR_BASE_DEAL'),
                        zprUfKey(info, 'ZPR_PRES_DEAL'),
                    ],
                    companyKey: zprUfKey(info, 'ZPR_COMPANY'),
                    leadKey: zprUfKey(info, 'ZPR_LEAD'),
                    target,
                    dealIds,
                    leadIds,
                }),
            ),
        };
    }

    /**
     * Все открытые элементы смарта — listAll (страница crm.item — 50, на
     * активном портале открытых больше). select сужен до ключей матча и
     * закрытия.
     */
    private async listOpenElements(
        entityTypeId: number,
        openStages: string[],
        linkKeys: Array<string | undefined>,
    ): Promise<SmartRow[]> {
        if (!openStages.length) return [];
        const select = [
            'id',
            'stageId',
            'assignedById',
            ...linkKeys.filter((key): key is string => Boolean(key)),
        ];
        return (await this.bitrix.item.listAll(
            String(entityTypeId),
            { stageId: openStages } as never,
            select,
        )) as unknown as SmartRow[];
    }

    /** Элемент привязан к клиенту: любой из ключей совпал с компанией/сделкой/лидом. */
    private isLinkedRow(
        row: SmartRow,
        link: {
            dealKeys: Array<string | undefined>;
            companyKey: string | undefined;
            leadKey: string | undefined;
            target: ColdTarget;
            dealIds: number[];
            leadIds: number[];
        },
    ): boolean {
        if (
            link.companyKey &&
            link.target.companyId &&
            hasCrmLink(row[link.companyKey], 'CO', link.target.companyId)
        ) {
            return true;
        }
        for (const key of link.dealKeys) {
            if (!key) continue;
            if (link.dealIds.some(id => hasCrmLink(row[key], 'D', id))) {
                return true;
            }
        }
        if (link.leadKey) {
            return link.leadIds.some(id =>
                hasCrmLink(row[link.leadKey as string], 'L', id),
            );
        }
        return false;
    }

    // ---------- утилиты ----------

    private rowsOf(value: unknown): Row[] {
        if (Array.isArray(value)) {
            return value.filter(
                (row): row is Row => !!row && typeof row === 'object',
            );
        }
        return value && typeof value === 'object' ? [value as Row] : [];
    }

    private dedupeDeals(deals: IBXDeal[]): IBXDeal[] {
        const seen = new Set<string>();
        return deals.filter(deal => {
            const id = String(deal?.ID ?? '');
            if (!id || seen.has(id)) return false;
            seen.add(id);
            return true;
        });
    }

    private uniqueIds(ids: Array<number | null | undefined>): number[] {
        return [
            ...new Set(
                ids.filter(
                    (id): id is number =>
                        typeof id === 'number' && Number.isFinite(id) && id > 0,
                ),
            ),
        ];
    }
}
