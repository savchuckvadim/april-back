import { Logger } from '@nestjs/common';
import { PbxDealCategoryCodeEnum } from '@lib/portal-lib/portal/services/types/deals/portal.deal.type';
import { PBX_SALES_EVENT_FIELD_CODES } from '@lib/portal-lib/pbx';
import {
    CallReportDealFamilyContext,
    CallReportDealLookup,
    CallReportDealRow,
} from './call-report-deal-lookup';
import { CallReportDealFamily } from './call-report-deal-family.types';

/**
 * Долив ДОЧЕРНИХ сделок корня (презентация, ХО) — отдельная
 * ответственность от выбора самого корня.
 *
 * Источники по порядку: прямые crm-поля корня «Сделка Презентации
 * Продажи» / «Сделка ХО Продажи», а если они пусты — обратная ссылка
 * дочерней сделки на корень (`to_base_sales`). Так презентационная сделка
 * находится и когда звонок сделан ИЗ основной сделки (жалоба владельца
 * 08.09.2026), а не только когда владелец звонка — сама презентация.
 *
 * Уже заполненные связи (например взятые из элемента «ОП История») не
 * трогаются: запись списка — источник истины §4, и перебивать её поиском
 * нельзя. НЕ @Injectable: создаётся рядом с lookup конкретного портала.
 */
export class CallReportDealChildren {
    constructor(
        private readonly lookup: CallReportDealLookup,
        private readonly logger: Logger,
    ) {}

    async fill(
        family: CallReportDealFamily,
        mainRow: CallReportDealRow,
        context: CallReportDealFamilyContext,
    ): Promise<void> {
        if (!family.presentationDealId) {
            const found = await this.resolve(
                mainRow,
                PbxDealCategoryCodeEnum.sales_presentation,
                PBX_SALES_EVENT_FIELD_CODES.to_presentation_sales,
                family.mainDealId,
                context,
            );
            if (found) {
                family.presentationDealId = found;
                family.presentationConfidence = 'exact';
            }
        }
        if (!family.xoDealId) {
            const found = await this.resolve(
                mainRow,
                PbxDealCategoryCodeEnum.sales_xo,
                PBX_SALES_EVENT_FIELD_CODES.to_xo_sales,
                family.mainDealId,
                context,
            );
            if (found) family.xoDealId = found;
        }
    }

    /** Дочерняя сделка воронки: прямая ссылка корня, затем обратная. */
    private async resolve(
        mainRow: CallReportDealRow,
        code: PbxDealCategoryCodeEnum,
        fieldCode: string,
        mainDealId: number | undefined,
        context: CallReportDealFamilyContext,
    ): Promise<number | undefined> {
        const linked = this.lookup.dealRefField(mainRow, fieldCode);
        if (linked) {
            const deal = await this.lookup.getDeal(linked);
            if (deal && this.lookup.categoryCodeOf(deal) === code)
                return linked;
            this.logger.warn(
                `Ссылка на дочернюю сделку ${linked} не ведёт в воронку ` +
                    `${code} — отброшена`,
            );
        }
        if (!mainDealId) return undefined;
        return this.lookup.findChildOfRoot(code, mainDealId, context);
    }
}
