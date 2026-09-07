import { IBXCompany, IBXDeal } from '@/modules/bitrix';
import { IColdCallData } from '../../type/cold-hook-silence.interface';

/**
 * Корень холодного старта: от него собираются связи (шаг 3 плана v2) и на
 * нём создаётся новая холодная работа.
 *  - `company` — у клиента есть компания (вход-компания либо вход-сделка с
 *    `COMPANY_ID`): корень компания, как в v1;
 *  - `deal` — вход-сделка без компании: корень сама сделка (её основная
 *    `sales_base`, если она на неё ссылается).
 */
export type ColdTargetKind = 'company' | 'deal';

export interface ColdTarget {
    /** Ключ хука в silence-коллекции — цель возвращается к хуку без матчей по id. */
    hookKey: string;
    hook: IColdCallData;
    kind: ColdTargetKind;
    /** Компания-корень; у `deal` — null. */
    company: IBXCompany | null;
    companyId: number | null;
    /** Входная сделка хука; у входа-компании — null. */
    entryDeal: IBXDeal | null;
    /**
     * Корневая основная сделка ОП: `to_base_sales` входной сделки, либо она
     * сама, если стоит в `sales_base`; null — ссылки нет и сделка не основная
     * (например, презентационная без корня). Считается для любой входной
     * сделки — режим `yield` (шаг 5) закрывает «входную и её связи».
     */
    rootDealId: number | null;
}
