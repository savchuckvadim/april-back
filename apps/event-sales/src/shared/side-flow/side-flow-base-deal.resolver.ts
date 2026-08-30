import { Injectable, Logger } from '@nestjs/common';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { PbxDealCategoryCodeEnum } from '@lib/portal-lib/portal/services/types/deals/portal.deal.type';
import { FlowBitrix, SideFlowName, sideFlowLogTag } from './side-flow.types';

/**
 * Чем ищем базовую сделку. Не джоб целиком: у презентаций и ЗПР DTO
 * разные, а правилу дотяжки нужны ровно эти три поля — общий сервис не
 * должен знать ни один из двух форматов джоба.
 */
export interface SideFlowBaseDealQuery {
    /** Портал — только чтобы лог дотяжки читался человеком. */
    domain: string;
    /** Компания отчёта; пусто — искать не по чему. */
    companyId?: number | null;
    /** Ответственный отчёта; пусто (легаси-джоб) — фильтр «своих» выключен. */
    responsibleId?: number | null;
    /**
     * Кто дотягивает — только префикс лога. Пусто (легаси-вызов) — общий
     * `[side-flow]`; см. {@link sideFlowLogTag}: правило дотяжки от потока
     * не зависит, а вот строка «дотяжка не удалась» без имени потока не
     * говорит, чей отчёт остался без базовой сделки.
     */
    flow?: SideFlowName;
}

/** Строка `crm.deal.list` в объёме, который нужен дотяжке. */
interface BaseDealRow {
    ID?: unknown;
    ASSIGNED_BY_ID?: unknown;
}

/**
 * Дотяжка базовой сделки по компании для сайд-потоков.
 *
 * Зачем. Базовую сделку мог создать ЭТОТ ЖЕ отчёт — на момент постановки
 * джоба числового id не было (в батче она `$result[...]`). Джоб выполняется
 * после батча, сделка уже существует — находим её по компании и работаем
 * как с обычной.
 *
 * Правило одно на оба потока, поэтому и сервис один: раньше презентации и
 * ЗПР держали по своей копии, а расходились они только префиксом лога.
 *
 * `bitrix` приходит АРГУМЕНТОМ (правило CLAUDE.md про `this.bitrix` в
 * `@Injectable()` — инстанс привязан к домену портала).
 */
@Injectable()
export class SideFlowBaseDealResolver {
    private readonly logger = new Logger(SideFlowBaseDealResolver.name);

    /**
     * Свежая открытая сделка основной воронки по компании. Не нашли — не
     * страшно: элемент останется связан компанией/лидом, это честная
     * деградация, а не ошибка.
     *
     * Правило владельца (25.08): дотяжка не подхватывает ЧУЖИЕ открытые
     * сделки — только сделки ответственного этого отчёта (`responsibleId`
     * джоба), иначе элемент привязывался бы к сделке другого менеджера.
     * `ASSIGNED_BY_ID` сравнивается ЧИСЛОМ (REST отдаёт строки). Своих нет —
     * та же честная деградация (связь компанией/лидом). `responsibleId`
     * пуст (легаси-джоб) — фильтр выключен: некого считать «своим».
     */
    async resolve(
        bitrix: FlowBitrix,
        portal: PortalModel,
        query: SideFlowBaseDealQuery,
    ): Promise<number | null> {
        if (!query.companyId) return null;
        const category = portal.getDealCategoryByCode(
            PbxDealCategoryCodeEnum.sales_base,
        );
        if (!category) return null;
        try {
            const response = await bitrix.deal.getList(
                {
                    CATEGORY_ID: String(category.bitrixId),
                    COMPANY_ID: String(query.companyId),
                    CLOSED: 'N',
                } as never,
                ['ID', 'ASSIGNED_BY_ID'],
            );
            const rows = (response?.result ?? []) as BaseDealRow[];
            const own = query.responsibleId
                ? rows.filter(
                      row =>
                          Number(row?.ASSIGNED_BY_ID) ===
                          Number(query.responsibleId),
                  )
                : rows;
            const ids = own
                .map(row => Number(row?.ID))
                .filter(id => Number.isFinite(id) && id > 0);
            if (!ids.length) return null;
            // Из своих открытых берём самую свежую — id монотонен.
            const latest = Math.max(...ids);
            this.logger.log(
                `${sideFlowLogTag(query.flow)} ${query.domain}: базовая ` +
                    `сделка дотянута по компании ${query.companyId} → ${latest}`,
            );
            return latest;
        } catch (error) {
            this.logger.warn(
                `${sideFlowLogTag(query.flow)} дотяжка сделки по компании ` +
                    `${query.companyId} не удалась: ${(error as Error).message}`,
            );
            return null;
        }
    }
}
