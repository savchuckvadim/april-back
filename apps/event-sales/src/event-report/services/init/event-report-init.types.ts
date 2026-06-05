import { IBXCompany, IBXContact, IBXDeal, IBXLead } from '@/modules/bitrix';
import { IBXTask } from '@/modules/bitrix/domain/tasks/task/interface/task.interface';

/**
 * Тип сущности-«хозяина» события.
 * Определяется по `placement` (CALL_CARD → company/lead, LEAD_* → lead, иначе company).
 */
export type EventReportEntityType = 'company' | 'lead';

/**
 * Снимок всех нужных flow-сервисам Bitrix-сущностей, загруженных одним init-batch'ем.
 *
 * Все поля кроме `entityId`/`entityType` — nullable: соответствующих сущностей
 * на портале/в задаче может не быть.
 */
export interface IEventReportInitContext {
    /** ID компании или лида, на которого идёт отчёт */
    entityId: number;
    entityType: EventReportEntityType;

    company: IBXCompany | null;
    lead: IBXLead | null;

    /** Базовая сделка ОП (категория sales_base), активная (≠ WON/LOSE) */
    currentBaseDeal: IBXDeal | null;

    /** Холодная сделка (sales_xo), активная */
    currentXoDeal: IBXDeal | null;

    /** Сделка-презентация (sales_presentation), связанная с currentTask */
    currentPresDeal: IBXDeal | null;

    /** TMC-сделка (tmc_base), связанная с currentTask */
    currentTmcDeal: IBXDeal | null;

    /**
     * TMC-сделка, связанная с currentPresDeal через UF_CRM_TO_PRESENTATION_SALES.
     * Используется при report=presentation для синхронизации TMC-воронки.
     */
    currentTmcFromPresentation: IBXDeal | null;

    /** Задача, по которой отчитывается менеджер (если есть) */
    currentTask: IBXTask | null;

    /** Контакт-плательщик из DTO (для связи в сделках/задачах) */
    reportContact: IBXContact | null;
    planContact: IBXContact | null;
}
