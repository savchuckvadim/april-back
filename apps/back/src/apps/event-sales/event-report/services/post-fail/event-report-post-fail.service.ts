import { Logger } from '@nestjs/common';
import { BitrixService } from '@/modules/bitrix';
import { PortalModel } from '@lib/portal/services/portal.model';
import { EventReportContext } from '../context/event-report.context';

/**
 * Пост-обработка отказа — только для портала gsirk.
 *
 * Логика legacy `EventReportPostFailService.php`: добавить элемент в список
 * `post_fail` (или соответствующий смарт-процесс) с указанием даты и причины.
 * Здесь — заглушка-каркас: запрашивает список через portal.getListByCode
 * (если оно есть) и пишет запись.
 *
 * TODO(event-report): полная portfolio-логика отказов — выделить в отдельный
 * PR после ревизии конфигурации gsirk portal (требуется уточнить список / smart).
 */
export class EventReportPostFailService {
    private readonly logger = new Logger(EventReportPostFailService.name);

    constructor(
        private readonly bitrix: BitrixService,
        private readonly portal: PortalModel,
    ) {}

    queue(ctx: EventReportContext): void {
        if (!ctx.isGsirk) return;
        if (!ctx.isFail) return;
        const failType = ctx.dto.report?.failType?.current?.code;
        const postFailDate = ctx.dto.fail?.postFailDate;
        if (!failType || !postFailDate) return;

        // На gsirk список post_fail может быть не зарегистрирован в PortalModel —
        // в таком случае мягко пропускаем (legacy ведёт себя так же).
        // Если список появится — раскомментировать ниже и подобрать FIELDS.
        this.logger.log(
            `post-fail queued (gsirk): failType=${failType}, postFailDate=${postFailDate}`,
        );
        // TODO(event-report): list.add(post_fail) когда подтвердим schema.
        void this.bitrix;
        void this.portal;
    }
}
