import { Injectable, Logger } from '@nestjs/common';
import { PBXService } from '@/modules/pbx/pbx.service';
import { BitrixService, IBXDeal } from '@/modules/bitrix';
import { IBitrixBatchResponseResult } from '@/modules/bitrix/core/interface/bitrix-api-http.intterface';
import { parseCrmRefId } from '@lib/bitrix/domain/crm/utils/crm-ref-format.util';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import {
    IField,
    IPBXList,
} from '@lib/portal-lib/portal/interfaces/portal.interface';
import { PbxDealCategoryCodeEnum } from '@lib/portal-lib/portal/services/types/deals/portal.deal.type';
import { PBX_SALES_EVENT_FIELD_CODES } from '@lib/portal-lib/pbx';
import { SALES_LIST_CODES } from '@lib/portal-lib/pbx/pbx-sales-list-reader';
import {
    EnumSalesKpiEventAction,
    EnumSalesKpiEventType,
    EnumSalesKpiOpResultStatus,
} from '@lib/portal-lib/pbx/pbx-sales-kpi-list/type/pbx-sales-kpi-list.enum';
import { findBatchResult } from '../../shared/bitrix/prepare-batch-results.util';
import { CallResultsDto, ResultCountRequestDto } from '../dto/result-count.dto';
import {
    TmcDealFoundDto,
    TmcDealsRequestDto,
    TmcTaskRefDto,
} from '../dto/tmc-deals.dto';
import { EventSupportStubService } from './event-support-stub.service';
import {
    CompanyDealsRequestDto,
    CompanyDealsResponseDto,
} from '../dto/deals.dto';
import {
    NewTaskInitRequestDto,
    NewTaskInitResponseDto,
} from '../dto/new-task.dto';
import { CompanyHistoryRequestDto, HistoryItemDto } from '../dto/history.dto';

/** Ключи счётчиков в batch-пачке (один запрос списка на счётчик). */
const COUNT_KEYS = {
    result: 'result',
    noresult: 'noresult',
    presentation: 'pres',
    inProgress: 'prog',
    inMoney: 'money',
} as const;

const EMPTY_COUNTS: CallResultsDto = {
    noresultCount: 0,
    resultCount: 0,
    presentationCount: 0,
    inProgressCount: 0,
    inMoneyCount: 0,
};

/**
 * Поддерживающие ручки фрейма «Звонки» — порт легаси PHP.
 *
 * Реализованы те, без которых не работают недозвон и возврат в ТМЦ:
 *  - `pres/tmc-deals` (легаси `full/pres/tmcdeals`): по презентационным
 *    задачам найти их ТМЦ-сделку — через сделку «ОП Презентации» из привязок
 *    задачи и её поле «Корневая сделка ТМЦ» (pbx `to_base_tmc`);
 *  - `result/count` (легаси `flow-front/result/count`): счётчики результатов
 *    сотрудника по компании из списка «ОП История» — результативные,
 *    недозвоны, презентации, «в решении», «в оплате».
 * Остальные ручки пока отдают заглушки ({@link EventSupportStubService}).
 *
 * `@Injectable`, но инстанс Битрикса в поля не кладём — берём его у
 * PBXService на каждый вызов (CLAUDE.md: иначе гонка между порталами).
 */
@Injectable()
export class EventSupportService {
    private readonly logger = new Logger(EventSupportService.name);

    constructor(
        private readonly pbx: PBXService,
        private readonly stub: EventSupportStubService,
    ) {}

    getCompanyDeals(
        dto: CompanyDealsRequestDto,
    ): Promise<CompanyDealsResponseDto> {
        return this.stub.getCompanyDeals(dto);
    }

    initNewTask(dto: NewTaskInitRequestDto): Promise<NewTaskInitResponseDto> {
        return this.stub.initNewTask(dto);
    }

    getCompanyHistory(
        dto: CompanyHistoryRequestDto,
    ): Promise<HistoryItemDto[]> {
        return this.stub.getCompanyHistory(dto);
    }

    /**
     * ТМЦ-сделки для кнопки «в ТМ». Возвращаются только задачи, у которых
     * ТМЦ-сделка нашлась: фронт показывает кнопку по наличию записи.
     */
    async getTmcDeals(dto: TmcDealsRequestDto): Promise<TmcDealFoundDto[]> {
        const tasks = (dto.tasks ?? []).filter(task => Number(task.id) > 0);
        if (!tasks.length) return [];
        const { bitrix, PortalModel: portal } = await this.pbx.init(dto.domain);

        const presCategory = portal.getDealCategoryByCode(
            PbxDealCategoryCodeEnum.sales_presentation,
        );
        const tmcLinkField = portal.getEntityFieldByCode(
            'deal',
            PBX_SALES_EVENT_FIELD_CODES.to_base_tmc,
        );
        if (!presCategory || !tmcLinkField) {
            this.logger.warn(
                `tmc-deals: ${dto.domain} — нет воронки «ОП Презентации» или поля «Корневая сделка ТМЦ», ТМЦ не ищем`,
            );
            return [];
        }
        const tmcLinkKey = portal.getFieldBitrixId(tmcLinkField);

        const taskDeals = await this.readTaskDeals(bitrix, tasks);
        const presByTask = new Map<number, IBXDeal>();
        const tmcIds = new Set<number>();
        for (const task of tasks) {
            const pres = (taskDeals.get(Number(task.id)) ?? []).find(
                deal =>
                    String(deal.CATEGORY_ID) === String(presCategory.bitrixId),
            );
            const tmcId = pres ? parseCrmRefId(pres[tmcLinkKey]) : null;
            if (!pres || !tmcId) continue;
            presByTask.set(Number(task.id), pres);
            tmcIds.add(tmcId);
        }
        if (!tmcIds.size) return [];

        const tmcDeals = await this.readDeals(bitrix, [...tmcIds], 'tmc');
        const found: TmcDealFoundDto[] = [];
        for (const [taskId, pres] of presByTask) {
            const tmcDeal = tmcDeals.get(parseCrmRefId(pres[tmcLinkKey]) ?? 0);
            if (!tmcDeal) continue;
            found.push({ taskId, tmcDeal, presDeal: pres });
        }
        this.logger.log(
            `tmc-deals: ${dto.domain} — задач ${tasks.length}, с ТМЦ-сделкой ${found.length}`,
        );
        return found;
    }

    /** Сделки из привязок задач (`D_*`), одной пачкой; по задачам. */
    private async readTaskDeals(
        bitrix: BitrixService,
        tasks: TmcTaskRefDto[],
    ): Promise<Map<number, IBXDeal[]>> {
        const dealIdsByTask = new Map<number, number[]>();
        const allIds = new Set<number>();
        for (const task of tasks) {
            const ids = (task.ufCrmTask ?? [])
                .filter(link => link.startsWith('D_'))
                .map(link => parseCrmRefId(link))
                .filter((id): id is number => id !== null);
            dealIdsByTask.set(Number(task.id), ids);
            ids.forEach(id => allIds.add(id));
        }
        const deals = await this.readDeals(bitrix, [...allIds], 'task');
        const result = new Map<number, IBXDeal[]>();
        for (const [taskId, ids] of dealIdsByTask) {
            result.set(
                taskId,
                ids
                    .map(id => deals.get(id))
                    .filter((deal): deal is IBXDeal => Boolean(deal)),
            );
        }
        return result;
    }

    /** `crm.deal.get` по списку id одной пачкой; удалённые пропускаются. */
    private async readDeals(
        bitrix: BitrixService,
        ids: number[],
        prefix: string,
    ): Promise<Map<number, IBXDeal>> {
        const result = new Map<number, IBXDeal>();
        if (!ids.length) return result;
        for (const id of ids) {
            bitrix.batch.deal.get(`${prefix}_deal_${id}`, id);
        }
        const chunks = await bitrix.api.callBatchWithConcurrency(1);
        for (const id of ids) {
            const deal = findBatchResult<IBXDeal>(
                chunks,
                `${prefix}_deal_${id}`,
            );
            if (deal?.ID) result.set(id, deal);
        }
        return result;
    }

    /**
     * Счётчики результатов по компании и сотруднику из списка «ОП История»
     * (легаси `HistoryController::getNoresultCount`, дословно те же фильтры).
     * Список или его поля не установлены — нули, фрейм показывает пустые
     * бейджи, как раньше при ошибке.
     */
    async getResultCount(dto: ResultCountRequestDto): Promise<CallResultsDto> {
        const { bitrix, PortalModel: portal } = await this.pbx.init(dto.domain);
        const list = portal.getListByCode(SALES_LIST_CODES.history);
        if (!list?.bitrixId) {
            this.logger.warn(
                `result/count: ${dto.domain} — список «ОП История» не установлен`,
            );
            return EMPTY_COUNTS;
        }
        const filters = this.buildCountFilters(portal, list, dto);
        if (!filters) return EMPTY_COUNTS;

        for (const [key, filter] of Object.entries(filters)) {
            bitrix.batch.listItem.get(key, {
                IBLOCK_ID: String(list.bitrixId),
                filter,
                select: ['ID'],
            });
        }
        const chunks = await bitrix.api.callBatchWithConcurrency(1);
        return {
            resultCount: this.countOf(chunks, COUNT_KEYS.result),
            noresultCount: this.countOf(chunks, COUNT_KEYS.noresult),
            presentationCount: this.countOf(chunks, COUNT_KEYS.presentation),
            inProgressCount: this.countOf(chunks, COUNT_KEYS.inProgress),
            inMoneyCount: this.countOf(chunks, COUNT_KEYS.inMoney),
        };
    }

    /**
     * Пять фильтров легаси: компания + ответственный, результат «да» и
     * действие «состоялось» (+ тип события для презентаций / «в решении» /
     * «в оплате»); недозвоны — результат «нет». Нет нужного поля или
     * варианта — null (счётчики нулевые).
     */
    private buildCountFilters(
        portal: PortalModel,
        list: IPBXList,
        dto: ResultCountRequestDto,
    ): Record<string, Record<string, unknown>> | null {
        const field = (code: string): IField | undefined =>
            portal.getIdByCodeFieldList(list, code);
        const crm = field('crm');
        const responsible = field('responsible');
        const action = field('event_action');
        const eventType = field('event_type');
        const resultStatus = field('op_result_status');
        const itemId = (
            source: IField | undefined,
            code: string,
        ): string | number | undefined =>
            source?.items?.find(item => item.code === code)?.bitrixId;

        const doneId = itemId(action, EnumSalesKpiEventAction.done);
        const resultYesId = itemId(
            resultStatus,
            EnumSalesKpiOpResultStatus.op_call_result_yes,
        );
        const resultNoId = itemId(
            resultStatus,
            EnumSalesKpiOpResultStatus.op_call_result_no,
        );
        if (
            !crm ||
            !responsible ||
            !action ||
            !eventType ||
            !resultStatus ||
            doneId === undefined ||
            resultYesId === undefined ||
            resultNoId === undefined
        ) {
            this.logger.warn(
                `result/count: ${dto.domain} — в списке «ОП История» нет нужных полей или вариантов`,
            );
            return null;
        }
        const key = (source: IField): string =>
            source.bitrixCamelId || source.bitrixId;
        const base: Record<string, unknown> = {
            [key(crm)]: `%CO_${dto.companyId}%`,
            [key(responsible)]: dto.userId,
        };
        const done: Record<string, unknown> = {
            ...base,
            [key(resultStatus)]: resultYesId,
            [key(action)]: doneId,
        };
        const withType = (code: EnumSalesKpiEventType) => {
            const id = itemId(eventType, code);
            return id === undefined ? null : { ...done, [key(eventType)]: id };
        };
        const filters: Record<string, Record<string, unknown>> = {
            [COUNT_KEYS.result]: done,
            [COUNT_KEYS.noresult]: { ...base, [key(resultStatus)]: resultNoId },
        };
        const typed: [string, EnumSalesKpiEventType][] = [
            [COUNT_KEYS.presentation, EnumSalesKpiEventType.presentation],
            [COUNT_KEYS.inProgress, EnumSalesKpiEventType.call_in_progress],
            [COUNT_KEYS.inMoney, EnumSalesKpiEventType.call_in_money],
        ];
        for (const [countKey, code] of typed) {
            const filter = withType(code);
            if (filter) filters[countKey] = filter;
        }
        return filters;
    }

    /** Число записей команды: `result_total`, иначе длина страницы (как легаси). */
    private countOf(chunks: IBitrixBatchResponseResult[], key: string): number {
        for (const chunk of chunks) {
            // В типе ответа result_total описан массивом, Битрикс отдаёт
            // словарь «ключ команды → total» — читаем через unknown.
            const totals = chunk?.result_total as unknown;
            const total =
                totals && typeof totals === 'object' && !Array.isArray(totals)
                    ? Number((totals as Record<string, unknown>)[key])
                    : NaN;
            if (Number.isFinite(total) && total > 0) return total;
        }
        const rows = findBatchResult<unknown[]>(chunks, key);
        return Array.isArray(rows) ? rows.length : 0;
    }
}
