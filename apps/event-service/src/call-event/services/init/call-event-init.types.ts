import { IBXCompany, IBXContact, IBXDeal, IBXItem } from '@/modules/bitrix';
import { IBXTask } from '@/modules/bitrix/domain/tasks/task/interface/task.interface';
import { IBXProductRowRow } from '@/modules/bitrix/domain/crm/product-row/interface/bx-product-row.interface';
import {
    IPBXList,
    IPSmart,
} from '@lib/portal-lib/portal/interfaces/portal.interface';

/**
 * Снимок всех сущностей Bitrix, загруженных init-сервисом одним проходом.
 * На нём дальше работают context + flow-сервисы обоих потоков (звонок + смарт-отчёт).
 *
 * Поля nullable там, где сущности может не быть на портале/в событии.
 */
export interface ICallEventInitContext {
    /** Компания (placement.options.ID / bx.companyId) */
    company: IBXCompany | null;

    /** Контакты компании */
    contacts: IBXContact[];

    /** Открытые задачи компании (для расчёта дат следующих звонков/обучений) */
    companyTasks: IBXTask[];

    /** Портальный список ОРК-история (`service_ork_history`) */
    orkHistoryList: IPBXList | null;

    /** Сырые элементы списка ОРК-история по компании (CO_<id>) */
    orkHistoryElements: Record<string, unknown>[];

    /** Смарт-процесс «Отчёт за месяц» (`service_month`) */
    smart: IPSmart | null;

    /** Уже существующие смарт-элементы месяца по компании и контактам */
    existingSmarts: IBXItem[];

    /** Базовая сервисная сделка (категория `service_base`) */
    baseDeal: IBXDeal | null;

    /** Товарные позиции базовой сделки */
    productRows: IBXProductRowRow[];
}
