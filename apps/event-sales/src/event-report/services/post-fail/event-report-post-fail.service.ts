import { Logger } from '@nestjs/common';
import { BitrixService, IBXCompany } from '@/modules/bitrix';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { PBX_SALES_EVENT_FIELD_CODES } from '@lib/portal-lib/pbx';
import { EventReportContext } from '../context/event-report.context';
import { positiveId } from '../deal/deal-notice.util';

/**
 * Пост-отказ: дата следующего звонка после «Отказа» — В КОМПАНИЮ.
 *
 * Порт легаси `EventReportPostFailService.php` (gsirk): после отказа с датой
 * компания получала дату-время в «ОП Дата следующего звонка», ту же дату
 * текстом «ДД.ММ.ГГГГ» в старое строковое поле и нового ответственного
 * (Федонина Инна, 251) — чтобы отказник вернулся в обзвон к нужному человеку
 * в нужный день. Домен в легаси был прибит гвоздями; здесь всё из настроек
 * портала (`with_post_fail`, `post_fail_assign_user_id`,
 * `post_fail_company_date_text_field`), см. {@link EventPostFailSettings}.
 *
 * Условие запуска — как в легаси: отказ (не «не ЦА»), есть дата и тип
 * отказа, это не недозвон. Компании в контексте нет (лид, сделка без
 * компании) — писать некуда, молча пропускаем.
 *
 * Команда ставится в общий батч ПОСЛЕ update компании от entity-flow: там
 * финал обнуляет дату следующего звонка (final_fields_reset_enabled), а
 * здесь она должна остаться — Битрикс исполняет команды пачки по порядку,
 * поэтому побеждает эта.
 *
 * Не @Injectable: инстанс Битрикса домена приходит в конструктор.
 */
export class EventReportPostFailService {
    private readonly logger = new Logger(EventReportPostFailService.name);

    constructor(
        private readonly bitrix: BitrixService,
        private readonly portal: PortalModel,
    ) {}

    queue(ctx: EventReportContext): void {
        const settings = ctx.postFailSettings;
        if (!settings.enabled) return;
        if (!ctx.isFail || ctx.isNotCa || ctx.isNoCall) return;

        const postFailDate = ctx.dto.fail?.postFailDate?.trim();
        const failType = ctx.dto.report?.failType?.current?.code;
        if (!postFailDate || !failType) return;

        const companyId = positiveId(ctx.company?.ID);
        if (!companyId) {
            this.logger.log(
                `post-fail: ${ctx.domain} — компании в контексте нет, дата ${postFailDate} не записана`,
            );
            return;
        }

        const fields = this.buildFields(ctx, postFailDate, settings);
        if (!Object.keys(fields).length) return;

        this.bitrix.batch.company.update(
            `post_fail_company_${companyId}`,
            companyId,
            fields,
        );
        this.logger.log(
            `post-fail: ${ctx.domain} компания #${companyId} — дата ${postFailDate}` +
                (settings.assignUserId
                    ? `, ответственный → #${settings.assignUserId}`
                    : ''),
        );
    }

    private buildFields(
        ctx: EventReportContext,
        postFailDate: string,
        settings: EventReportContext['postFailSettings'],
    ): Partial<IBXCompany> {
        const fields: Partial<IBXCompany> = {};

        const dateField = this.portal.getEntityFieldByCode(
            'company',
            PBX_SALES_EVENT_FIELD_CODES.call_next_date,
        );
        if (dateField) {
            fields[this.portal.getFieldBitrixId(dateField)] =
                ctx.dateTime.crmDateTime(postFailDate);
        } else {
            this.logger.warn(
                `post-fail: ${ctx.domain} — поле «ОП Дата следующего звонка» у компании не установлено`,
            );
        }
        if (settings.companyDateTextField) {
            fields[settings.companyDateTextField] =
                ctx.dateTime.crmDate(postFailDate);
        }
        if (settings.assignUserId > 0) {
            fields.ASSIGNED_BY_ID = String(settings.assignUserId);
        }
        return fields;
    }
}
