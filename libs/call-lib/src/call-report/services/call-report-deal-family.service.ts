import { Injectable, Logger } from '@nestjs/common';
import { PBXService } from '@lib/pbx/pbx.service';
import { PbxDealCategoryCodeEnum } from '@lib/portal-lib/portal/services/types/deals/portal.deal.type';
import { PBX_SALES_EVENT_FIELD_CODES } from '@lib/portal-lib/pbx';
import {
    callReportDealText,
    CallReportDealFamilyContext,
    CallReportDealLookup,
    CallReportDealRow,
} from './call-report-deal-lookup';
import {
    applyListFamily,
    CallReportDealFamily,
    callListSearchInputOf,
    listConflictBlocks,
} from './call-report-deal-family.types';
import { CallReportDealChildren } from './call-report-deal-children';
import {
    CallReportFamilyCache,
    familyCacheKey,
} from './call-report-family-cache';
import { CallReportListTruthService } from './call-report-list-truth.service';

export {
    CallReportDealFamilyContext,
    CallReportDealLinkConfidence,
} from './call-report-deal-lookup';
export * from './call-report-deal-family.types';

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
 * Порядок определения корня (§4 прод-фиксов, от надёжного к запасному):
 * 0. элемент «ОП История»/«ОП KPI» ЭТОГО звонка: его множественное
 *    crm-поле содержит всю семью потока (`CallReportListTruthService`);
 *    две сделки одной воронки в элементе — ошибка разметки, связь пустая;
 * 1. сама сделка стоит в «ОП Основная» — она и есть корень (ссылку
 *    `to_base_sales` игнорируем: стоящая в воронке сделка корень по
 *    определению, ошибочная ссылка не должна её переписывать);
 * 2. иначе — crm-поле «Корневая сделка Продажи», ПРОВЕРЕННОЕ чтением той
 *    сделки: не в основной воронке → ссылка отбрасывается;
 * 3. иначе — дотяжка по компании и контакту звонка, ВКЛЮЧАЯ ЗАКРЫТЫЕ
 *    сделки (целевая сделка живого случая стоит в «Не состоялась»);
 * 4. не нашли — пусто. Выдумывать связь нельзя.
 *
 * Дочерние связи (презентация/ХО) доливает `CallReportDealChildren`.
 *
 * Fail-open: любая ошибка чтения → пустая раскладка, звонок обрабатывается
 * дальше (связи дольются повторным прогоном / ночной ревизией).
 */
@Injectable()
export class CallReportDealFamilyService {
    private readonly logger = new Logger(CallReportDealFamilyService.name);

    /**
     * Короткая память ответа: за один разбор звонка раскладку спрашивают
     * трижды (сборщик контекста, карточка разбора, приём анализа), а шаг 0
     * читает при этом два списка отчётности. Без памяти это шесть лишних
     * обращений к порталу на звонок с заведомо одинаковым ответом.
     */
    private readonly cache = new CallReportFamilyCache<CallReportDealFamily>();

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
        if (
            !dealId &&
            !context.leadId &&
            !context.companyId &&
            !context.contactId
        ) {
            return {};
        }
        const cacheKey = familyCacheKey({ domain, dealId, ...context });
        const remembered = this.cache.get(cacheKey, Date.now());
        // Копия, а не сама запись: вызывающие дополняют раскладку своими
        // полями, и мутация не должна портить запомненный ответ.
        if (remembered) return { ...remembered };
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

            const family = await this.build(
                lookup,
                new CallReportListTruthService(bitrix, portal, this.logger),
                dealId,
                context,
            );
            this.logger.log(
                `Сделки звонка (${domain}, сделка ${dealId ?? '—'}): основная ` +
                    `${family.mainDealId ?? '—'} (${family.mainConfidence ?? 'нет'}` +
                    `, источник ${family.source ?? 'нет'}, запись ` +
                    `${family.listRecordId ?? '—'}), презентация ` +
                    `${family.presentationDealId ?? '—'}, ХО ` +
                    `${family.xoDealId ?? '—'}` +
                    (family.unresolved ? ', раскладка неполная' : ''),
            );
            // Неполную раскладку не запоминаем: следующий вызов имеет право
            // попробовать снова (права могли появиться, справочник — тоже).
            if (!family.unresolved) {
                this.cache.set(cacheKey, { ...family }, Date.now());
            }
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

    /** Сборка раскладки: запись списка → владелец → корень → дотяжка. */
    private async build(
        lookup: CallReportDealLookup,
        truth: CallReportListTruthService,
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
        let mainRow = await this.fromListRecord(truth, family, dealId, context);
        if (owner && dealId) {
            mainRow =
                this.fillFromOwner(lookup, family, owner, dealId) ?? mainRow;
            if (!family.mainDealId) {
                mainRow =
                    (await this.fromRootLink(lookup, family, owner)) ?? mainRow;
            }
        }
        if (
            !family.mainDealId &&
            !listConflictBlocks(family, PbxDealCategoryCodeEnum.sales_base)
        ) {
            mainRow = await this.fromClient(lookup, family, context);
        }
        if (mainRow) {
            await new CallReportDealChildren(lookup, this.logger).fill(
                family,
                mainRow,
                context,
            );
        }
        return family;
    }

    /**
     * Шаг 0 — ИСТОЧНИК ИСТИНЫ §4: элемент «ОП История»/«ОП KPI» этого
     * звонка. Его множественное crm-поле содержит всю семью потока, поэтому
     * связи берутся оттуда, а не дотягиваются догадкой. Записи нет (или нет
     * даты звонка, чтобы её опознать) — работают запасные пути.
     */
    private async fromListRecord(
        truth: CallReportListTruthService,
        family: CallReportDealFamily,
        dealId: number | undefined,
        context: CallReportDealFamilyContext,
    ): Promise<CallReportDealRow | null> {
        if (!context.callStartedAt) return null;
        const list = await truth.resolve(
            callListSearchInputOf(dealId, context),
        );
        return list ? applyListFamily(family, list) : null;
    }

    /**
     * Раскладка самой сделки-владельца по её воронке.
     *
     * Сделка, из которой ФИЗИЧЕСКИ сделан звонок, — факт CRM, а запись
     * списка выбрана ранжированием. Поэтому владелец воронки «ОП Основная»
     * перекрывает связь из записи, а расхождение попадает в лог: это сигнал
     * ошибки разметки, а не повод молчать.
     */
    private fillFromOwner(
        lookup: CallReportDealLookup,
        family: CallReportDealFamily,
        owner: CallReportDealRow,
        dealId: number,
    ): CallReportDealRow | null {
        const code = lookup.categoryCodeOf(owner);
        family.ownerCategoryCode = code;
        if (code === PbxDealCategoryCodeEnum.sales_presentation) {
            this.warnOwnerMismatch(family, code, dealId);
            family.presentationDealId = dealId;
            family.presentationConfidence = 'exact';
        } else if (code === PbxDealCategoryCodeEnum.sales_xo) {
            family.xoDealId = dealId;
        } else if (code === PbxDealCategoryCodeEnum.sales_base) {
            if (family.mainDealId !== dealId) family.source = 'root-link';
            this.warnOwnerMismatch(family, code, dealId);
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
        family.source = 'root-link';
        return root;
    }

    /** Связь из записи списка разошлась с фактом карточки — это в лог. */
    private warnOwnerMismatch(
        family: CallReportDealFamily,
        code: PbxDealCategoryCodeEnum,
        dealId: number,
    ): void {
        const fromList =
            code === PbxDealCategoryCodeEnum.sales_base
                ? family.mainDealId
                : family.presentationDealId;
        if (!fromList || fromList === dealId) return;
        this.logger.warn(
            `Запись отчётности ${family.listRecordId ?? '—'} указывает сделку ` +
                `${fromList} воронки ${code}, а звонок сделан из ${dealId} ` +
                'той же воронки — берём сделку-владельца звонка (факт CRM)',
        );
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
        family.source = 'client-lookup';
        this.logger.log(
            'Основная сделка дотянута по клиенту (компания ' +
                `${context.companyId ?? '—'}, контакт ${context.contactId ?? '—'}) ` +
                `→ ${found.id} (${found.confidence})`,
        );
        return found.deal;
    }
}
