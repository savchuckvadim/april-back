import { Logger } from '@nestjs/common';
import { BitrixService } from '@lib/bitrix';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { PbxDealCategoryCodeEnum } from '@lib/portal-lib/portal/services/types/deals/portal.deal.type';
import {
    SALES_LIST_CODES,
    SalesListQuery,
    SalesListReaderService,
    SalesListRecord,
} from '@lib/portal-lib/pbx/pbx-sales-list-reader';
import { callOpHistoryOfEntity } from './call-op-history.util';
import {
    CallReportDealLookup,
    CallReportDealRow,
} from './call-report-deal-lookup';
import {
    buildCallCrmRefs,
    CALL_LIST_CANDIDATES_LIMIT,
    CALL_LIST_MAX_RECORD_DEALS,
    CALL_LIST_WINDOW_DAYS,
    callMoment,
    CallReportListFamily,
    CallReportListPick,
    CallReportListSearch,
    CallReportListSearchInput,
    emptyCallListSearch,
    parseCrmRef,
    rankCallListRecords,
} from './call-report-list-truth.types';

/** Сделка записи с уже прочитанной строкой. */
interface ClassifiedDeal {
    id: number;
    row: CallReportDealRow;
}

const DAY_MS = 24 * 60 * 60_000;

/**
 * «ОП История» как ИСТОЧНИК ИСТИНЫ для связей звонка (§4 прод-фиксов,
 * знание владельца 08.09.2026).
 *
 * При работе через приложение звонок ВСЕГДА попадает в список «ОП История»
 * (иногда — ещё и в «ОП KPI»), а у элемента есть МНОЖЕСТВЕННОЕ crm-поле, где
 * разом перечислена вся семья потока: сделка «ОП Основная», презентационная
 * сделка, лид, контакт, компания. Значит связь надо читать В ОБРАТНУЮ
 * СТОРОНУ: сначала находим элемент ЭТОГО звонка, потом берём семью из его
 * crm-поля. Дотяжка по компании и контакту (CallReportDealFamilyService,
 * шаги 2–3) остаётся запасным путём.
 *
 * ИНВАРИАНТ КАЧЕСТВА ДАННЫХ: двух сделок «ОП Основная» в одном элементе не
 * бывает. Нашли две — это ошибка разметки: пишем предупреждение и
 * оставляем связь по этой воронке ПУСТОЙ (молча выбирать одну из двух
 * нельзя). То же для презентационной и ХО.
 *
 * НЕ @Injectable: создаётся `new` рядом с BitrixService и PortalModel
 * конкретного портала (правило CLAUDE.md про race condition инстансов
 * битрикса). Полностью fail-open: любая ошибка чтения → пустой результат.
 */
export class CallReportListTruthService {
    private readonly reader: SalesListReaderService;
    private readonly lookup: CallReportDealLookup;

    constructor(
        bitrix: BitrixService,
        private readonly portal: PortalModel,
        private readonly logger: Logger = new Logger(
            CallReportListTruthService.name,
        ),
    ) {
        this.reader = new SalesListReaderService(bitrix, portal);
        this.lookup = new CallReportDealLookup(bitrix.api, portal, this.logger);
    }

    /**
     * Семья сущностей звонка из записи отчётности: поиск записи → разбор
     * crm-поля. null — записи нет (работают запасные пути раскладки).
     */
    async resolve(
        input: CallReportListSearchInput,
    ): Promise<CallReportListFamily | null> {
        const search = await this.search(input);
        // «ОП История» пишется всегда, «ОП KPI» — не по каждому событию,
        // поэтому история старше (§4, порядок источников).
        const record = search.history?.record ?? search.kpi?.record;
        if (!record) return null;
        return this.familyOf(record);
    }

    /**
     * Записи отчётности ЭТОГО звонка в обоих списках: окно ±3 дня вокруг
     * звонка по ссылкам самого звонка (сущность-владелец, компания,
     * контакт). Тот же поиск использует привязка записей к смарт-элементу —
     * второй реализации быть не должно.
     */
    async search(
        input: CallReportListSearchInput,
    ): Promise<CallReportListSearch> {
        const crmRefs = buildCallCrmRefs(input);
        const callAt = callMoment(input.callStartedAt);
        if (!crmRefs.length || callAt === null) {
            return emptyCallListSearch(crmRefs);
        }
        try {
            const query: SalesListQuery = {
                crmRefs,
                dateFrom: new Date(callAt - CALL_LIST_WINDOW_DAYS * DAY_MS),
                dateTo: new Date(callAt + CALL_LIST_WINDOW_DAYS * DAY_MS),
                limit: CALL_LIST_CANDIDATES_LIMIT,
            };
            const [kpi, history] = await Promise.all([
                this.reader.read(SALES_LIST_CODES.kpi, query),
                this.reader.read(SALES_LIST_CODES.history, query),
            ]);
            const crmSet = new Set(crmRefs);
            const rank = (records: SalesListRecord[]) =>
                rankCallListRecords({
                    records,
                    crmRefs: crmSet,
                    callAt,
                    callerId: input.callerId,
                    callType: input.callType,
                });
            const kpiRank = rank(kpi);
            const historyRank = rank(history);
            const chosen = new Set(
                [kpiRank.best?.id, historyRank.best?.id].filter(Boolean),
            );
            return {
                crmRefs,
                kpi: pickOf(kpiRank),
                history: pickOf(historyRank),
                rest: [...kpiRank.rest, ...historyRank.rest].filter(
                    record => !chosen.has(record.id),
                ),
                counts: { kpi: kpi.length, history: history.length },
            };
        } catch (error) {
            this.logger.warn(
                `Записи отчётности не прочитаны (${crmRefs.join(',')}): ` +
                    (error as Error).message,
            );
            return emptyCallListSearch(crmRefs);
        }
    }

    /**
     * Разбор crm-поля записи в семью сущностей: сделки раскладываются по
     * воронкам ЧТЕНИЕМ карточки и сверкой с PortalModel (никаких догадок по
     * номеру), лид/компания/контакт берутся как есть.
     */
    async familyOf(record: SalesListRecord): Promise<CallReportListFamily> {
        const family: CallReportListFamily = {
            recordId: record.id,
            listCode: record.listCode,
            conflicts: [],
        };
        const dealIds: number[] = [];
        for (const raw of record.crmRefs) {
            const ref = parseCrmRef(raw);
            if (!ref) continue;
            if (ref.type === 'DEAL') {
                if (!dealIds.includes(ref.id)) dealIds.push(ref.id);
            } else if (ref.type === 'LEAD') {
                family.leadId ??= ref.id;
            } else if (ref.type === 'COMPANY') {
                family.companyId ??= ref.id;
            } else if (ref.type === 'CONTACT') {
                family.contactId ??= ref.id;
            }
        }
        if (!dealIds.length) {
            // crm-поле пустое или без сделок — деградация без падения:
            // раскладку доберут запасные пути.
            return family;
        }
        const byCategory = await this.classify(
            dealIds.slice(0, CALL_LIST_MAX_RECORD_DEALS),
        );
        const main = this.single(
            family,
            byCategory,
            PbxDealCategoryCodeEnum.sales_base,
        );
        if (main) {
            family.mainDealId = main.id;
            family.mainDeal = main.row;
        }
        const presentation = this.single(
            family,
            byCategory,
            PbxDealCategoryCodeEnum.sales_presentation,
        );
        if (presentation) family.presentationDealId = presentation.id;
        const xo = this.single(
            family,
            byCategory,
            PbxDealCategoryCodeEnum.sales_xo,
        );
        if (xo) family.xoDealId = xo.id;
        this.logCardHistory(family);
        return family;
    }

    /**
     * Перекрёстная проверка: короткая история в карточке самой сделки
     * (`op_history` / `op_mhistory`). Источником истины она НЕ является —
     * это дешёвый контекст «как к сделке пришли», который приезжает тем же
     * чтением карточки и помогает разбирать спорные связи по логам.
     */
    private logCardHistory(family: CallReportListFamily): void {
        if (!family.mainDeal) return;
        const history = callOpHistoryOfEntity(
            this.portal,
            'deal',
            family.mainDeal,
        );
        if (!history.length) return;
        this.logger.log(
            `Запись ${family.listCode} #${family.recordId} → основная сделка ` +
                `${family.mainDealId}; «ОП История» карточки: ` +
                history.join(' | '),
        );
    }

    /** Сделки записи по воронкам ОП; нечитаемые и чужие отбрасываются. */
    private async classify(
        dealIds: readonly number[],
    ): Promise<Map<PbxDealCategoryCodeEnum, ClassifiedDeal[]>> {
        const byCategory = new Map<PbxDealCategoryCodeEnum, ClassifiedDeal[]>();
        const rows = await Promise.all(
            dealIds.map(id => this.lookup.getDeal(id)),
        );
        rows.forEach((row, index) => {
            if (!row) return;
            const code = this.lookup.categoryCodeOf(row);
            if (!code) return;
            const bucket = byCategory.get(code) ?? [];
            bucket.push({ id: dealIds[index], row });
            byCategory.set(code, bucket);
        });
        return byCategory;
    }

    /**
     * Единственная сделка воронки в записи. Две и больше — нарушение
     * инварианта: предупреждение в лог, конфликт в результат, связь пустая.
     */
    private single(
        family: CallReportListFamily,
        byCategory: Map<PbxDealCategoryCodeEnum, ClassifiedDeal[]>,
        code: PbxDealCategoryCodeEnum,
    ): ClassifiedDeal | undefined {
        const deals = byCategory.get(code) ?? [];
        if (deals.length <= 1) return deals[0];
        const dealIds = deals.map(deal => deal.id);
        family.conflicts.push({ category: code, dealIds });
        this.logger.warn(
            `Элемент ${family.listCode} #${family.recordId}: сделок воронки ` +
                `${code} несколько (${dealIds.join(', ')}) — разметка ` +
                'противоречива, связь по этой воронке оставлена ПУСТОЙ',
        );
        return undefined;
    }
}

function pickOf(rank: {
    best: SalesListRecord | null;
    status: CallReportListPick['status'];
}): CallReportListPick | null {
    return rank.best ? { record: rank.best, status: rank.status } : null;
}
