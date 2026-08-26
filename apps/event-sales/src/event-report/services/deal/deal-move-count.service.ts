import { Logger } from '@nestjs/common';
import { BitrixService, IBXDeal } from '@/modules/bitrix';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { PBX_SALES_EVENT_FIELD_CODES } from '@lib/portal-lib/pbx';
import { EventReportContext } from '../context/event-report.context';
import { isColdEventType } from '../../types/event-report.event-codes';

/**
 * Счётчик переносов события — поле сделки `op_move_count`
 * («ОП Количество переносов», todo2508-02 №6).
 *
 * Пишется ТОЛЬКО в ветке переноса (`ctx.isExpired`): менеджер нажал
 * «Не очень» и назначил новую дату — событие уехало, факт фиксируем на
 * сделке, по которой идёт работа:
 *  - холодный контекст (тип события отчёта/плана — xo/заявка/лид) →
 *    ТЕКУЩАЯ ХО-сделка;
 *  - остальные типы → текущая ОСНОВНАЯ сделка.
 *
 * Значение — «текущее из слепка + 1»: init-фаза читает поле в общем select
 * (`DEAL_ACCUMULATED_FIELD_CODES`), сюда сделка приезжает уже со счётчиком.
 * Отдельной batch-командой, а не полем в update воронки: стадийные update'ы
 * гейтятся расчётом target-стадии и не обязаны случаться при переносе, а
 * счётчик обязан — иначе часть переносов молча терялась бы.
 *
 * Смарты Презентаций/ЗПР считают переносы в своих side-flow — здесь ТОЛЬКО
 * сделки. Поле не установлено на портале — graceful-пропуск (как всюду в
 * event-report).
 */
export class DealMoveCountService {
    private readonly logger = new Logger(DealMoveCountService.name);

    constructor(
        private readonly bitrix: BitrixService,
        private readonly portal: PortalModel,
    ) {}

    queue(ctx: EventReportContext): void {
        if (!ctx.isExpired) return;

        const deal = this.resolveTargetDeal(ctx);
        if (!deal) return;

        const field = this.portal.getEntityFieldByCode(
            'deal',
            PBX_SALES_EVENT_FIELD_CODES.op_move_count,
        );
        if (!field) return;

        const key = this.portal.getFieldBitrixId(field);
        const current =
            Number((deal as unknown as Record<string, unknown>)[key]) || 0;

        this.bitrix.batch.deal.update(
            `move_count_deal_${deal.ID}`,
            Number(deal.ID),
            { [key]: String(current + 1) } as Partial<IBXDeal>,
        );
    }

    /**
     * Сделка-носитель счётчика; null — инкрементировать нечего (перенос из
     * чистого лида, либо нужной сделки у клиента нет — новую ради счётчика
     * не заводим, и чужую воронку холодным переносом не трогаем).
     */
    private resolveTargetDeal(ctx: EventReportContext): IBXDeal | null {
        // Тип берём из отчёта (переносимая задача), план — фолбэк: при
        // переносе тип обычно не перевыбирают (см. ctx.isExpired).
        const isColdContext =
            isColdEventType(ctx.reportEventType) ||
            isColdEventType(ctx.planEventType);
        return isColdContext ? ctx.currentXoDeal : ctx.currentBaseDeal;
    }
}
