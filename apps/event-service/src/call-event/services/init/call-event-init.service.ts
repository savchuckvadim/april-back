import { Injectable, Logger } from '@nestjs/common';
import {
    BitrixService,
    IBXCompany,
    IBXContact,
    IBXDeal,
    IBXItem,
} from '@/modules/bitrix';
import { IBXTask } from '@/modules/bitrix/domain/tasks/task/interface/task.interface';
import { IBXProductRowRow } from '@/modules/bitrix/domain/crm/product-row/interface/bx-product-row.interface';
import { BitrixOwnerType } from '@/modules/bitrix/domain/enums/bitrix-constants.enum';
import { IBitrixBatchResponseResult } from '@/modules/bitrix/core/interface/bitrix-api-http.intterface';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import {
    IPBXList,
    IPSmart,
} from '@lib/portal-lib/portal/interfaces/portal.interface';
import { PbxDealCategoryCodeEnum } from '@lib/portal-lib/portal/services/types/deals/portal.deal.type';
import { PBX_SERVICE_MONTH_SMART_TYPE } from '@lib/portal-lib/pbx';
import { ORK_HISTORY_LIST } from '@lib/portal-lib/pbx/pbx-ork-history-bx-list';
import { getFirstLastDayOfMonth } from '../smart/utils/date.util';
import { CallingEventDto } from '../../dto/calling-event.dto';
import { ICallEventInitContext } from './call-event-init.types';

/**
 * Загружает все сущности обоих потоков (звонок + смарт-отчёт).
 *
 * @Injectable, но без `this.bitrix` — инстанс приходит параметром (CLAUDE.md).
 * Чтения crm.item.list и lists.element.get (постранично) не batch'атся —
 * вызываем напрямую; остальное (company/contacts/tasks/deal/product) грузим
 * одним batch'ем.
 */
@Injectable()
export class CallEventInitService {
    private readonly logger = new Logger(CallEventInitService.name);

    async loadContext(
        dto: CallingEventDto,
        bitrix: BitrixService,
        portal: PortalModel,
    ): Promise<ICallEventInitContext> {
        const companyId = Number(
            dto.bx?.companyId ?? dto.placement?.options?.ID ?? 0,
        );
        const dealId = Number(dto.bx?.dealId ?? 0);

        const orkHistoryList =
            portal.getListByCode(ORK_HISTORY_LIST.CODE) ?? null;
        const smart =
            portal.getSmartByType(PBX_SERVICE_MONTH_SMART_TYPE) ?? null;
        const baseCategory = portal.getDealCategoryByCode(
            PbxDealCategoryCodeEnum.service_base,
        );

        // === Batch: company / contacts / tasks / base deal / product rows ===
        if (companyId) {
            bitrix.batch.company.get('get_company', companyId);
            bitrix.batch.contact.getList('list_contacts', {
                COMPANY_ID: companyId,
            });
            bitrix.batch.task.getList(
                'list_tasks',
                { UF_CRM_TASK: [`CO_${companyId}`], '<=STATUS': 3 },
                [
                    'ID',
                    'TITLE',
                    'DESCRIPTION',
                    'RESPONSIBLE_ID',
                    'STATUS',
                    'DEADLINE',
                ],
            );
            if (baseCategory?.bitrixId) {
                bitrix.batch.deal.getList(
                    'get_base_deal',
                    {
                        COMPANY_ID: String(companyId),
                        CATEGORY_ID: String(baseCategory.bitrixId),
                    },
                    ['*', 'UF_*'],
                );
            }
        }
        if (dealId) {
            bitrix.batch.productRow.list('list_product_rows', {
                '=ownerType': BitrixOwnerType.DEAL,
                '=ownerId': dealId,
            });
        }

        const flat = this.flatten(await bitrix.api.callBatchWithConcurrency(1));

        const company = this.pick<IBXCompany>(flat, 'get_company');
        const contacts = this.pickArray<IBXContact>(flat, 'list_contacts');
        const companyTasks = this.pickTasks(flat, 'list_tasks');
        const baseDeal =
            this.pickArray<IBXDeal>(flat, 'get_base_deal')[0] ?? null;
        const productRows = this.pickProductRows(flat, 'list_product_rows');

        // === Параллельные постраничные/прямые чтения истории и смартов ===
        const orkHistoryElements = await this.loadOrkHistory(
            bitrix,
            orkHistoryList,
            companyId,
        );
        const existingSmarts = await this.loadExistingSmarts(
            bitrix,
            smart,
            companyId,
            contacts,
        );

        return {
            company,
            contacts,
            companyTasks,
            orkHistoryList,
            orkHistoryElements,
            smart,
            existingSmarts,
            baseDeal,
            productRows,
        };
    }

    /** Элементы списка ОРК-история по компании (через постраничный listItem.all). */
    private async loadOrkHistory(
        bitrix: BitrixService,
        orkHistoryList: IPBXList | null,
        companyId: number,
    ): Promise<Record<string, unknown>[]> {
        if (!orkHistoryList?.bitrixId || !companyId) {
            return [];
        }
        const crmField = orkHistoryList.bitrixfields?.find(
            field =>
                field.code ===
                `${orkHistoryList.group}_${orkHistoryList.type}_crm`,
        );
        const filter: Record<string, unknown> = {};
        if (crmField?.bitrixCamelId) {
            filter[crmField.bitrixCamelId] = [`CO_${companyId}`];
        }
        const items = await bitrix.listItem.all({
            IBLOCK_ID: orkHistoryList.bitrixId.toString(),
            filter,
        });
        return items as unknown as Record<string, unknown>[];
    }

    /** Существующие смарт-элементы месяца по компании и контактам. */
    private async loadExistingSmarts(
        bitrix: BitrixService,
        smart: IPSmart | null,
        companyId: number,
        contacts: IBXContact[],
    ): Promise<IBXItem[]> {
        if (!smart?.entityTypeId) {
            return [];
        }
        const entityTypeId = String(smart.entityTypeId);
        const [first, last] = getFirstLastDayOfMonth(new Date());
        const companyField = `ufCrm${smart.bitrixId}SmrsCrmCompany`;
        const contactField = `ufCrm${smart.bitrixId}SmrsCrmContact`;
        const result: IBXItem[] = [];

        const companyRes = await bitrix.item.list(entityTypeId, {
            [companyField]: companyId,
            '>=createdTime': first,
            '<=createdTime': last,
        } as unknown as Partial<IBXItem>);
        result.push(...this.pickItems(companyRes));

        const contactIds = contacts
            .map(c => Number(c.ID))
            .filter(id => Number.isFinite(id) && id > 0);
        if (contactIds.length) {
            const contactRes = await bitrix.item.list(entityTypeId, {
                [contactField]: contactIds,
                '>=createdTime': first,
                '<=createdTime': last,
            } as unknown as Partial<IBXItem>);
            result.push(...this.pickItems(contactRes));
        }
        return result;
    }

    // ---------- helpers ----------

    private flatten(
        batchResults: IBitrixBatchResponseResult[],
    ): Record<string, unknown> {
        const flat: Record<string, unknown> = {};
        for (const chunk of batchResults) {
            for (const key in chunk.result) {
                flat[key] = chunk.result[key];
            }
        }
        return flat;
    }

    private pick<T>(flat: Record<string, unknown>, key: string): T | null {
        const value = flat[key];
        return value === undefined || value === null ? null : (value as T);
    }

    private pickArray<T>(flat: Record<string, unknown>, key: string): T[] {
        const value = flat[key];
        return Array.isArray(value) ? (value as T[]) : [];
    }

    private pickTasks(flat: Record<string, unknown>, key: string): IBXTask[] {
        const value = flat[key];
        if (Array.isArray(value)) return value as IBXTask[];
        const tasks = (value as { tasks?: IBXTask[] } | undefined)?.tasks;
        return Array.isArray(tasks) ? tasks : [];
    }

    private pickProductRows(
        flat: Record<string, unknown>,
        key: string,
    ): IBXProductRowRow[] {
        const value = flat[key] as
            | { productRows?: IBXProductRowRow[] }
            | IBXProductRowRow[]
            | undefined;
        if (Array.isArray(value)) return value;
        return Array.isArray(value?.productRows) ? value.productRows : [];
    }

    private pickItems(res: unknown): IBXItem[] {
        const items = (res as { result?: { items?: IBXItem[] } })?.result
            ?.items;
        return Array.isArray(items) ? items : [];
    }
}
