import { Logger } from '@nestjs/common';
import { BitrixService } from '@/modules/bitrix';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { PBX_SALES_EVENT_FIELD_CODES } from '@lib/portal-lib/pbx';
import { PbxDealCategoryCodeEnum } from '@lib/portal-lib/portal/services/types/deals/portal.deal.type';
import { IJoinToMainItem } from '../dto/join-to-main.dto';
import { IJoinDealSnapshot, IJoinSnapshot, toId } from './join-to-main.plan';

type BxRow = Record<string, unknown>;

const DEAL_LIST_SELECT = ['ID', 'DATE_CREATE', 'CLOSED', 'CATEGORY_ID'];
/** Контактов дубля, чьи компании читаем — столько же и присоединяем. */
const MAX_CONTACTS = 10;

/**
 * Чтение всего, что нужно плану присоединения — ДВЕ batch-волны, ни одной
 * записи (ai/rules/bitrix-batch-grouping.md):
 *
 *   W1: сделка-дубль + её контакты; цель — основная сделка с контактами
 *       либо компания + её открытые сделки ОП (самая старая = основная);
 *   W2: лиды дубля, компании его контактов, основная (если выбрана из
 *       списка компании) с контактами.
 *
 * Звать строго до первой записи и без чужих команд в инстансе: `bitrix.api`
 * держит одну карту команд. НЕ @Injectable: bitrix привязан к домену.
 */
export class JoinToMainReader {
    private readonly logger = new Logger(JoinToMainReader.name);

    constructor(
        private readonly bitrix: BitrixService,
        private readonly portal: PortalModel,
    ) {}

    async read(item: IJoinToMainItem): Promise<IJoinSnapshot> {
        const warnings: string[] = [];
        const baseCategoryId = Number(
            this.portal.getDealCategoryByCode(
                PbxDealCategoryCodeEnum.sales_base,
            )?.bitrixId,
        );

        // === Волна 1.
        this.bitrix.batch.deal.get('jm_src', item.dealId);
        this.bitrix.batch.deal.contactItemsGet('jm_src_ct', item.dealId);
        if (item.targetType === 'deal') {
            this.bitrix.batch.deal.get('jm_main', item.targetId);
            this.bitrix.batch.deal.contactItemsGet('jm_main_ct', item.targetId);
        } else if (Number.isFinite(baseCategoryId)) {
            this.bitrix.batch.deal.getList(
                'jm_co_deals',
                {
                    COMPANY_ID: item.targetId,
                    CATEGORY_ID: baseCategoryId,
                    CLOSED: 'N',
                } as never,
                DEAL_LIST_SELECT,
                { DATE_CREATE: 'ASC' },
            );
        }
        const first = await this.flush();

        const sourceRow = this.rowOf(first.get('jm_src'));
        const source = sourceRow
            ? this.dealSnapshot(sourceRow, first.get('jm_src_ct'))
            : null;

        let mainId: number | null = null;
        if (item.targetType === 'deal') {
            mainId = item.targetId;
        } else {
            const candidates = this.rowsOf(first.get('jm_co_deals'))
                .map(row => toId(row.ID))
                .filter(
                    (id): id is number => id !== null && id !== item.dealId,
                );
            mainId = candidates[0] ?? null;
        }

        // === Волна 2.
        const leadIds = source?.leadIds ?? [];
        for (const leadId of leadIds) {
            this.bitrix.batch.lead.get(`jm_lead_${leadId}`, leadId);
        }
        const contactIds = (source?.contactIds ?? []).slice(0, MAX_CONTACTS);
        for (const contactId of contactIds) {
            this.bitrix.batch.contact.companyItemsGet(
                `jm_ct_co_${contactId}`,
                contactId,
            );
        }
        if (item.targetType === 'company' && mainId) {
            this.bitrix.batch.deal.get('jm_main', mainId);
            this.bitrix.batch.deal.contactItemsGet('jm_main_ct', mainId);
        }
        const second =
            leadIds.length ||
            contactIds.length ||
            (item.targetType === 'company' && mainId)
                ? await this.flush()
                : new Map<string, unknown>();

        const mainRaw = item.targetType === 'deal' ? first : second;
        const mainRow = mainId ? this.rowOf(mainRaw.get('jm_main')) : null;
        const main = mainRow
            ? this.dealSnapshot(mainRow, mainRaw.get('jm_main_ct'))
            : null;
        if (mainId && !main) {
            warnings.push(`Основная сделка ${mainId} не прочитана`);
        }

        const contactCompanies = new Map<number, number[]>();
        for (const contactId of contactIds) {
            contactCompanies.set(
                contactId,
                this.rowsOf(second.get(`jm_ct_co_${contactId}`))
                    .map(row => toId(row.COMPANY_ID))
                    .filter((id): id is number => id !== null),
            );
        }

        const leads = leadIds
            .map(id => ({ id, row: this.rowOf(second.get(`jm_lead_${id}`)) }))
            .filter((lead): lead is { id: number; row: BxRow } => !!lead.row);
        if (leads.length < leadIds.length) {
            warnings.push('Часть лидов сделки-дубля не прочитана');
        }

        this.logger.log(
            `[join] deal=${item.dealId} → ${item.targetType}:${item.targetId}: ` +
                `main=${main?.id ?? '—'} contacts=${contactIds.length} leads=${leads.length}`,
        );
        return {
            item,
            source,
            main,
            companyId:
                item.targetType === 'company'
                    ? item.targetId
                    : (main?.companyId ?? null),
            leads,
            contactCompanies,
            warnings,
        };
    }

    /* ------------------------------------------------------------------ */

    private dealSnapshot(row: BxRow, contactsRaw: unknown): IJoinDealSnapshot {
        const id = toId(row.ID) ?? 0;
        const contactIds = new Set<number>();
        const primary = toId(row.CONTACT_ID);
        if (primary) contactIds.add(primary);
        for (const item of this.rowsOf(contactsRaw)) {
            const contactId = toId(item.CONTACT_ID ?? item.ID);
            if (contactId) contactIds.add(contactId);
        }
        return {
            id,
            title: typeof row.TITLE === 'string' ? row.TITLE.trim() : `#${id}`,
            categoryId:
                toId(row.CATEGORY_ID) ??
                (row.CATEGORY_ID === '0' || row.CATEGORY_ID === 0 ? 0 : null),
            stageId: typeof row.STAGE_ID === 'string' ? row.STAGE_ID : '',
            closed: row.CLOSED === 'Y' || row.CLOSED === true,
            responsibleId: toId(row.ASSIGNED_BY_ID),
            companyId: toId(row.COMPANY_ID),
            contactIds: [...contactIds],
            leadIds: this.leadIdsOf(row),
            row,
        };
    }

    /** Лиды сделки: наши связи + штатный LEAD_ID, без дублей. */
    private leadIdsOf(row: BxRow): number[] {
        const ids = new Set<number>();
        const push = (raw: unknown): void => {
            const items = Array.isArray(raw) ? raw : [raw];
            for (const value of items) {
                const id = toId(value);
                if (id) ids.add(id);
            }
        };
        push(row.LEAD_ID);
        for (const code of [
            PBX_SALES_EVENT_FIELD_CODES.deal_from_lead_id,
            PBX_SALES_EVENT_FIELD_CODES.deal_joined_leads,
        ]) {
            const field = this.portal.getEntityFieldByCode('deal', code);
            if (field) push(row[this.portal.getFieldBitrixId(field)]);
        }
        return [...ids];
    }

    private async flush(): Promise<Map<string, unknown>> {
        const flat = new Map<string, unknown>();
        for (const chunk of await this.bitrix.api.callBatchWithConcurrency(1)) {
            for (const [cmd, value] of Object.entries(
                (chunk?.result ?? {}) as Record<string, unknown>,
            )) {
                flat.set(cmd, value);
            }
        }
        return flat;
    }

    private rowOf(raw: unknown): BxRow | null {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
        const container = raw as { result?: unknown };
        if (container.result && typeof container.result === 'object') {
            return this.rowOf(container.result);
        }
        return raw as BxRow;
    }

    private rowsOf(raw: unknown): BxRow[] {
        if (Array.isArray(raw)) {
            return raw.filter(
                (row): row is BxRow => !!row && typeof row === 'object',
            );
        }
        if (raw && typeof raw === 'object') {
            const container = raw as { items?: unknown; result?: unknown };
            if (Array.isArray(container.items))
                return this.rowsOf(container.items);
            if (Array.isArray(container.result))
                return this.rowsOf(container.result);
        }
        return [];
    }
}
