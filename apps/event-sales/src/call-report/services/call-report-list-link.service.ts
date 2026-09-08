import { Injectable, Logger } from '@nestjs/common';
import { PBXService } from '@lib/pbx/pbx.service';
import {
    CallReportLinkStatusCode,
    TranscriptionPipelineView,
} from '@lib/call-lib';
import { CallReportDealFamilyService } from '@lib/call-lib/call-report/services/call-report-deal-family.service';
import {
    SalesListReaderService,
    SalesListRecord,
} from '@lib/portal-lib/pbx/pbx-sales-list-reader';
import { PbxSalesKpiListFieldItemCode } from '@lib/portal-lib/pbx/pbx-sales-kpi-list/type/pbx-sales-kpi-list-field.type';
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

/** Окно по дате события вокруг звонка для записей, привязанных к клиенту. */
const WINDOW_DAYS = 3;
/** «Та же запись о том же событии»: не дальше суток с запасом на TZ. */
const CONFIRMED_MAX_HOURS = 30;
const CANDIDATES_LIMIT = 30;
const RELATED_LIMIT = 10;

/**
 * Тип звонка → коды типов событий списка, которыми менеджер о нём
 * отчитывается (items поля event_type списков sales_kpi/sales_history).
 */
const EVENT_TYPES_BY_CALL_TYPE: Record<
    string,
    readonly PbxSalesKpiListFieldItemCode<'event_type'>[]
> = {
    cold: ['xo', 'call'],
    site_lead: ['site', 'call'],
    call: ['call', 'come_call'],
    presentation: ['presentation'],
    refine: ['call', 'presentation'],
    decision: ['call_in_progress', 'call'],
    payment: ['call_in_money', 'call'],
};

const EMPTY: CallReportListLinks = { relatedReportIds: [] };

/**
 * Детерминированная привязка звонка к записям отчётности менеджера
 * (списки «ОП KPI» и «ОП История») — для ВНУТРЕННЕГО конвейера разбора.
 *
 * ЗАЧЕМ (запрос владельца 05.09.2026: «ни один элемент ОП История не был
 * найден за всю историю»): поля KPI_ITEM_x / HISTORY_ITEM_x смарта заполнял
 * только внешний агент (кандидаты в пакете звонка) и ночной ревизор через
 * LLM; агента нет, ревизор по умолчанию выключен — поля пустовали всегда.
 * Здесь связь устанавливает КОД, без LLM: запись считается «той самой»,
 * если она привязана CRM-полем к клиенту звонка (любая сделка семьи —
 * основная/презентация/ХО, лид, компания, контакт) и её дата события
 * рядом со звонком. Точность — по близости даты, совпадению типа события
 * с типом звонка и ответственного с менеджером звонка.
 *
 * Fail-open: любая ошибка → пустой результат, разбор пишется без привязок.
 */
@Injectable()
export class CallReportListLinkService {
    private readonly logger = new Logger(CallReportListLinkService.name);

    constructor(
        private readonly pbxService: PBXService,
        private readonly dealFamily: CallReportDealFamilyService,
    ) {}

    async find(
        domain: string,
        passport: CallPassport,
        row: TranscriptionPipelineView,
        callType: string | null,
    ): Promise<CallReportListLinks> {
        if (!row.callStartedAt) return EMPTY;
        try {
            const crmRefs = await this.buildCrmRefs(domain, passport);
            if (!crmRefs.length) return EMPTY;
            const { bitrix, PortalModel: portal } =
                await this.pbxService.init(domain);
            const reader = new SalesListReaderService(bitrix, portal);
            const callAt = new Date(row.callStartedAt).getTime();
            const dayMs = 24 * 60 * 60_000;
            const query = {
                crmRefs,
                dateFrom: new Date(callAt - WINDOW_DAYS * dayMs),
                dateTo: new Date(callAt + WINDOW_DAYS * dayMs),
                limit: CANDIDATES_LIMIT,
            };
            const [kpi, history] = await Promise.all([
                reader.read('sales_kpi', query),
                reader.read('sales_history', query),
            ]);
            const crmSet = new Set(crmRefs);
            const kpiPick = this.pick(
                kpi,
                crmSet,
                callAt,
                row.userId,
                callType,
            );
            const historyPick = this.pick(
                history,
                crmSet,
                callAt,
                row.userId,
                callType,
            );
            const chosen = new Set(
                [kpiPick.best?.id, historyPick.best?.id].filter(Boolean),
            );
            const relatedReportIds = [...kpiPick.rest, ...historyPick.rest]
                .filter(record => !chosen.has(record.id))
                .slice(0, RELATED_LIMIT)
                .map(record => record.id);
            const links: CallReportListLinks = {
                kpiItem: kpiPick.best
                    ? { itemId: kpiPick.best.id, status: kpiPick.status }
                    : undefined,
                historyItem: historyPick.best
                    ? {
                          itemId: historyPick.best.id,
                          status: historyPick.status,
                      }
                    : undefined,
                relatedReportIds,
            };
            this.logger.log(
                `Записи отчётности (${domain}, transcription ${row.id}): ` +
                    `КПИ ${this.describe(links.kpiItem)}, история ` +
                    `${this.describe(links.historyItem)}, прочих ${relatedReportIds.length} ` +
                    `(кандидатов ${kpi.length}/${history.length}, ссылок ${crmRefs.join(',')})`,
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

    /**
     * Все CRM-ссылки клиента звонка в формате crm-поля списка: сделки
     * семьи (владелец + основная + презентация + ХО), лид, компания,
     * контакт. Записи отчётности пишутся из карточки ЛЮБОЙ из этих
     * сущностей, а звонок мог идти из дочерней сделки.
     */
    private async buildCrmRefs(
        domain: string,
        passport: CallPassport,
    ): Promise<string[]> {
        const refs = new Set<string>();
        if (passport.entityType === 'deal' && passport.entityId) {
            refs.add(`D_${passport.entityId}`);
            const family = await this.dealFamily.resolve(
                domain,
                passport.entityId,
                {
                    companyId: passport.crmCompanyId ?? undefined,
                    contactId: passport.crmContactId ?? undefined,
                },
            );
            for (const id of [
                family.mainDealId,
                family.presentationDealId,
                family.xoDealId,
            ]) {
                if (id) refs.add(`D_${id}`);
            }
        }
        if (passport.entityType === 'lead' && passport.entityId) {
            refs.add(`L_${passport.entityId}`);
        }
        if (passport.crmCompanyId) refs.add(`CO_${passport.crmCompanyId}`);
        if (passport.crmContactId) refs.add(`C_${passport.crmContactId}`);
        return [...refs];
    }

    /**
     * Выбор записи списка: только записи, действительно ссылающиеся на
     * клиента (страховка от «сервер проигнорировал фильтр»), ранжирование
     * по совпадению типа события, ответственного и близости даты.
     */
    private pick(
        records: SalesListRecord[],
        crmSet: Set<string>,
        callAt: number,
        callerId: string | null,
        callType: string | null,
    ): {
        best: SalesListRecord | null;
        status: CallReportLinkStatusCode;
        rest: SalesListRecord[];
    } {
        const wantedTypes = callType
            ? EVENT_TYPES_BY_CALL_TYPE[callType]
            : undefined;
        const ranked = records
            .filter(record => record.crmRefs.some(ref => crmSet.has(ref)))
            .map(record => {
                const at = this.eventTime(record);
                return {
                    record,
                    distanceMs: at === null ? Infinity : Math.abs(at - callAt),
                    typeMatch: Boolean(
                        record.eventTypeCode &&
                            wantedTypes?.some(
                                code => code === record.eventTypeCode,
                            ),
                    ),
                    responsibleMatch: Boolean(
                        callerId &&
                            record.responsibleId &&
                            String(record.responsibleId) === String(callerId),
                    ),
                };
            })
            .sort(
                (a, b) =>
                    Number(b.typeMatch) - Number(a.typeMatch) ||
                    Number(b.responsibleMatch) - Number(a.responsibleMatch) ||
                    a.distanceMs - b.distanceMs,
            );
        const top = ranked[0];
        if (!top) return { best: null, status: 'suspected', rest: [] };
        const sameDay = top.distanceMs <= CONFIRMED_MAX_HOURS * 60 * 60_000;
        const status: CallReportLinkStatusCode =
            sameDay && (top.typeMatch || top.responsibleMatch)
                ? 'confirmed'
                : 'suspected';
        return {
            best: top.record,
            status,
            rest: ranked.slice(1).map(item => item.record),
        };
    }

    /** Момент события записи: поле event_date, иначе дата создания. */
    private eventTime(record: SalesListRecord): number | null {
        for (const raw of [record.eventDate, record.createdAt]) {
            if (!raw) continue;
            const time = new Date(raw).getTime();
            if (Number.isFinite(time)) return time;
        }
        return null;
    }

    private describe(link: CallReportListLink | undefined): string {
        return link ? `#${link.itemId} (${link.status})` : '—';
    }
}
