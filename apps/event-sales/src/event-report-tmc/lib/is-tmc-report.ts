import { TMC_DEPARTMENT_CODE } from '../../event-report/dto/event-sale-flow/department.dto';
import { EventSalesFlowDto } from '../../event-report/dto/event-sale-flow/event-sales-flow.dto';

/**
 * Отчёт пришёл из режима «Менеджер ТМЦ» — его ведёт поток ТМЦ
 * (EventReportTmcUseCase), а не отчёт отдела продаж.
 *
 * Единственный признак — подразделение в DTO: фрейм переключает его
 * тумблером режима (настройка `with_department_mode_toggle`), легаси-хук
 * выбирал сервис ровно по этому же полю (`departament.mode.code === 'tmc'`).
 */
export const isTmcReport = (
    dto: Pick<EventSalesFlowDto, 'departament'>,
): boolean => dto.departament?.mode?.code === TMC_DEPARTMENT_CODE;
