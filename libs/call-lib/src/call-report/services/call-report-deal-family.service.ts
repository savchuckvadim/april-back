import { Injectable, Logger } from '@nestjs/common';
import { PBXService } from '@lib/pbx/pbx.service';
import { PbxDealCategoryCodeEnum } from '@lib/portal-lib/portal/services/types/deals/portal.deal.type';
import { PBX_SALES_EVENT_FIELD_CODES } from '@lib/portal-lib/pbx';
import {
    callReportDealText,
    CallReportDealFamilyContext,
    CallReportDealLinkConfidence,
    CallReportDealLookup,
    CallReportDealRow,
} from './call-report-deal-lookup';

export {
    CallReportDealFamilyContext,
    CallReportDealLinkConfidence,
} from './call-report-deal-lookup';

/** Раскладка сделок звонка по воронкам. */
export interface CallReportDealFamily {
    /** Корневая сделка продажи — «ОП: основная сделка». */
    mainDealId?: number;
    /** Сделка воронки «ОП Презентации». */
    presentationDealId?: number;
    /** Сделка воронки «ОП ХО». */
    xoDealId?: number;
    /** Чем доказана основная связь; пусто — связи нет. */
    mainConfidence?: CallReportDealLinkConfidence;
    /** Чем доказана связь презентации; пусто — связи нет. */
    presentationConfidence?: CallReportDealLinkConfidence;
    /** Воронка сделки-владельца звонка; undefined — чужая или не заведена. */
    ownerCategoryCode?: PbxDealCategoryCodeEnum;
    /** Раскладку построить не удалось (ошибка чтения, нет справочника). */
    unresolved?: boolean;
}

/**
 * Определение «семьи сделок» по владельцу звонка.
 *
 * ЗАЧЕМ (прод-запрос 27.08.2026): звонят обычно из карточки дочерней
 * сделки — например, из «ОП Презентации». Нативная связь смарта покажет
 * именно её (это владелец активности, факт CRM), а поле «ОП: основная
 * сделка» должно указывать на КОРНЕВУЮ сделку продажи.
 *
 * ЖЁСТКОЕ ПРАВИЛО (прод-баг 08.09.2026, alfacentr): в «ОП: основная сделка»
 * попадает ТОЛЬКО сделка воронки «ОП Основная», подтверждённая через
 * PortalModel. Чужая воронка, нераспознанная воронка, ошибка чтения, нет
 * прав, удалённая сделка → связь ПУСТАЯ. Раньше все эти исходы давали
 * `mainDealId = dealId`, и в отчётность уезжали сделки чужих воронок
 * (вместе с их ответственным).
 *
 * Порядок определения корня:
 * 1. сама сделка стоит в «ОП Основная» — она и есть корень (ссылку
 *    `to_base_sales` игнорируем: стоящая в воронке сделка корень по
 *    определению, ошибочная ссылка не должна её переписывать);
 * 2. иначе — crm-поле «Корневая сделка Продажи», ПРОВЕРЕННОЕ чтением той
 *    сделки: не в основной воронке → ссылка отбрасывается;
 * 3. иначе — дотяжка по компании и контакту звонка, ВКЛЮЧАЯ ЗАКРЫТЫЕ
 *    сделки (целевая сделка живого случая стоит в «Не состоялась»);
 * 4. не нашли — пусто. Выдумывать связь нельзя.
 *
 * Дочерние связи (презентация/ХО) доливаются от корня: прямое crm-поле
 * корня, иначе обратная ссылка дочерней сделки на корень. Поэтому звонок
 * ИЗ основной сделки тоже получает связь с презентационной сделкой.
 *
 * Fail-open: любая ошибка чтения → пустая раскладка, звонок обрабатывается
 * дальше (связи дольются повторным прогоном / ночной ревизией).
 */
@Injectable()
export class CallReportDealFamilyService {
    private readonly logger = new Logger(CallReportDealFamilyService.name);

    constructor(private readonly pbxService: PBXService) {}

    /**
     * @param domain портал
     * @param dealId сделка-владелец звонка (пусто — звонок по лиду/клиенту)
     * @param context компания/контакт/дата звонка для дотяжки
     */
    async resolve(
        domain: string,
        dealId: number | undefined,
        context: CallReportDealFamilyContext = {},
    ): Promise<CallReportDealFamily> {
        if (!dealId && !context.companyId && !context.contactId) return {};
        try {
            const { bitrix, PortalModel: portal } =
                await this.pbxService.init(domain);
            const lookup = new CallReportDealLookup(
                bitrix.api,
                portal,
                this.logger,
            );
            if (!lookup.categoryBitrixId(PbxDealCategoryCodeEnum.sales_base)) {
                this.logger.warn(
                    `Воронка «ОП Основная» не заведена в pbx (${domain}) — ` +
                        'связи сделок не ставим',
                );
                return { unresolved: true };
            }

            const family = await this.build(lookup, dealId, context);
            this.logger.log(
                `Сделки звонка (${domain}, сделка ${dealId ?? '—'}): основная ` +
                    `${family.mainDealId ?? '—'} (${family.mainConfidence ?? 'нет'}), ` +
                    `презентация ${family.presentationDealId ?? '—'}, ` +
                    `ХО ${family.xoDealId ?? '—'}` +
                    (family.unresolved ? ', раскладка неполная' : ''),
            );
            return family;
        } catch (error) {
            // Fail-open — но БЕЗ подстановки сделки: неверная связь хуже
            // отсутствующей, повторный прогон дольёт её.
            this.logger.warn(
                `Раскладка сделок не определена (${domain}, сделка ` +
                    `${dealId ?? '—'}): ${(error as Error).message}`,
            );
            return { unresolved: true };
        }
    }

    /** Сборка раскладки: владелец → корень → дотяжка → дочерние. */
    private async build(
        lookup: CallReportDealLookup,
        dealId: number | undefined,
        context: CallReportDealFamilyContext,
    ): Promise<CallReportDealFamily> {
        const owner = dealId ? await lookup.getDeal(dealId) : null;
        if (dealId && !owner) {
            // Сделка не прочиталась (нет прав/удалена) — воронку проверить
            // нечем, значит связей не ставим вовсе.
            this.logger.warn(
                `Сделка ${dealId} не прочитана — связи сделок оставлены пустыми`,
            );
            return { unresolved: true };
        }

        const family: CallReportDealFamily = {};
        let mainRow: CallReportDealRow | null = null;
        if (owner && dealId) {
            mainRow = this.fillFromOwner(lookup, family, owner, dealId);
            if (!family.mainDealId) {
                mainRow = await this.fromRootLink(lookup, family, owner);
            }
        }
        if (!family.mainDealId) {
            mainRow = await this.fromClient(lookup, family, context);
        }
        if (mainRow) await this.fillChildren(lookup, family, mainRow, context);
        return family;
    }

    /** Раскладка самой сделки-владельца по её воронке. */
    private fillFromOwner(
        lookup: CallReportDealLookup,
        family: CallReportDealFamily,
        owner: CallReportDealRow,
        dealId: number,
    ): CallReportDealRow | null {
        const code = lookup.categoryCodeOf(owner);
        family.ownerCategoryCode = code;
        if (code === PbxDealCategoryCodeEnum.sales_presentation) {
            family.presentationDealId = dealId;
            family.presentationConfidence = 'exact';
        } else if (code === PbxDealCategoryCodeEnum.sales_xo) {
            family.xoDealId = dealId;
        } else if (code === PbxDealCategoryCodeEnum.sales_base) {
            family.mainDealId = dealId;
            family.mainConfidence = 'exact';
            return owner;
        } else {
            this.logger.warn(
                `Сделка ${dealId}: воронка ` +
                    `${callReportDealText(owner['CATEGORY_ID']) || '—'} ` +
                    'не из воронок ОП — в «основную сделку» не пойдёт',
            );
        }
        return null;
    }

    /** Корень из crm-поля «Корневая сделка Продажи», проверенный чтением. */
    private async fromRootLink(
        lookup: CallReportDealLookup,
        family: CallReportDealFamily,
        owner: CallReportDealRow,
    ): Promise<CallReportDealRow | null> {
        const rootId = lookup.dealRefField(
            owner,
            PBX_SALES_EVENT_FIELD_CODES.to_base_sales,
        );
        if (!rootId) return null;
        const root = await lookup.getDeal(rootId);
        if (
            !root ||
            lookup.categoryCodeOf(root) !== PbxDealCategoryCodeEnum.sales_base
        ) {
            this.logger.warn(
                `«Корневая сделка Продажи» ${rootId} не в воронке «ОП Основная» ` +
                    '(или не прочитана) — ссылка отброшена',
            );
            return null;
        }
        family.mainDealId = rootId;
        family.mainConfidence = 'exact';
        return root;
    }

    /**
     * Дотяжка основной сделки по компании и контакту звонка — ВКЛЮЧАЯ
     * закрытые: сделка живого случая стоит в стадии «Не состоялась».
     */
    private async fromClient(
        lookup: CallReportDealLookup,
        family: CallReportDealFamily,
        context: CallReportDealFamilyContext,
    ): Promise<CallReportDealRow | null> {
        const found = await lookup.findByClient(
            PbxDealCategoryCodeEnum.sales_base,
            context,
        );
        if (!found) return null;
        family.mainDealId = found.id;
        family.mainConfidence = found.confidence;
        this.logger.log(
            'Основная сделка дотянута по клиенту (компания ' +
                `${context.companyId ?? '—'}, контакт ${context.contactId ?? '—'}) ` +
                `→ ${found.id} (${found.confidence})`,
        );
        return found.deal;
    }

    /**
     * Дочерние сделки корня: прямые crm-поля «Сделка Презентации Продажи» /
     * «Сделка ХО Продажи», а если они пусты — обратная ссылка дочерней
     * сделки на корень (`to_base_sales`). Так презентационная сделка
     * находится и когда звонок сделан ИЗ основной сделки (жалоба владельца
     * 08.09.2026), а не только когда владелец звонка — сама презентация.
     */
    private async fillChildren(
        lookup: CallReportDealLookup,
        family: CallReportDealFamily,
        mainRow: CallReportDealRow,
        context: CallReportDealFamilyContext,
    ): Promise<void> {
        if (!family.presentationDealId) {
            const found = await this.resolveChild(
                lookup,
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
            const found = await this.resolveChild(
                lookup,
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
    private async resolveChild(
        lookup: CallReportDealLookup,
        mainRow: CallReportDealRow,
        code: PbxDealCategoryCodeEnum,
        fieldCode: string,
        mainDealId: number | undefined,
        context: CallReportDealFamilyContext,
    ): Promise<number | undefined> {
        const linked = lookup.dealRefField(mainRow, fieldCode);
        if (linked) {
            const deal = await lookup.getDeal(linked);
            if (deal && lookup.categoryCodeOf(deal) === code) return linked;
            this.logger.warn(
                `Ссылка на дочернюю сделку ${linked} не ведёт в воронку ` +
                    `${code} — отброшена`,
            );
        }
        if (!mainDealId) return undefined;
        return lookup.findChildOfRoot(code, mainDealId, context);
    }
}
