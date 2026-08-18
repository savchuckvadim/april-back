import { Logger } from '@nestjs/common';
import { BitrixService } from '@lib/bitrix';
import { TranscriptionPipelineView } from '@lib/call-lib';
import {
    SalesListCode,
    SalesListReaderService,
    SalesListRecord,
} from '@lib/portal-lib/pbx/pbx-sales-list-reader';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import {
    RevisionListCandidate,
    RevisionListCandidates,
} from '../contracts/call-revision.contract';
import { CallPassport } from './call-context-builder.service';

/** Окно поиска «рядом по времени» вокруг звонков сущности, дней. */
const TIME_WINDOW_DAYS = 3;
/** Лимит кандидатов на список — модель выбирает из короткого списка. */
const CANDIDATES_LIMIT = 10;

/**
 * Кандидаты записей отчётности (sales_kpi / sales_history) для привязки
 * ночным ревизором. Чтение и резолв полей — через «робота»
 * SalesListReaderService (канон kpi-report: фильтры по bitrixCamelId,
 * значения выпадающих списков по bitrixId элемента, даты по полю события).
 *
 * Два уровня (идея владельца):
 *  1. По CRM-полю самой записи (multiple, может ссылаться на
 *     сделку/компанию/лид/контакт) — строгие кандидаты.
 *  2. Пусто — «кто был рядом»: записи в окне ±TIME_WINDOW_DAYS вокруг
 *     звонков сущности от менеджера звонка.
 *
 * Семантический выбор из кандидатов делает LLM-ревизия. Fail-open.
 *
 * НЕ @Injectable: создаётся `new` рядом с BitrixService (см. CLAUDE.md).
 */
export class RevisionListCandidatesService {
    private readonly logger = new Logger(RevisionListCandidatesService.name);
    private readonly reader: SalesListReaderService;

    constructor(bitrix: BitrixService, portal: PortalModel) {
        this.reader = new SalesListReaderService(bitrix, portal);
    }

    async find(
        passport: CallPassport,
        rows: TranscriptionPipelineView[],
    ): Promise<RevisionListCandidates> {
        return {
            kpi: await this.findForList('sales_kpi', passport, rows),
            history: await this.findForList('sales_history', passport, rows),
        };
    }

    private async findForList(
        listCode: SalesListCode,
        passport: CallPassport,
        rows: TranscriptionPipelineView[],
    ): Promise<RevisionListCandidate[]> {
        try {
            const crmRefs = this.buildCrmRefs(passport);
            if (crmRefs.length) {
                const byCrm = await this.reader.read(listCode, {
                    crmRefs,
                    limit: CANDIDATES_LIMIT,
                });
                if (byCrm.length) {
                    return byCrm.map(record => this.toCandidate(record, 'crm'));
                }
            }
            return (await this.findByTimeWindow(listCode, rows)).map(record =>
                this.toCandidate(record, 'time'),
            );
        } catch (error) {
            this.logger.warn(
                `Кандидаты ${listCode} не собраны: ${(error as Error).message}`,
            );
            return [];
        }
    }

    /** Уровень 2: записи менеджера рядом по времени со звонками. */
    private async findByTimeWindow(
        listCode: SalesListCode,
        rows: TranscriptionPipelineView[],
    ): Promise<SalesListRecord[]> {
        const dates = rows
            .map(row => row.callStartedAt)
            .filter((date): date is Date => Boolean(date))
            .map(date => new Date(date).getTime());
        if (!dates.length) return [];

        const dayMs = 24 * 60 * 60_000;
        return this.reader.read(listCode, {
            dateFrom: new Date(Math.min(...dates) - TIME_WINDOW_DAYS * dayMs),
            dateTo: new Date(Math.max(...dates) + TIME_WINDOW_DAYS * dayMs),
            responsibleId: rows.find(row => row.userId)?.userId ?? undefined,
            limit: CANDIDATES_LIMIT,
        });
    }

    /**
     * CRM-ссылки владельца звонка в формате значений crm-поля списка:
     * D_{id} сделка, L_{id} лид, CO_{id} компания, C_{id} контакт.
     */
    private buildCrmRefs(passport: CallPassport): string[] {
        const refs: string[] = [];
        if (passport.entityType === 'deal' && passport.entityId) {
            refs.push(`D_${passport.entityId}`);
        }
        if (passport.entityType === 'lead' && passport.entityId) {
            refs.push(`L_${passport.entityId}`);
        }
        if (passport.crmCompanyId) refs.push(`CO_${passport.crmCompanyId}`);
        if (passport.crmContactId) refs.push(`C_${passport.crmContactId}`);
        return refs;
    }

    /** Резолвленная запись → кандидат ревизии (тип события — в preview). */
    private toCandidate(
        record: SalesListRecord,
        matchedBy: 'crm' | 'time',
    ): RevisionListCandidate {
        const meta = [
            record.eventTypeName
                ? `тип события: ${record.eventTypeName}`
                : null,
            record.eventActionName
                ? `действие: ${record.eventActionName}`
                : null,
        ].filter(Boolean);
        const fields = record.fields.map(
            field => `${field.name}: ${field.value}`,
        );
        return {
            id: record.id,
            name: record.name,
            createdAt: record.eventDate ?? record.createdAt,
            matchedBy,
            preview: [...meta, ...fields].join('; '),
        };
    }
}
