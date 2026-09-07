import { IBXDeal } from '@/modules/bitrix';
import { IBXTask } from '@/modules/bitrix/domain/tasks/task';
import { PresentationSmartInfo } from '@lib/portal-lib/pbx/pbx-presentation-smart';
import { ZprSmartInfo } from '@lib/portal-lib/pbx/pbx-zpr-smart';

/** Сырой элемент смарта из crm.item (camel-ключи). */
export type SmartRow = Record<string, unknown>;

/**
 * Открытые элементы одного смарта у клиента. `info: null` — смарт на портале
 * не установлен, `rows` тогда пуст по построению; closer (шаг 5) по `info`
 * находит entityTypeId и закрывающую стадию.
 */
export interface ColdSmartRelations<Info> {
    info: Info | null;
    rows: SmartRow[];
}

/** Резолвы смартов на домен — обработчик получает их через DI один раз на окно тишины. */
export interface ColdSmartInfos {
    pres: PresentationSmartInfo | null;
    zpr: ZprSmartInfo | null;
}

/**
 * Всё, что у клиента ОТКРЫТО и относится к продажам — то, что холодный
 * старт закрывает (force=Y / полный старт) или проверяет на «чужую работу»
 * (force=N). Только чтение: сборщик ничего не меняет.
 */
export interface ColdRelations {
    /** Открытые сделки четырёх воронок (ОП основная/ХО/презентации, ТМЦ). */
    deals: IBXDeal[];
    /** Подмножество `deals` — открытые ОСНОВНЫЕ (sales_base): решение по force. */
    openBaseDeals: IBXDeal[];
    /** id всех сделок, от которых собраны задачи и элементы (входная + граф). */
    dealIds: number[];
    /** Лиды клиента: `LEAD_ID` и поля-ссылки входной сделки. */
    leadIds: number[];
    /** Открытые задачи группы обзвона, привязанные к компании/сделкам/лидам. */
    tasks: IBXTask[];
    pres: ColdSmartRelations<PresentationSmartInfo>;
    zpr: ColdSmartRelations<ZprSmartInfo>;
}
