import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@/core/prisma/prisma.service';
import { PBXService } from '@/modules/pbx';
import type { IBXDeal } from '@/modules/bitrix';
import type { BitrixService } from '@lib/bitrix';
import type { IPCategory } from '@lib/portal-lib/portal/interfaces/portal.interface';
import type { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { PbxDealCategoryCodeEnum } from '@lib/portal-lib/portal/services/types/deals/portal.deal.type';
import { EnumSalesKpiEventType } from '@lib/portal-lib/pbx/pbx-sales-kpi-list/type/pbx-sales-kpi-list.enum';
import {
    SALES_LIST_CODES,
    SalesListReaderService,
} from '@lib/portal-lib/pbx/pbx-sales-list-reader';
import {
    reactivationOf,
    toPortalDate,
    type OwnerReportClosedDeal,
    type OwnerReportRefusalSource,
} from '@lib/sales-ai-analytics';
import type { DatedLiteRow } from '../domain/loaders/lite-row.mapper';
import {
    dealSignalsOf,
    refusalFieldsOf,
    type DealRow,
} from './owner-report-refusal-signals.util';

/** Строка звонка отчёта с признаком «возврат ушедшего или отказавшего». */
export type OwnerReportDatedRow = DatedLiteRow & {
    reactivation?: boolean;
    /** Откуда известен отказ: финал сделки, запись «ОП История», поля сделки. */
    reactivationSource?: OwnerReportRefusalSource;
};

/** Сущность, к которой привязан звонок (transcriptions.entity_type). */
const CALL_ENTITY = { deal: 'deal', company: 'company' } as const;

const ID_CHUNK = 50;
const DB_CHUNK = 500;
/** Записей «ОП История» типа «Отказ» на порцию компаний — с запасом. */
const HISTORY_LIMIT = 500;
/** Префикс ссылки на компанию в crm-поле списка. */
const COMPANY_REF = 'CO_';

const chunks = <T>(items: readonly T[], size: number): T[][] =>
    Array.from({ length: Math.ceil(items.length / size) }, (_, index) =>
        items.slice(index * size, index * size + size),
    );

/** STAGE_ID стадии: у общей воронки (0) он без префикса `C0:`. */
const stageIdOf = (category: IPCategory, stageBitrixId: string): string =>
    String(category.bitrixId) === '0'
        ? stageBitrixId
        : `C${category.bitrixId}:${stageBitrixId}`;

const push = (
    map: Map<string, OwnerReportClosedDeal[]>,
    company: string,
    signal: OwnerReportClosedDeal,
): void => {
    const list = map.get(company) ?? [];
    list.push(signal);
    map.set(company, list);
};

/**
 * Признак «реактивация» у звонков периода: компания звонка (прямо или
 * через сделку) → отказы и успехи компании по сделкам «ОП Основная»
 * (финалы, поля сделки) и записям «ОП История» типа «Отказ» → правило
 * `reactivationOf`. Только чтение Битрикса. Fail-open: сбой — строки без
 * признака, отчёт выходит.
 *
 * `@Injectable` без bitrix-состояния: инстанс — внутри метода.
 */
@Injectable()
export class OwnerReportReactivationLoader {
    private readonly logger = new Logger(OwnerReportReactivationLoader.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly pbx: PBXService,
    ) {}

    async mark(
        domain: string,
        rows: readonly DatedLiteRow[],
        timeZone: string,
    ): Promise<OwnerReportDatedRow[]> {
        if (rows.length === 0) return [];
        try {
            const { bitrix, PortalModel: portal } = await this.pbx.init(domain);
            const companyByCall = await this.companiesOfCalls(
                bitrix,
                domain,
                rows,
            );
            const companies = [...new Set(companyByCall.values())];
            if (companies.length === 0) return [...rows];
            const history = await this.refusalHistory(
                bitrix,
                portal,
                companies,
                timeZone,
            );
            return rows.map(row => {
                const company = companyByCall.get(row.transcriptionId);
                const deals = company ? history.get(company) : undefined;
                if (!deals) return row;
                const source = reactivationOf(
                    toPortalDate(row.callStartedAt, timeZone),
                    deals,
                );
                return source
                    ? { ...row, reactivation: true, reactivationSource: source }
                    : row;
            });
        } catch (error) {
            this.logger.warn(
                `Реактивация ${domain}: признак не посчитан — ${(error as Error).message}`,
            );
            return [...rows];
        }
    }

    /** Компания каждого звонка: из привязки транскрипции или её сделки. */
    private async companiesOfCalls(
        bitrix: BitrixService,
        domain: string,
        rows: readonly DatedLiteRow[],
    ): Promise<Map<string, string>> {
        const links: {
            id: string;
            type: string | null;
            entity: string | null;
        }[] = [];
        for (const part of chunks(
            rows.map(row => BigInt(row.transcriptionId)),
            DB_CHUNK,
        )) {
            const found = await this.prisma.transcription.findMany({
                where: { domain, id: { in: part } },
                select: { id: true, entity_type: true, entity_id: true },
            });
            for (const item of found) {
                links.push({
                    id: String(item.id),
                    type: item.entity_type,
                    entity: item.entity_id,
                });
            }
        }
        const result = new Map<string, string>();
        const dealIds = new Set<string>();
        for (const link of links) {
            if (!link.entity) continue;
            if (link.type === CALL_ENTITY.company)
                result.set(link.id, link.entity);
            if (link.type === CALL_ENTITY.deal) dealIds.add(link.entity);
        }
        if (dealIds.size === 0) return result;
        const companyOfDeal = new Map<string, string>();
        for (const part of chunks([...dealIds], ID_CHUNK)) {
            const deals = await bitrix.deal.all(
                { '@ID': part } as unknown as Partial<IBXDeal>,
                ['ID', 'COMPANY_ID'],
            );
            for (const deal of deals) {
                const company = String(deal.COMPANY_ID ?? '');
                if (company && company !== '0') {
                    companyOfDeal.set(String(deal.ID), company);
                }
            }
        }
        for (const link of links) {
            if (link.type !== CALL_ENTITY.deal || !link.entity) continue;
            const company = companyOfDeal.get(link.entity);
            if (company) result.set(link.id, company);
        }
        return result;
    }

    /**
     * Отказы и успехи по компаниям: сделки «ОП Основная» (финал — основной
     * источник, поля сделки — вторичный) плюс записи «ОП История» типа
     * «Отказ» по ссылке на компанию.
     */
    private async refusalHistory(
        bitrix: BitrixService,
        portal: PortalModel,
        companies: readonly string[],
        timeZone: string,
    ): Promise<Map<string, OwnerReportClosedDeal[]>> {
        const result = new Map<string, OwnerReportClosedDeal[]>();
        const category = portal.getDealCategoryByCode(
            PbxDealCategoryCodeEnum.sales_base,
        );
        if (!category) return result;
        const codeOfStage = new Map(
            category.stages.map(stage => [
                stageIdOf(category, String(stage.bitrixId)),
                stage.code,
            ]),
        );
        const fields = refusalFieldsOf(portal);
        for (const part of chunks(companies, ID_CHUNK)) {
            const deals = await bitrix.deal.all(
                {
                    CATEGORY_ID: category.bitrixId,
                    '@COMPANY_ID': part,
                } as unknown as Partial<IBXDeal>,
                [
                    'ID',
                    'COMPANY_ID',
                    'STAGE_ID',
                    'CLOSEDATE',
                    'DATE_MODIFY',
                    ...(fields?.select ?? []),
                ],
            );
            for (const deal of deals) {
                const company = String(deal.COMPANY_ID);
                const signals = dealSignalsOf(
                    deal as unknown as DealRow,
                    codeOfStage,
                    fields,
                    timeZone,
                );
                for (const signal of signals) push(result, company, signal);
            }
        }
        const history = await this.historyRefusals(
            bitrix,
            portal,
            companies,
            timeZone,
        );
        for (const [company, signals] of history) {
            for (const signal of signals) push(result, company, signal);
        }
        return result;
    }

    /**
     * Записи «ОП История» типа «Отказ» по ссылке на компанию (crm-поле
     * списка, `CO_<id>`): дата события, без неё — дата записи. Читатель
     * списков fail-open: списка нет или сбой — записей нет.
     */
    private async historyRefusals(
        bitrix: BitrixService,
        portal: PortalModel,
        companies: readonly string[],
        timeZone: string,
    ): Promise<Map<string, OwnerReportClosedDeal[]>> {
        const result = new Map<string, OwnerReportClosedDeal[]>();
        const reader = new SalesListReaderService(bitrix, portal);
        for (const part of chunks(companies, ID_CHUNK)) {
            const records = await reader.read(SALES_LIST_CODES.history, {
                crmRefs: part.map(id => `${COMPANY_REF}${id}`),
                eventTypeCodes: [EnumSalesKpiEventType.ev_fail],
                limit: HISTORY_LIMIT,
            });
            for (const record of records) {
                const company = record.crmRefs
                    .find(ref => ref.startsWith(COMPANY_REF))
                    ?.slice(COMPANY_REF.length);
                const raw = record.eventDate ?? record.createdAt;
                if (!company || !raw) continue;
                const date = new Date(raw);
                if (Number.isNaN(date.getTime())) continue;
                push(result, company, {
                    kind: 'refusal',
                    date: toPortalDate(date, timeZone),
                    source: 'history',
                });
            }
        }
        return result;
    }
}
