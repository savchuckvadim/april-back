import { Injectable } from '@nestjs/common';
import { PBXService } from '@lib/pbx';
import { PbxDealCategoryCodeEnum } from '@lib/portal-lib/portal/services/types/deals/portal.deal.type';
import { DealSendPreflightResponseDto } from '../dto/deal-send.dto';
import { resolveCreateStageId } from '../lib/deal-create-stage.util';

/**
 * Поля, без которых сделка из конструктора выйдет неполной: поставщик
 * (ставится при создании), описание поставки для шаблонов, комплект, тип
 * договора.
 */
export const DEAL_SEND_PREFLIGHT_FIELD_CODES = [
    'document_provider',
    'offer_supply_q',
    'complect_name',
    'contract_type',
    'supply',
] as const;

/**
 * Готов ли портал к созданию сделки через Nest. Только чтение — ничего не
 * создаёт и не пишет; идёт тем же путём (pbx.init), что и сама запись.
 */
@Injectable()
export class DealSendPreflightUseCase {
    constructor(private readonly pbx: PBXService) {}

    async execute(domain: string): Promise<DealSendPreflightResponseDto> {
        const { PortalModel } = await this.pbx.init(domain);
        if (!PortalModel.getDeal()) {
            return {
                domain,
                ready: false,
                categoryId: null,
                createStageId: null,
                fields: [],
                problems: ['На портале нет pbx-схемы сделок'],
            };
        }

        const problems: string[] = [];
        const category = PortalModel.getDealCategoryByCode(
            PbxDealCategoryCodeEnum.sales_base,
        );
        if (!category) {
            problems.push(
                'Нет воронки sales_base — сделку создаст фронт по-старому',
            );
        }
        const createStageId = category ? resolveCreateStageId(category) : null;
        if (category && !createStageId) {
            problems.push(
                'В воронке sales_base нет стадии «Документы» (sales_offer_create) — сделка встанет на первую стадию',
            );
        }

        const dealFields = PortalModel.getDealFields();
        const fields = DEAL_SEND_PREFLIGHT_FIELD_CODES.map(code => {
            const portalField = dealFields.find(item => item.code === code);
            return {
                code,
                bitrixId: portalField
                    ? PortalModel.getFieldBitrixId(portalField)
                    : null,
            };
        });
        for (const field of fields) {
            if (!field.bitrixId) {
                problems.push(`Поля ${field.code} нет в pbx-схеме сделки`);
            }
        }

        return {
            domain,
            ready: Boolean(category),
            categoryId: category ? String(category.bitrixId) : null,
            createStageId,
            fields,
            problems,
        };
    }
}
