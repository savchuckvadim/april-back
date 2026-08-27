import { Injectable, Logger } from '@nestjs/common';
import { PBXService } from '@lib/pbx/pbx.service';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { PbxDealCategoryCodeEnum } from '@lib/portal-lib/portal/services/types/deals/portal.deal.type';
import { PBX_SALES_EVENT_FIELD_CODES } from '@lib/portal-lib/pbx';
import { parseCrmRefId } from '@lib/bitrix/domain/crm/utils/crm-ref-format.util';

/** Раскладка сделок звонка по воронкам. */
export interface CallReportDealFamily {
    /** Корневая сделка продажи — «ОП: основная сделка». */
    mainDealId?: number;
    /** Сделка воронки «ОП Презентации». */
    presentationDealId?: number;
    /** Сделка воронки «ОП ХО». */
    xoDealId?: number;
}

/**
 * Определение «семьи сделок» по владельцу звонка.
 *
 * ЗАЧЕМ (прод-запрос 27.08.2026): звонят обычно из карточки дочерней
 * сделки — например, из «ОП Презентации». Нативная связь смарта покажет
 * именно её (это владелец активности, факт CRM), а поле «ОП: основная
 * сделка» должно указывать на КОРНЕВУЮ сделку продажи. Связь между ними
 * уже есть на портале: crm-поле сделки «Корневая сделка Продажи»
 * (`to_base_sales`).
 *
 * Логика:
 * - у сделки заполнена корневая → она и есть main, а сама сделка
 *   раскладывается по своей воронке (презентация/ХО);
 * - корневой нет → сделка сама корневая (main), если её воронка —
 *   «ОП Основная»; иначе кладём её в свою воронку и main оставляем пустым
 *   (выдумывать связь нельзя).
 *
 * Fail-open: любая ошибка чтения → пустая раскладка, звонок обрабатывается
 * дальше (связи дольются повторным прогоном).
 */
@Injectable()
export class CallReportDealFamilyService {
    private readonly logger = new Logger(CallReportDealFamilyService.name);

    constructor(private readonly pbxService: PBXService) {}

    /**
     * @param domain портал
     * @param dealId сделка-владелец звонка
     */
    async resolve(
        domain: string,
        dealId: number | undefined,
    ): Promise<CallReportDealFamily> {
        if (!dealId) return {};
        try {
            const { bitrix, PortalModel: portal } =
                await this.pbxService.init(domain);
            const response = (await bitrix.api.call('crm.deal.get', {
                id: dealId,
            })) as { result?: Record<string, unknown> };
            const deal = response?.result;
            if (!deal) return { mainDealId: dealId };

            const rootDealId = this.readRootDealId(portal, deal);
            const categoryCode = this.resolveCategoryCode(portal, deal);

            // Сделка-владелец раскладывается по СВОЕЙ воронке.
            const family: CallReportDealFamily = {};
            if (categoryCode === PbxDealCategoryCodeEnum.sales_presentation) {
                family.presentationDealId = dealId;
            } else if (categoryCode === PbxDealCategoryCodeEnum.sales_xo) {
                family.xoDealId = dealId;
            }

            if (rootDealId) {
                family.mainDealId = rootDealId;
            } else if (
                categoryCode === PbxDealCategoryCodeEnum.sales_base ||
                categoryCode === undefined
            ) {
                // Воронка основная (или не распознана) и корневой ссылки
                // нет — сделка сама является корневой.
                family.mainDealId = dealId;
            }
            this.logger.log(
                `Сделки звонка (${domain}, сделка ${dealId}): основная ` +
                    `${family.mainDealId ?? '—'}, презентация ` +
                    `${family.presentationDealId ?? '—'}, ХО ${family.xoDealId ?? '—'}`,
            );
            return family;
        } catch (error) {
            this.logger.warn(
                `Раскладка сделок не определена (${domain}, сделка ${dealId}): ` +
                    (error as Error).message,
            );
            return { mainDealId: dealId };
        }
    }

    /** Значение поля «Корневая сделка Продажи» (crm-поле, id или D_id). */
    private readRootDealId(
        portal: PortalModel,
        deal: Record<string, unknown>,
    ): number | undefined {
        try {
            const field = portal.getEntityFieldByCode(
                'deal',
                PBX_SALES_EVENT_FIELD_CODES.to_base_sales,
            );
            if (!field) return undefined;
            const raw = deal[portal.getFieldBitrixId(field)];
            // crm-поле может прийти массивом (множественное) или скаляром,
            // с префиксом «D_» или без — parseCrmRefId понимает оба формата.
            const value: unknown = Array.isArray(raw) ? raw[0] : raw;
            return parseCrmRefId(value) ?? undefined;
        } catch {
            return undefined;
        }
    }

    /** Код воронки сделки по её CATEGORY_ID. */
    private resolveCategoryCode(
        portal: PortalModel,
        deal: Record<string, unknown>,
    ): PbxDealCategoryCodeEnum | undefined {
        const categoryId = Number(deal['CATEGORY_ID']);
        if (!Number.isFinite(categoryId)) return undefined;
        const codes = [
            PbxDealCategoryCodeEnum.sales_base,
            PbxDealCategoryCodeEnum.sales_presentation,
            PbxDealCategoryCodeEnum.sales_xo,
        ];
        for (const code of codes) {
            const category = portal.getDealCategoryByCode(code);
            if (category && Number(category.bitrixId) === categoryId) {
                return code;
            }
        }
        return undefined;
    }
}
