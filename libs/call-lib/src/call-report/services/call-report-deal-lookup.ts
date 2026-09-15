import { Logger } from '@nestjs/common';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { PbxDealCategoryCodeEnum } from '@lib/portal-lib/portal/services/types/deals/portal.deal.type';
import { PBX_SALES_EVENT_FIELD_CODES } from '@lib/portal-lib/pbx';

/**
 * Минимальный контракт api-инстанса Битрикса: инстанс уже привязан к
 * домену портала и передаётся АРГУМЕНТОМ (правило CLAUDE.md про
 * `this.bitrix` в `@Injectable()`), поэтому класс не `@Injectable()`.
 */
export interface CallReportDealLookupApi {
    call(method: string, data: Record<string, unknown>): Promise<unknown>;
}

/** Строка сделки из Битрикса в объёме, который нужен раскладке связей. */
export type CallReportDealRow = Record<string, unknown>;

/**
 * Безопасная строка из значения Битрикса: строку/число берём как есть,
 * массив и объект дают пусто (а не «[object Object]») — поле могло
 * приехать множественным или структурой.
 */
export function callReportDealText(value: unknown): string {
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') {
        return String(value);
    }
    return '';
}

/**
 * Насколько связь доказана:
 * - exact — воронка сделки или явная crm-ссылка портала (факт);
 * - likely — у клиента ровно одна сделка нужной воронки (дотяжка);
 * - guess — сделок несколько, взята ближайшая по времени к звонку.
 */
export type CallReportDealLinkConfidence = 'exact' | 'likely' | 'guess';

/** Клиент звонка — по нему дотягивается сделка, если владелец не подошёл. */
export interface CallReportDealFamilyContext {
    companyId?: number;
    contactId?: number;
    /** Дата звонка — для выбора ближайшей сделки при нескольких кандидатах. */
    callStartedAt?: Date | null;
    /** Лид-владелец звонка — поиск элемента «ОП История» (шаг 0, §4). */
    leadId?: number;
    /** Владелец звонка и тип звонка — ранжирование записи отчётности. */
    callerId?: string | number | null;
    callType?: string | null;
}

/** Найденная сделка и то, чем она доказана. */
export interface CallReportDealMatch {
    id: number;
    deal: CallReportDealRow;
    confidence: CallReportDealLinkConfidence;
}

/** Воронки ОП, по которым раскладываются связи смарт-элемента. */
export const CALL_REPORT_DEAL_CATEGORY_CODES = [
    PbxDealCategoryCodeEnum.sales_base,
    PbxDealCategoryCodeEnum.sales_presentation,
    PbxDealCategoryCodeEnum.sales_xo,
] as const;

/**
 * Поля сделки для `crm.deal.list` в раскладке звонка: воронка, стадия,
 * закрытость, ответственный и даты. ЕДИНЫЙ набор для всех читателей сделок
 * звонка (раскладка связей, кандидаты агента) — расширять список надо здесь,
 * а не копией рядом: иначе один читатель видит поле, другой нет.
 */
export const CALL_REPORT_DEAL_SELECT = [
    'ID',
    'CATEGORY_ID',
    'STAGE_ID',
    'CLOSED',
    'ASSIGNED_BY_ID',
    'DATE_CREATE',
    'DATE_MODIFY',
] as const;

/**
 * Чтение и поиск сделок для раскладки связей звонка: проверка воронки
 * через PortalModel (никаких magic strings — ai/rules/pbx-typing.md),
 * дотяжка сделки по компании/контакту и поиск дочерней сделки.
 *
 * Fail-open: любая ошибка чтения даёт ПУСТОЙ результат (null/[]), а не
 * догадку — неверная связь хуже отсутствующей.
 */
export class CallReportDealLookup {
    constructor(
        private readonly api: CallReportDealLookupApi,
        private readonly portal: PortalModel,
        private readonly logger: Logger,
    ) {}

    /**
     * CATEGORY_ID воронки по pbx-коду. undefined — воронка на портале не
     * заведена (или слепок портала пуст): сравнивать НЕ с чем, и пустой
     * bitrixId не должен совпасть с воронкой по умолчанию (CATEGORY_ID=0),
     * поэтому сравнение строковое, а пустое значение отбрасывается.
     */
    categoryBitrixId(code: PbxDealCategoryCodeEnum): string | undefined {
        try {
            const raw = this.portal.getDealCategoryByCode(code)?.bitrixId;
            const value = raw === undefined || raw === null ? '' : String(raw);
            return value.length ? value : undefined;
        } catch {
            // Слепок портала без сделок — справочника воронок нет.
            return undefined;
        }
    }

    /**
     * pbx-код воронки сделки. undefined — воронка ЧУЖАЯ (не из трёх воронок
     * ОП) либо не заведена в pbx. «Чужая» и «основная» — разные исходы:
     * трактовать undefined как «основная» нельзя (прод-баг 08.09.2026).
     */
    categoryCodeOf(
        deal: CallReportDealRow,
    ): PbxDealCategoryCodeEnum | undefined {
        const categoryId = callReportDealText(deal['CATEGORY_ID']);
        if (!categoryId) return undefined;
        for (const code of CALL_REPORT_DEAL_CATEGORY_CODES) {
            if (this.categoryBitrixId(code) === categoryId) return code;
        }
        return undefined;
    }

    /** Сделка по id; null — не прочиталась (нет прав, удалена, ошибка). */
    async getDeal(dealId: number): Promise<CallReportDealRow | null> {
        try {
            const response = (await this.api.call('crm.deal.get', {
                id: dealId,
            })) as { result?: CallReportDealRow };
            return response?.result ?? null;
        } catch (error) {
            this.logger.warn(
                `Сделка ${dealId} не прочитана: ${(error as Error).message}`,
            );
            return null;
        }
    }

    /**
     * Значение crm-поля-ссылки НА СДЕЛКУ (`D_555` или голый `555`).
     *
     * Строго префикс сделки: `C_555`/`L_555`/`CO_555` — это контакт, лид и
     * компания, и принимать их как id сделки нельзя (иначе в связь уедет
     * сделка со случайно совпавшим номером).
     */
    dealRefField(
        deal: CallReportDealRow,
        fieldCode: string,
    ): number | undefined {
        const key = this.fieldKey(fieldCode);
        if (!key) return undefined;
        const raw = deal[key];
        const value: unknown = Array.isArray(raw) ? raw[0] : raw;
        if (typeof value !== 'string' && typeof value !== 'number') {
            return undefined;
        }
        const match = /^(?:D_)?(\d+)$/i.exec(String(value).trim());
        const id = match ? Number(match[1]) : 0;
        return id > 0 ? id : undefined;
    }

    /**
     * Сделки заданной воронки по фильтру (компания/контакт/uf-ссылка).
     * ЗАКРЫТЫЕ сделки НЕ отсекаются: целевая сделка живого случая стоит в
     * стадии «Не состоялась», фильтр «только открытые» её терял.
     */
    async listByCategory(
        code: PbxDealCategoryCodeEnum,
        filter: Record<string, unknown>,
    ): Promise<CallReportDealRow[]> {
        const categoryId = this.categoryBitrixId(code);
        if (!categoryId) return [];
        try {
            const response = (await this.api.call('crm.deal.list', {
                filter: { ...filter, CATEGORY_ID: categoryId },
                select: CALL_REPORT_DEAL_SELECT,
                order: { ID: 'DESC' },
            })) as { result?: CallReportDealRow[] };
            const rows = response?.result;
            // Воронку проверяем ещё раз по самой строке: фильтр Битрикса —
            // не доказательство, а в связь имеет право попасть только
            // сделка подтверждённой воронки.
            return Array.isArray(rows)
                ? rows.filter(
                      row =>
                          CallReportDealLookup.rowId(row) > 0 &&
                          callReportDealText(row['CATEGORY_ID']) === categoryId,
                  )
                : [];
        } catch (error) {
            this.logger.warn(
                `Поиск сделок воронки ${code} не выполнен: ${(error as Error).message}`,
            );
            return [];
        }
    }

    /**
     * Сделка воронки у КОМПАНИИ, иначе у КОНТАКТА звонка (одна подходящая —
     * likely, несколько — ближайшая к звонку с пометкой guess). Клиента не
     * знаем — искать не по чему.
     */
    async findByClient(
        code: PbxDealCategoryCodeEnum,
        context: CallReportDealFamilyContext,
    ): Promise<CallReportDealMatch | undefined> {
        const filters: Record<string, unknown>[] = [];
        if (context.companyId) {
            filters.push({ COMPANY_ID: String(context.companyId) });
        }
        if (context.contactId) {
            filters.push({ CONTACT_ID: String(context.contactId) });
        }
        for (const filter of filters) {
            const rows = await this.listByCategory(code, filter);
            const deal = this.pickNearest(rows, context);
            if (!deal) continue;
            return {
                id: CallReportDealLookup.rowId(deal),
                deal,
                confidence: rows.length === 1 ? 'likely' : 'guess',
            };
        }
        return undefined;
    }

    /**
     * Дочерняя сделка воронки, ссылающаяся на корень полем «Корневая сделка
     * Продажи» (обратный ход раскладки: звонят из основной сделки, а связать
     * надо презентационную).
     */
    async findChildOfRoot(
        code: PbxDealCategoryCodeEnum,
        rootDealId: number,
        context: CallReportDealFamilyContext,
    ): Promise<number | undefined> {
        const key = this.fieldKey(PBX_SALES_EVENT_FIELD_CODES.to_base_sales);
        if (!key) return undefined;
        // Значение crm-поля хранится с префиксом или без (зависит от набора
        // разрешённых сущностей поля) — ищем оба варианта.
        const rows = await this.listByCategory(code, {
            [key]: [String(rootDealId), `D_${rootDealId}`],
        });
        const deal = this.pickNearest(rows, context);
        return deal ? CallReportDealLookup.rowId(deal) : undefined;
    }

    /** Ключ поля в ответе Битрикса (UF_CRM_…) по pbx-коду поля сделки. */
    private fieldKey(fieldCode: string): string | undefined {
        try {
            const field = this.portal.getEntityFieldByCode('deal', fieldCode);
            return field ? this.portal.getFieldBitrixId(field) : undefined;
        } catch {
            return undefined;
        }
    }

    /** Единственная строка — она же; несколько — ближайшая к звонку. */
    private pickNearest(
        rows: CallReportDealRow[],
        context: CallReportDealFamilyContext,
    ): CallReportDealRow | undefined {
        if (!rows.length) return undefined;
        if (rows.length === 1) return rows[0];
        return CallReportDealLookup.nearestToCall(
            rows,
            context.callStartedAt ?? undefined,
        );
    }

    /** id сделки из строки списка; 0 — строка непригодна. */
    static rowId(deal: CallReportDealRow): number {
        const id = Number(deal['ID']);
        return Number.isFinite(id) && id > 0 ? id : 0;
    }

    /**
     * Ближайшая по времени к звонку сделка: сравниваем дату изменения (нет —
     * дату создания). При равенстве ближе открытая, затем — свежая по id.
     */
    static nearestToCall(
        deals: CallReportDealRow[],
        callStartedAt: Date | undefined,
    ): CallReportDealRow | undefined {
        const at = callStartedAt ? callStartedAt.getTime() : Date.now();
        const distance = (deal: CallReportDealRow): number => {
            const raw =
                callReportDealText(deal['DATE_MODIFY']) ||
                callReportDealText(deal['DATE_CREATE']);
            const time = raw ? Date.parse(raw) : NaN;
            return Number.isFinite(time)
                ? Math.abs(time - at)
                : Number.MAX_SAFE_INTEGER;
        };
        const closed = (deal: CallReportDealRow): number =>
            callReportDealText(deal['CLOSED']).toUpperCase() === 'Y' ? 1 : 0;
        return [...deals].sort((left, right) => {
            const byDistance = distance(left) - distance(right);
            if (byDistance !== 0) return byDistance;
            const byClosed = closed(left) - closed(right);
            if (byClosed !== 0) return byClosed;
            return (
                CallReportDealLookup.rowId(right) -
                CallReportDealLookup.rowId(left)
            );
        })[0];
    }
}
