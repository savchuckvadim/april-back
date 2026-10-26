import type { IsoDate } from '../../shared/lib/month-segments.util';
import {
    KPI_DIGEST_BATCH_CONTEXT,
    KPI_DIGEST_DEALS_CAP,
} from '../constants/digest.const';
import type {
    KpiDigestEntityRefDto,
    KpiDigestPresentationDto,
    KpiDigestSaleDto,
} from '../dto/digest-presentations.dto';
import { chunk, runBatch, type BatchCommand } from '../lib/digest-batch.util';
import {
    digestDealSelect,
    type DigestDealFields,
} from '../lib/digest-deal-fields.util';
import {
    detectUfSkewHours,
    linkedDealId,
    mapPresentationDeal,
    mapSaleDeal,
} from '../lib/digest-presentation.mapper';
import { firstScalar, scalarsOf } from '../lib/digest-record.mapper';
import {
    loadDeals,
    type ListElementRow,
    type ListElementsApi,
} from '../lib/digest-page-loader';
import { dayBounds } from '../lib/digest-period.util';
import type { DigestPresentationsPartition } from '../types/digest-presentations.type';

/** Команд в одном списочном запросе по ID (лимит страницы Битрикса). */
const IDS_PER_CALL = 50;
/** Значений связи в одном фильтре to_base_sales (ID и D_ID на каждую сделку). */
const BASE_IDS_PER_FILTER = 25;
/** Не больше стольких сделок за день читаем товарные строки. */
const PRODUCT_ROWS_CAP = 200;

interface BaseDealInfo {
    title: string;
    opportunity: number;
    complectName: string | null;
}

/**
 * Презентации и продажи дня по всему порталу.
 *
 * Сделки «ОП Презентации» попадают в день по любой из дат: назначена на
 * день (next_pres_plan_date), проведена (last_pres_done_date), создана,
 * сменила стадию (MOVED_TIME). OR в фильтре crm.deal.list нет — четыре
 * выборки, объединение по ID. Комплект и сумма — с самой сделки
 * презентации, иначе с основной сделки (to_base_sales): конструктор пишет
 * их туда, где его открыли.
 *
 * НЕ Injectable: держит bitrix-api домена (правило CLAUDE.md).
 */
export class DigestPresentationsLoader {
    private ufShiftHours = 0;

    constructor(
        private readonly api: ListElementsApi,
        private readonly fields: DigestDealFields,
    ) {}

    async load(date: IsoDate): Promise<DigestPresentationsPartition> {
        const builtAt = new Date().toISOString();
        const warnings: string[] = [];
        if (!this.fields.presCategoryId) {
            warnings.push(
                'Воронка «ОП Презентации» не настроена на портале — презентации дня недоступны.',
            );
        }

        const pres = this.fields.presCategoryId
            ? await this.loadDayPresentations(date)
            : { items: [] as KpiDigestPresentationDto[], truncated: false };
        const sales = this.fields.baseCategoryId
            ? await this.loadDaySales(date)
            : { sales: [] as KpiDigestSaleDto[], truncated: false };
        if (!this.fields.baseCategoryId) {
            warnings.push(
                'Воронка «ОП Основная» не настроена — продажи дня недоступны.',
            );
        }

        await this.fillBaseDeals(pres.items, sales.sales);
        await this.fillProductRows(pres.items, sales.sales);
        await this.fillEntityTitles(pres.items, sales.sales);

        return {
            date,
            items: pres.items,
            sales: sales.sales,
            truncated: pres.truncated || sales.truncated,
            warnings,
            builtAt,
        };
    }

    // -----------------------------------------------------------------
    // Презентации дня
    // -----------------------------------------------------------------

    private async loadDayPresentations(
        date: IsoDate,
    ): Promise<{ items: KpiDigestPresentationDto[]; truncated: boolean }> {
        const { uf } = this.fields;
        const bounds = dayBounds(date);
        const ufFrom = `${bounds.bitrixFrom} 00:00:00`;
        const ufTo = `${bounds.bitrixTo} 00:00:00`;
        const isoFrom = `${date}T00:00:00`;
        const isoTo = `${bounds.nextDate}T00:00:00`;

        const filters: Record<string, unknown>[] = [];
        if (uf.nextPresPlanDate) {
            filters.push({
                [`>=${uf.nextPresPlanDate}`]: ufFrom,
                [`<${uf.nextPresPlanDate}`]: ufTo,
            });
        }
        if (uf.lastPresDoneDate) {
            filters.push({
                [`>=${uf.lastPresDoneDate}`]: ufFrom,
                [`<${uf.lastPresDoneDate}`]: ufTo,
            });
        }
        filters.push({ '>=DATE_CREATE': isoFrom, '<DATE_CREATE': isoTo });
        filters.push({ '>=MOVED_TIME': isoFrom, '<MOVED_TIME': isoTo });

        const rows = new Map<number, ListElementRow>();
        let truncated = false;
        for (const [index, filter] of filters.entries()) {
            const result = await loadDeals(
                this.api,
                { CATEGORY_ID: this.fields.presCategoryId, ...filter },
                digestDealSelect(this.fields),
                KPI_DIGEST_DEALS_CAP,
                `${KPI_DIGEST_BATCH_CONTEXT}: презентации ${date} (${index + 1})`,
            );
            truncated = truncated || result.truncated;
            for (const row of result.rows) {
                // Битрикс молча игнорирует фильтр по неустановленному полю —
                // повторная проверка воронки отсекает чужие сделки.
                if (
                    String(row.CATEGORY_ID ?? '') !== this.fields.presCategoryId
                )
                    continue;
                rows.set(Number(row.ID), row);
            }
        }

        // UF-даты пишутся стенным временем портала — выравниваем их к поясу
        // системных дат, записей KPI и звонков (одна шкала часов в дайджесте).
        this.ufShiftHours = -detectUfSkewHours([...rows.values()], this.fields);
        const items = [...rows.values()]
            .map(row =>
                mapPresentationDeal(row, this.fields, date, this.ufShiftHours),
            )
            .filter(item => item.dealId > 0 && item.dayStatus !== 'other');
        return { items, truncated };
    }

    // -----------------------------------------------------------------
    // Продажи дня и их презентации
    // -----------------------------------------------------------------

    private async loadDaySales(
        date: IsoDate,
    ): Promise<{ sales: KpiDigestSaleDto[]; truncated: boolean }> {
        const bounds = dayBounds(date);
        const result = await loadDeals(
            this.api,
            {
                CATEGORY_ID: this.fields.baseCategoryId,
                STAGE_SEMANTIC_ID: 'S',
                '>=CLOSEDATE': date,
                '<CLOSEDATE': bounds.nextDate,
            },
            digestDealSelect(this.fields),
            KPI_DIGEST_DEALS_CAP,
            `${KPI_DIGEST_BATCH_CONTEXT}: продажи ${date}`,
        );
        const sales = result.rows
            .filter(
                row =>
                    String(row.CATEGORY_ID ?? '') ===
                    this.fields.baseCategoryId,
            )
            .map(row => mapSaleDeal(row, this.fields))
            .filter(sale => sale.dealId > 0);
        await this.fillSalePresentations(sales, date);
        return { sales, truncated: result.truncated };
    }

    private async fillSalePresentations(
        sales: KpiDigestSaleDto[],
        date: IsoDate,
    ): Promise<void> {
        const key = this.fields.uf.toBaseSales;
        if (!sales.length || !key || !this.fields.presCategoryId) return;
        const byId = new Map(sales.map(sale => [sale.dealId, sale]));
        for (const ids of chunk([...byId.keys()], BASE_IDS_PER_FILTER)) {
            const result = await loadDeals(
                this.api,
                {
                    CATEGORY_ID: this.fields.presCategoryId,
                    [key]: ids.flatMap(id => [String(id), `D_${id}`]),
                },
                digestDealSelect(this.fields),
                KPI_DIGEST_DEALS_CAP,
                `${KPI_DIGEST_BATCH_CONTEXT}: презентации продаж ${date}`,
            );
            for (const row of result.rows) {
                const baseId = linkedDealId(row[key]);
                const sale = baseId ? byId.get(baseId) : undefined;
                if (
                    !sale ||
                    String(row.CATEGORY_ID ?? '') !== this.fields.presCategoryId
                )
                    continue;
                const item = mapPresentationDeal(
                    row,
                    this.fields,
                    date,
                    this.ufShiftHours,
                );
                sale.presentations.push({
                    dealId: item.dealId,
                    title: item.title,
                    assignedId: item.assignedId,
                    stageName: item.stageName,
                    doneDate: item.doneDate,
                });
            }
        }
    }

    // -----------------------------------------------------------------
    // Основные сделки презентаций: название, сумма, комплект
    // -----------------------------------------------------------------

    private async fillBaseDeals(
        items: KpiDigestPresentationDto[],
        sales: KpiDigestSaleDto[],
    ): Promise<void> {
        const known = new Map<number, BaseDealInfo>(
            sales.map(sale => [
                sale.dealId,
                {
                    title: sale.title,
                    opportunity: sale.opportunity,
                    complectName: sale.complectName,
                },
            ]),
        );
        const missing = [
            ...new Set(
                items
                    .map(item => item.baseDeal?.id)
                    .filter((id): id is number => !!id && !known.has(id)),
            ),
        ];
        const complectKey = this.fields.uf.complectName;
        const select = [
            'ID',
            'TITLE',
            'OPPORTUNITY',
            ...(complectKey ? [complectKey] : []),
        ];
        const commands: BatchCommand[] = chunk(missing, IDS_PER_CALL).map(
            (ids, index) => ({
                key: `base_${index}`,
                method: 'crm.deal.list',
                params: { filter: { ID: ids }, select, start: -1 },
            }),
        );
        const result = await runBatch(
            this.api,
            commands,
            `${KPI_DIGEST_BATCH_CONTEXT}: основные сделки`,
        );
        for (const command of commands) {
            const rows = result[command.key];
            if (!Array.isArray(rows)) continue;
            for (const row of rows as ListElementRow[]) {
                known.set(Number(row.ID), {
                    title: typeof row.TITLE === 'string' ? row.TITLE : '',
                    opportunity: Number(row.OPPORTUNITY) || 0,
                    complectName: complectKey
                        ? firstScalar(row[complectKey]) || null
                        : null,
                });
            }
        }

        for (const item of items) {
            const base = item.baseDeal
                ? known.get(item.baseDeal.id)
                : undefined;
            if (!item.baseDeal || !base) continue;
            item.baseDeal.title = base.title;
            if (!item.complectName && base.complectName) {
                item.complectName = base.complectName;
                item.complectSource = 'base';
            }
            if (item.sum <= 0 && base.opportunity > 0) {
                item.sum = base.opportunity;
                item.complectSource = item.complectSource ?? 'base';
            }
        }
    }

    // -----------------------------------------------------------------
    // Товарные строки: названия комплектов
    // -----------------------------------------------------------------

    private async fillProductRows(
        items: KpiDigestPresentationDto[],
        sales: KpiDigestSaleDto[],
    ): Promise<void> {
        // Свои строки — у презентаций с суммой; у остальных — строки основной сделки.
        const ownerOf = new Map<number, number>();
        for (const item of items) {
            const owner =
                item.complectSource === 'presentation' && item.sum > 0
                    ? item.dealId
                    : item.complectSource === 'base'
                      ? (item.baseDeal?.id ?? null)
                      : null;
            if (owner) ownerOf.set(item.dealId, owner);
        }
        for (const sale of sales) {
            if (sale.opportunity > 0) ownerOf.set(-sale.dealId, sale.dealId);
        }
        const dealIds = [...new Set(ownerOf.values())].slice(
            0,
            PRODUCT_ROWS_CAP,
        );
        if (!dealIds.length) return;

        const commands: BatchCommand[] = dealIds.map(id => ({
            key: `rows_${id}`,
            method: 'crm.item.productrow.list',
            params: { filter: { '=ownerType': 'D', '=ownerId': id } },
        }));
        const result = await runBatch(
            this.api,
            commands,
            `${KPI_DIGEST_BATCH_CONTEXT}: товарные строки`,
        );
        const namesOf = (dealId: number): string[] => {
            const payload = result[`rows_${dealId}`] as
                | { productRows?: { productName?: unknown }[] }
                | undefined;
            return [
                ...new Set(
                    (payload?.productRows ?? [])
                        .map(row => String(row.productName ?? '').trim())
                        .filter(Boolean),
                ),
            ];
        };

        for (const item of items) {
            const owner = ownerOf.get(item.dealId);
            if (!owner) continue;
            item.productNames = namesOf(owner);
            if (!item.complectName && item.productNames.length) {
                item.complectName = item.productNames[0];
            }
        }
        for (const sale of sales) {
            sale.productNames = namesOf(sale.dealId);
            if (!sale.complectName && sale.productNames.length) {
                sale.complectName = sale.productNames[0];
            }
        }
    }

    // -----------------------------------------------------------------
    // Названия компаний, контактов, лидов
    // -----------------------------------------------------------------

    private async fillEntityTitles(
        items: KpiDigestPresentationDto[],
        sales: KpiDigestSaleDto[],
    ): Promise<void> {
        const refs = [...items, ...sales];
        const idsOf = (
            pick: (ref: (typeof refs)[number]) => KpiDigestEntityRefDto | null,
        ) => [
            ...new Set(
                refs
                    .map(pick)
                    .filter((ref): ref is KpiDigestEntityRefDto => !!ref)
                    .map(ref => ref.id),
            ),
        ];
        const specs = [
            {
                kind: 'co',
                method: 'crm.company.list',
                select: ['ID', 'TITLE'],
                ids: idsOf(ref => ref.company),
            },
            {
                kind: 'c',
                method: 'crm.contact.list',
                select: ['ID', 'NAME', 'LAST_NAME'],
                ids: idsOf(ref => ref.contact),
            },
            {
                kind: 'l',
                method: 'crm.lead.list',
                select: ['ID', 'TITLE'],
                ids: idsOf(ref => ref.lead),
            },
        ];
        const commands: BatchCommand[] = specs.flatMap(spec =>
            chunk(spec.ids, IDS_PER_CALL).map((ids, index) => ({
                key: `${spec.kind}_${index}`,
                method: spec.method,
                params: { filter: { ID: ids }, select: spec.select, start: -1 },
            })),
        );
        const result = await runBatch(
            this.api,
            commands,
            `${KPI_DIGEST_BATCH_CONTEXT}: названия`,
        );

        const titles: Record<string, Map<number, string>> = {
            co: new Map(),
            c: new Map(),
            l: new Map(),
        };
        for (const command of commands) {
            const kind = command.key.split('_')[0];
            const rows = result[command.key];
            if (!Array.isArray(rows)) continue;
            for (const row of rows as ListElementRow[]) {
                const title =
                    kind === 'c'
                        ? scalarsOf([row.NAME, row.LAST_NAME]).join(' ')
                        : typeof row.TITLE === 'string'
                          ? row.TITLE
                          : '';
                titles[kind].set(Number(row.ID), title);
            }
        }
        const named = (ref: KpiDigestEntityRefDto | null, kind: string) => {
            if (ref) ref.title = titles[kind].get(ref.id) || `#${ref.id}`;
        };
        for (const ref of refs) {
            named(ref.company, 'co');
            named(ref.contact, 'c');
            named(ref.lead, 'l');
        }
    }
}
