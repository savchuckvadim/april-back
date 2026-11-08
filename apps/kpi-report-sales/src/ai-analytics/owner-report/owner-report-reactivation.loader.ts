import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@/core/prisma/prisma.service';
import { PBXService } from '@/modules/pbx';
import type { IBXDeal } from '@/modules/bitrix';
import { PBX_DEAL_SALES_BASE_STAGE_CODE } from '@lib/portal-lib/pbx-domain/portal-deal/sales/base/const/pbx-deal-sales-base-stages.const';
import type { IPCategory } from '@lib/portal-lib/portal/interfaces/portal.interface';
import { PbxDealCategoryCodeEnum } from '@lib/portal-lib/portal/services/types/deals/portal.deal.type';
import {
    isReactivationCall,
    toPortalDate,
    type OwnerReportClosedDeal,
} from '@lib/sales-ai-analytics';
import type { DatedLiteRow } from '../domain/loaders/lite-row.mapper';

/** Строка звонка отчёта с признаком «возврат ушедшего или отказавшего». */
export type OwnerReportDatedRow = DatedLiteRow & { reactivation?: boolean };

/** Сущность, к которой привязан звонок (transcriptions.entity_type). */
const CALL_ENTITY = { deal: 'deal', company: 'company' } as const;

/**
 * Отказные стадии «ОП Основная» — те же, из которых ХО возвращает клиента
 * в работу (решение владельца 14.10.2026): «Отказ», «Не состоялась»,
 * «Не ЦА». «Не беспокоить» — не отказ по сделке.
 */
const REFUSAL_STAGE_CODES: ReadonlySet<string> = new Set([
    PBX_DEAL_SALES_BASE_STAGE_CODE.fail,
    PBX_DEAL_SALES_BASE_STAGE_CODE.apology,
    PBX_DEAL_SALES_BASE_STAGE_CODE.notCa,
]);
const WON_STAGE_CODE = PBX_DEAL_SALES_BASE_STAGE_CODE.success;

const ID_CHUNK = 50;
const DB_CHUNK = 500;

const chunks = <T>(items: readonly T[], size: number): T[][] =>
    Array.from({ length: Math.ceil(items.length / size) }, (_, index) =>
        items.slice(index * size, index * size + size),
    );

/** STAGE_ID стадии: у общей воронки (0) он без префикса `C0:`. */
const stageIdOf = (category: IPCategory, stageBitrixId: string): string =>
    String(category.bitrixId) === '0'
        ? stageBitrixId
        : `C${category.bitrixId}:${stageBitrixId}`;

/**
 * Признак «реактивация» у звонков периода: компания звонка (прямо или
 * через сделку) → закрытые сделки «ОП Основная» компании → правило
 * `isReactivationCall`. Только чтение Битрикса. Fail-open: сбой — строки
 * без признака, отчёт выходит.
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
            const companyByCall = await this.companiesOfCalls(domain, rows);
            const companies = [...new Set(companyByCall.values())];
            if (companies.length === 0) return [...rows];
            const history = await this.closedDeals(domain, companies, timeZone);
            return rows.map(row => {
                const company = companyByCall.get(row.transcriptionId);
                const deals = company ? history.get(company) : undefined;
                if (!deals) return row;
                const callDate = toPortalDate(row.callStartedAt, timeZone);
                return isReactivationCall(callDate, deals)
                    ? { ...row, reactivation: true }
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
        const { bitrix } = await this.pbx.init(domain);
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

    /** Закрытые сделки «ОП Основная» по компаниям: отказы и успехи с датой. */
    private async closedDeals(
        domain: string,
        companies: readonly string[],
        timeZone: string,
    ): Promise<Map<string, OwnerReportClosedDeal[]>> {
        const { bitrix, PortalModel } = await this.pbx.init(domain);
        const category = PortalModel.getDealCategoryByCode(
            PbxDealCategoryCodeEnum.sales_base,
        );
        const result = new Map<string, OwnerReportClosedDeal[]>();
        if (!category) return result;
        const codeOfStage = new Map(
            category.stages.map(stage => [
                stageIdOf(category, String(stage.bitrixId)),
                stage.code,
            ]),
        );
        for (const part of chunks(companies, ID_CHUNK)) {
            const deals = await bitrix.deal.all(
                {
                    CATEGORY_ID: category.bitrixId,
                    CLOSED: 'Y',
                    '@COMPANY_ID': part,
                } as unknown as Partial<IBXDeal>,
                ['ID', 'COMPANY_ID', 'STAGE_ID', 'CLOSEDATE'],
            );
            for (const deal of deals) {
                const code = codeOfStage.get(String(deal.STAGE_ID));
                const kind = code
                    ? REFUSAL_STAGE_CODES.has(code)
                        ? 'refusal'
                        : code === WON_STAGE_CODE
                          ? 'won'
                          : null
                    : null;
                const closed = new Date(String(deal.CLOSEDATE ?? ''));
                if (!kind || Number.isNaN(closed.getTime())) continue;
                const company = String(deal.COMPANY_ID);
                const list = result.get(company) ?? [];
                list.push({ kind, date: toPortalDate(closed, timeZone) });
                result.set(company, list);
            }
        }
        return result;
    }
}
