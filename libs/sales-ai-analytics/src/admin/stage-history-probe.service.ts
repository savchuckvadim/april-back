/**
 * Проба истории стадий сделок портала (вопрос владельцу A6, 21.09.2026):
 * доступен ли REST-метод crm.stagehistory.list и на сколько месяцев вглубь
 * есть история. На этом методе стоит шаг StageHistoryStep AI-аналитики
 * (apps/kpi-report-sales, `domain/loaders/stage-history.loader.ts`): без
 * него путь сделки, ожидание от пайплайна и вероятностные рёбра воронки
 * штатно деградируют, и половина модели считается только на синтетике.
 *
 * Два запроса к порталу тем же методом и с тем же фильтром категории, что
 * у загрузчика: самая ранняя запись (order ID ASC, start -1 — без подсчёта
 * total) и объём за окно (start 0 — Bitrix отдаёт total в обёртке ответа).
 *
 * ⚠ `@Injectable` без bitrix-состояния: инстанс берётся на вызов через
 * `PBXService.init(domain)` и живёт только внутри метода (правила проекта).
 * ⚠ Любая ошибка Bitrix (нет прав/scope, метод недоступен, сеть) — это
 * результат пробы `available: false` с текстом ошибки, а не исключение:
 * владелец должен увидеть причину в ответе ручки, а не 500.
 */
import { Injectable, Logger } from '@nestjs/common';
import { PBXService } from '@lib/pbx/pbx.service';
import { BitrixOwnerTypeId } from '@lib/bitrix/domain/enums/bitrix-constants.enum';
import type {
    BxStageHistoryFilter,
    IBXStageHistoryItem,
} from '@lib/bitrix/domain/crm/stage-history/interface/bx-stage-history.interface';
import type { BxStageHistoryService } from '@lib/bitrix/domain/crm/stage-history/services/bx-stage-history.service';
import type { IPCategory } from '@lib/portal-lib/portal/interfaces/portal.interface';
import { PbxDealCategoryCodeEnum } from '@lib/portal-lib/portal/services/types/deals/portal.deal.type';
import { tenureMonthsBetween } from '../model/tenure-bands';

/** Проба смотрит историю стадий сделок — как и загрузчик AI-аналитики. */
const PROBE_ENTITY_TYPE_ID = BitrixOwnerTypeId.DEAL;

/** Пояснение к пробе, когда категория не настроена. */
const NO_CATEGORY_HINT =
    'категория sales_base не настроена — проба по всем воронкам';

/** Страница crm.stagehistory.list в обёртке библиотеки (result.items, total). */
type StageHistoryPage = Awaited<ReturnType<BxStageHistoryService['list']>>;

/** Объём за окно: total обёртки или размер первой страницы (нижняя граница). */
interface WindowCount {
    value: number;
    lowerBound: boolean;
}

/** Результат пробы истории стадий портала. */
export interface StageHistoryProbeResult {
    domain: string;
    /** Момент пробы, ISO (UTC). */
    checkedAt: string;
    /** Метод crm.stagehistory.list ответил без ошибки. */
    available: boolean;
    /** Текст ошибки Bitrix (нет прав/scope, сеть); null — ошибок нет. */
    error: string | null;
    /**
     * bitrixId категории sales_base, по которой сужена проба; null —
     * категория не настроена, проба по всем воронкам сделок.
     */
    categoryBitrixId: number | null;
    /** CREATED_TIME самой ранней записи истории; null — записей нет. */
    earliestAt: string | null;
    /** Полных месяцев от earliestAt до момента пробы; null — записей нет. */
    historyMonths: number | null;
    /** Переходов стадий за последние windowMonths месяцев; null — метод недоступен. */
    transitionsInWindow: number | null;
    /**
     * Bitrix не вернул total — transitionsInWindow равен размеру первой
     * страницы и является нижней границей.
     */
    countIsLowerBound: boolean;
    /** Окно пробы, месяцев. */
    windowMonths: number;
    /** История доступна и её глубина не меньше окна. */
    enough: boolean;
    /** Человекочитаемый вывод пробы. */
    hint: string;
}

@Injectable()
export class StageHistoryProbeService {
    private readonly logger = new Logger(StageHistoryProbeService.name);

    constructor(private readonly pbx: PBXService) {}

    /**
     * Проба по домену: доступность метода, самая ранняя запись, глубина в
     * полных месяцах и объём переходов за окно `windowMonths`. `now` —
     * момент пробы (в тестах фиксированный).
     */
    async probe(
        domain: string,
        windowMonths: number,
        now: Date = new Date(),
    ): Promise<StageHistoryProbeResult> {
        const checkedAt = now.toISOString();
        try {
            const { bitrix, PortalModel } = await this.pbx.init(domain);
            const categoryBitrixId = categoryBitrixIdOf(
                PortalModel.getDealCategoryByCode(
                    PbxDealCategoryCodeEnum.sales_base,
                ),
            );
            const filter = categoryFilterOf(categoryBitrixId);
            const earliest = await bitrix.stageHistory.list({
                entityTypeId: PROBE_ENTITY_TYPE_ID,
                select: ['ID', 'CREATED_TIME'],
                order: { ID: 'ASC' },
                start: -1,
                filter,
            });
            const window = await bitrix.stageHistory.list({
                entityTypeId: PROBE_ENTITY_TYPE_ID,
                select: ['ID'],
                filter: {
                    ...filter,
                    '>=CREATED_TIME': windowStartDay(now, windowMonths),
                },
                start: 0,
            });

            const earliestAt = earliestCreatedTimeOf(itemsOf(earliest));
            const historyMonths = historyMonthsOf(earliestAt, now);
            const count = windowCountOf(window);
            const enough =
                historyMonths !== null && historyMonths >= windowMonths;

            return {
                domain,
                checkedAt,
                available: true,
                error: null,
                categoryBitrixId,
                earliestAt,
                historyMonths,
                transitionsInWindow: count.value,
                countIsLowerBound: count.lowerBound,
                windowMonths,
                enough,
                hint: availableHint({
                    categoryBitrixId,
                    earliestAt,
                    historyMonths,
                    count,
                    windowMonths,
                }),
            };
        } catch (error) {
            const message = errorMessageOf(error);
            this.logger.warn(
                `Проба истории стадий не удалась (${domain}): ${message}`,
            );

            return {
                domain,
                checkedAt,
                available: false,
                error: message,
                categoryBitrixId: null,
                earliestAt: null,
                historyMonths: null,
                transitionsInWindow: null,
                countIsLowerBound: false,
                windowMonths,
                enough: false,
                hint: `метод недоступен: ${message}`,
            };
        }
    }
}

/** bitrixId категории портала числом; не настроена или пустая — null. */
function categoryBitrixIdOf(category: IPCategory | undefined): number | null {
    if (!category || typeof category.bitrixId !== 'string') return null;
    const raw = category.bitrixId.trim();
    if (raw === '') return null;
    const id = Number(raw);

    return Number.isFinite(id) ? id : null;
}

/** Фильтр воронки: без категории — пустой (все воронки сделок). */
function categoryFilterOf(
    categoryBitrixId: number | null,
): BxStageHistoryFilter {
    return categoryBitrixId === null ? {} : { CATEGORY_ID: categoryBitrixId };
}

/**
 * Начало окна днём 'YYYY-MM-DD' (UTC): момент пробы минус months месяцев,
 * число месяца то же (31-е в коротком месяце переезжает в начало
 * следующего — как в загрузчике). Bitrix принимает такой день в фильтре
 * '>=CREATED_TIME' — тем же форматом ходит загрузчик.
 */
function windowStartDay(now: Date, months: number): string {
    return dayOf(
        new Date(
            Date.UTC(
                now.getUTCFullYear(),
                now.getUTCMonth() - months,
                now.getUTCDate(),
            ),
        ),
    );
}

/** День ISO (UTC) без времени. */
function dayOf(date: Date): string {
    return date.toISOString().slice(0, 10);
}

/** Записи страницы; чужая форма ответа — пустой список. */
function itemsOf(page: StageHistoryPage): IBXStageHistoryItem[] {
    return page?.result?.items ?? [];
}

/** CREATED_TIME первой записи (самой ранней при order ID ASC). */
function earliestCreatedTimeOf(
    items: readonly IBXStageHistoryItem[],
): string | null {
    const at = items[0]?.CREATED_TIME;

    return at ? String(at) : null;
}

/**
 * Полных месяцев истории: от дня самой ранней записи до дня пробы (по
 * UTC), неполный месяц не засчитывается. Нечитаемая дата — null.
 */
function historyMonthsOf(earliestAt: string | null, now: Date): number | null {
    if (!earliestAt) return null;
    const since = new Date(earliestAt);
    if (Number.isNaN(since.getTime())) return null;

    return tenureMonthsBetween(dayOf(since), dayOf(now));
}

/** total обёртки ответа; его нет — размер страницы как нижняя граница. */
function windowCountOf(page: StageHistoryPage): WindowCount {
    const total = page?.total;
    if (typeof total === 'number' && Number.isFinite(total)) {
        return { value: total, lowerBound: false };
    }

    return { value: itemsOf(page).length, lowerBound: true };
}

/** Текст вывода при доступном методе. */
function availableHint(input: {
    categoryBitrixId: number | null;
    earliestAt: string | null;
    historyMonths: number | null;
    count: WindowCount;
    windowMonths: number;
}): string {
    const parts: string[] = [];
    if (input.earliestAt === null) {
        parts.push('метод доступен, история стадий пуста');
    } else {
        const depth =
            input.historyMonths === null
                ? 'глубина неизвестна (дата первой записи не читается)'
                : `глубина ${input.historyMonths} мес.`;
        const count = `${input.count.lowerBound ? 'не менее ' : ''}${input.count.value}`;
        parts.push(
            `история доступна, ${depth}, переходов за окно ${input.windowMonths} мес. — ${count}`,
        );
        if (
            input.historyMonths !== null &&
            input.historyMonths < input.windowMonths
        ) {
            parts.push(`глубина меньше окна ${input.windowMonths} мес.`);
        }
    }
    if (input.categoryBitrixId === null) parts.push(NO_CATEGORY_HINT);

    return parts.join('; ');
}

/** Текст ошибки любой формы (Error, строка, объект). */
function errorMessageOf(error: unknown): string {
    if (error instanceof Error) return error.message;

    return typeof error === 'string' ? error : JSON.stringify(error);
}
