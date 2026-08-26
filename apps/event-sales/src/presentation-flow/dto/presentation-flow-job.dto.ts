import { PresentationOutcome } from '../lib/presentation-outcome';
import { PresentationSurveySnapshot } from '../lib/presentation-survey-snapshot';

/**
 * Джоб сайд-очереди презентаций (EVENT_SALES_PRESENTATION_FLOW).
 *
 * Основной event-report кладёт сюда МИНИМАЛЬНЫЙ снимок контекста и отвечает
 * «предварительно готово» — элемент смарта «Презентации» доезжает асинхронно
 * и не удлиняет основной flow (та же схема, что у ЗПР).
 *
 * Сделки «ОП Презентации» этот джоб НЕ трогает: они двигаются основным flow
 * как раньше, смарт живёт параллельно.
 */
export interface PresentationFlowJobData {
    domain: string;
    /** operationId основного отчёта — для трассировки в логах. */
    operationId?: string;
    /**
     * Сокет клиента, отправившего отчёт: по завершении джоба туда уходит
     * `presentation-flow:done`. Точечная доставка по socketId, НЕ по userId —
     * id юзера уникален только в рамках портала.
     */
    socketId?: string;
    /**
     * `plan` — менеджер запланировал презентацию (создать элемент в
     * «Запланирована»); `report` — отчитался по презентации (закрыть или
     * перенести элемент; не нашли — создать спонтанный сразу с исходом).
     */
    kind: 'plan' | 'report';
    /** Исход отчёта (kind='report'); для плана не заполняется. */
    outcome: PresentationOutcome | null;
    /** Встреча состоялась — разводит отказ на «отказ» и «не состоялась». */
    isResult: boolean;
    /**
     * Презентация была СПОНТАННОЙ (незапланированной): плана не было, либо
     * отчёт пришёл не по презентационной задаче. Такой отчёт не закрывает
     * чужой открытый элемент — он фиксирует НОВУЮ презентацию сразу фактом
     * (ровно как unplanned pres-сделка в основном flow).
     */
    isSpontaneous: boolean;
    /**
     * Задача, по которой отчитались: элемент смарта привязывается к ней в
     * UF_CRM_TASK (`T{hex}_{id}`) по завершении report-джоба (зеркало
     * zpr-flow; план-задача — `$result`, получит привязку при закрытии).
     */
    taskId?: number | null;
    /** id базовой сделки; null — сделка создаётся этим же отчётом/лид-only. */
    baseDealId: number | null;
    /** Сделка воронки «ОП Презентации» — зеркальная ссылка на элемент. */
    presDealId: number | null;
    companyId: number | null;
    leadId: number | null;
    contactId: number | null;
    /** Кто проводит/провёл презентацию. */
    responsibleId: number;
    /** Кто назначил презентацию (лидоген ≠ менеджер). */
    planResponsibleId: number;
    /** Дедлайн плана, DD.MM.YYYY HH:mm:ss локали портала. */
    planDeadline: string | null;
    planName: string | null;
    /** Комментарий менеджера на момент планирования. */
    planComment: string | null;
    /** Комментарий отчёта (kind='report'). */
    reportComment: string | null;
    /** Снимок анкеты «5К»/«Хвост» на момент отчёта (kind='report'). */
    survey: PresentationSurveySnapshot;
}
