import { Injectable, Logger } from '@nestjs/common';
import { PBXService } from '@lib/pbx/pbx.service';
import {
    CallReportLinkStatusCode,
    TranscriptionPipelineView,
} from '@lib/call-lib';
import { CallReportListTruthService } from '@lib/call-lib/call-report/services/call-report-list-truth.service';
import { CallReportListSearch } from '@lib/call-lib/call-report/services/call-report-list-truth.types';
import { CallPassport } from './call-context-builder.service';

/** Привязка элемента списка отчётности к смарт-элементу звонка. */
export interface CallReportListLink {
    itemId: string;
    status: CallReportLinkStatusCode;
}

/** Найденные записи отчётности по звонку. */
export interface CallReportListLinks {
    kpiItem?: CallReportListLink;
    historyItem?: CallReportListLink;
    /** Прочие записи клиента рядом по времени (id), без выбранных выше. */
    relatedReportIds: string[];
}

const RELATED_LIMIT = 10;

const EMPTY: CallReportListLinks = { relatedReportIds: [] };

/**
 * Детерминированная привязка звонка к записям отчётности менеджера
 * (списки «ОП KPI» и «ОП История») — для ВНУТРЕННЕГО конвейера разбора.
 *
 * ЗАЧЕМ (запрос владельца 05.09.2026: «ни один элемент ОП История не был
 * найден за всю историю»): поля KPI_ITEM_x / HISTORY_ITEM_x смарта заполнял
 * только внешний агент (кандидаты в пакете звонка) и ночной ревизор через
 * LLM; агента нет, ревизор по умолчанию выключен — поля пустовали всегда.
 * Здесь связь устанавливает КОД, без LLM.
 *
 * ПОРЯДОК ПОСЛЕ §4 (прод-фиксы, 14.09.2026): запись ищется по ссылкам
 * САМОГО ЗВОНКА (сущность-владелец, компания, контакт) — дотянутая семья
 * сделок в поиск больше не подмешивается. Разворот «запись → семья
 * сущностей» делает `CallReportListTruthService`, он же владеет поиском и
 * ранжированием: здесь только перевод найденного в связи смарт-элемента.
 *
 * Fail-open: любая ошибка → пустой результат, разбор пишется без привязок.
 */
@Injectable()
export class CallReportListLinkService {
    private readonly logger = new Logger(CallReportListLinkService.name);

    constructor(private readonly pbxService: PBXService) {}

    async find(
        domain: string,
        passport: CallPassport,
        row: TranscriptionPipelineView,
        callType: string | null,
    ): Promise<CallReportListLinks> {
        if (!row.callStartedAt) return EMPTY;
        try {
            const { bitrix, PortalModel: portal } =
                await this.pbxService.init(domain);
            const truth = new CallReportListTruthService(
                bitrix,
                portal,
                this.logger,
            );
            const search = await truth.search({
                entityType: passport.entityType,
                entityId: passport.entityId,
                companyId: passport.crmCompanyId,
                contactId: passport.crmContactId,
                callStartedAt: row.callStartedAt,
                callerId: row.userId,
                callType,
            });
            if (!search.crmRefs.length) return EMPTY;
            const links = this.toLinks(search);
            this.logger.log(
                `Записи отчётности (${domain}, transcription ${row.id}): ` +
                    `КПИ ${this.describe(links.kpiItem)}, история ` +
                    `${this.describe(links.historyItem)}, прочих ` +
                    `${links.relatedReportIds.length} (кандидатов ` +
                    `${search.counts.kpi}/${search.counts.history}, ссылок ` +
                    `${search.crmRefs.join(',')})`,
            );
            return links;
        } catch (error) {
            this.logger.warn(
                `Записи отчётности не найдены (${domain}, transcription ${row.id}): ` +
                    (error as Error).message,
            );
            return EMPTY;
        }
    }

    /** Найденные записи → связи смарт-элемента. */
    private toLinks(search: CallReportListSearch): CallReportListLinks {
        return {
            kpiItem: search.kpi
                ? { itemId: search.kpi.record.id, status: search.kpi.status }
                : undefined,
            historyItem: search.history
                ? {
                      itemId: search.history.record.id,
                      status: search.history.status,
                  }
                : undefined,
            relatedReportIds: search.rest
                .slice(0, RELATED_LIMIT)
                .map(record => record.id),
        };
    }

    private describe(link: CallReportListLink | undefined): string {
        return link ? `#${link.itemId} (${link.status})` : '—';
    }
}
