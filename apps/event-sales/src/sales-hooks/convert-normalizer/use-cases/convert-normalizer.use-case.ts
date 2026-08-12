import { Injectable, Logger } from '@nestjs/common';
import { getErrorDetails } from '@/shared';
import { PBX_SALES_EVENT_FIELD_CODES } from '@lib/portal-lib/pbx';
import { mergeTaskCrmBindings } from '@/modules/bitrix/domain/tasks/task/lib/task-crm-binding.util';
import { EnumSalesHookCode } from '../../core/constants/sales-hook-code.enum';
import {
    ISalesHookUseCase,
    SalesHookExecutionContext,
} from '../../core/contracts/sales-hook-use-case.contract';
import {
    ConvertNormalizerItemResultDto,
    ConvertNormalizerResultDto,
    IConvertNormalizerItem,
} from '../dto/convert-normalizer.dto';

type BxRow = Record<string, unknown>;

/**
 * Self-healing графа связей при ручной конвертации лида.
 *
 * Ситуация: менеджер сконвертировал лид штатно, мимо нашего хука. Битрикс
 * создал сделку с LEAD_ID, но наши рёбра (deal_from_lead_id /
 * deal_joined_leads / to_base_sales лида) пусты — граф неполон.
 *
 * Нормализация (идемпотентна — повтор ничего не меняет):
 *  - deal_from_lead_id := L_{LEAD_ID}, deal_joined_leads ∪= L_{LEAD_ID};
 *  - лид получает to_base_sales := D_{dealId}, если он был пуст;
 *  - если у лида УЖЕ была ДРУГАЯ наша сделка — это дубль от конвертации:
 *    в warnings уходит merge-кандидат (кнопка руководителю).
 * Read-path related устойчив и без нормализации (union по LEAD_ID) —
 * этот хук чинит write-path, чтобы merge/история видели полный граф.
 */
@Injectable()
export class ConvertNormalizerUseCase
    implements
        ISalesHookUseCase<IConvertNormalizerItem, ConvertNormalizerResultDto>
{
    readonly hook = EnumSalesHookCode.CONVERT_NORMALIZER;
    private readonly logger = new Logger(ConvertNormalizerUseCase.name);

    async execute(
        ctx: SalesHookExecutionContext,
        items: IConvertNormalizerItem[],
    ): Promise<ConvertNormalizerResultDto> {
        const results: ConvertNormalizerItemResultDto[] = [];
        for (const item of items) {
            try {
                results.push(await this.normalizeOne(ctx, item.dealId));
            } catch (error) {
                const { message } = getErrorDetails(error);
                results.push({
                    dealId: item.dealId,
                    healed: false,
                    leadId: null,
                    warnings: [`Ошибка: ${message}`],
                });
            }
        }
        await ctx.buffer.flush();

        const healed = results.filter(result => result.healed).length;
        return {
            implemented: true,
            items: results,
            message: `Проверено сделок: ${results.length}, дописан граф: ${healed}.`,
        };
    }

    private async normalizeOne(
        ctx: SalesHookExecutionContext,
        dealId: number,
    ): Promise<ConvertNormalizerItemResultDto> {
        const warnings: string[] = [];
        const dealResponse = await ctx.bitrix.deal.get(dealId);
        const deal = dealResponse?.result as BxRow | undefined;
        if (!deal) {
            throw new Error(`Сделка ${dealId} не найдена`);
        }

        const leadId = this.numberOf(deal.LEAD_ID);
        if (!leadId) {
            // Сделка не из конвертации — нормализовать нечего.
            return { dealId, healed: false, leadId: null, warnings };
        }

        const fromLeadName = this.dealFieldName(
            ctx,
            PBX_SALES_EVENT_FIELD_CODES.deal_from_lead_id,
        );
        const joinedName = this.dealFieldName(
            ctx,
            PBX_SALES_EVENT_FIELD_CODES.deal_joined_leads,
        );

        const hasFromLead = !!this.refOf(fromLeadName && deal[fromLeadName]);
        const joined = this.refListOf(joinedName && deal[joinedName]);
        const hasJoined = joined.includes(`L_${leadId}`);

        const dealFields: BxRow = {};
        if (fromLeadName && !hasFromLead) {
            dealFields[fromLeadName] = `L_${leadId}`;
        }
        if (joinedName && !hasJoined) {
            dealFields[joinedName] = mergeTaskCrmBindings(joined, [
                `L_${leadId}`,
            ]);
        }
        if (Object.keys(dealFields).length) {
            ctx.buffer.queue(() =>
                ctx.bitrix.batch.deal.update(
                    `cn_deal_${dealId}`,
                    dealId,
                    dealFields as never,
                ),
            );
        }

        // Обратное ребро лида + детект дубля от конвертации.
        const leadResponse = await ctx.bitrix.lead.get(leadId);
        const lead = leadResponse?.result as BxRow | undefined;
        if (lead) {
            const toBaseField = ctx.portal.getEntityFieldByCode(
                'lead',
                PBX_SALES_EVENT_FIELD_CODES.to_base_sales,
            );
            if (toBaseField) {
                const ufName = ctx.portal.getFieldBitrixId(toBaseField);
                // to_base_sales — crm-поле с единственным типом (only_deals):
                // Битрикс хранит в нём ГОЛЫЙ id, значение `D_123` молча
                // отбрасывает. Сравнение — по числу, чтобы понять и старые
                // значения с префиксом.
                const existingId = this.dealIdOf(lead[ufName]);
                if (!existingId) {
                    ctx.buffer.queue(() =>
                        ctx.bitrix.batch.lead.update(
                            `cn_lead_${leadId}`,
                            leadId,
                            { [ufName]: String(dealId) } as never,
                        ),
                    );
                } else if (existingId !== dealId) {
                    warnings.push(
                        `У лида ${leadId} уже есть наша сделка ${existingId} — сделка ${dealId} от ручной конвертации похожа на дубль, кандидат на merge`,
                    );
                }
            }
        }

        await ctx.buffer.endGroup();
        const healed = Object.keys(dealFields).length > 0;
        if (healed) {
            this.logger.log(
                `convert-normalizer: сделка ${dealId} дописана (лид ${leadId})`,
            );
        }
        return { dealId, healed, leadId, warnings };
    }

    private dealFieldName(
        ctx: SalesHookExecutionContext,
        code: string,
    ): string | null {
        const field = ctx.portal.getEntityFieldByCode('deal', code);
        return field ? ctx.portal.getFieldBitrixId(field) : null;
    }

    private numberOf(raw: unknown): number | null {
        const value = Number(raw);
        return Number.isFinite(value) && value > 0 ? value : null;
    }

    /** id сделки из значения связи: понимает и `123`, и legacy `D_123`. */
    private dealIdOf(raw: unknown): number | null {
        const ref = this.refOf(raw);
        if (!ref) return null;
        const match = /^(?:D_)?(\d+)$/.exec(ref);
        return match ? Number(match[1]) : null;
    }

    private refOf(raw: unknown): string | null {
        if (raw == null || raw === false) return null;
        const first = Array.isArray(raw) ? (raw as unknown[])[0] : raw;
        if (typeof first === 'string') return first.trim() || null;
        if (typeof first === 'number') return String(first);
        return null;
    }

    private refListOf(raw: unknown): string[] {
        if (raw == null || raw === false) return [];
        const items = Array.isArray(raw) ? raw : [raw];
        return items
            .map(value =>
                typeof value === 'string' || typeof value === 'number'
                    ? String(value).trim()
                    : '',
            )
            .filter(Boolean);
    }
}
