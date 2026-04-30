import { Injectable } from '@nestjs/common';
import {
    IDealReconcilePlan,
    OrkActsReconcilePlanUseCase,
} from './ork-acts-reconcile-plan.use-case';
import { SmartActGsrService } from '../services/smart/smart-act-gsr.service';
import {
    coerceSmartActId,
    findUnusedActMatchingSlot,
    isoDatesRoughlyEqual,
    resolveCreateStageForSlot,
} from './utils/act-slot-sync.util';
import { PBXService } from '@/modules/pbx';
import { CategorySmartActService } from '../services/smart/category-smart-act.service';
import { SmartActService } from '../services/smart/smart-act.service';
import { SmartProductRowService } from '../services/smart/smart-product-row.service';

const domain = 'gsr.bitrix24.ru';
@Injectable()
export class ActNProductHandlerUseCase {
    constructor(
        private readonly pbx: PBXService,
        private readonly orkActsReconcilePlanUseCase: OrkActsReconcilePlanUseCase,
        private readonly smartActGsrService: SmartActGsrService,
        private readonly categorySmartActService: CategorySmartActService,
    ) {}

    async execute(): Promise<{ plans: IDealReconcilePlan[] }> {
        const { plans } = await this.orkActsReconcilePlanUseCase.execute();
        for (const plan of plans) {
            await this.syncDealActsFromPlan(plan);
        }
        // await bitrix.api.callBatchAsync();
        return { plans };
    }

    /**
     * Сопоставляет слоты expectedActPeriods с актами по UF-периоду,
     * создаёт недостающие (success для прошедших месяцев, inprogress для текущего),
     * переводит в успех там, где уже должно быть закрыто,
     * правит from/to при расхождении со слотом,
     * удаляет fail по плану и лишние акты при remove_extra_acts.
     */
    private async syncDealActsFromPlan(
        plan: IDealReconcilePlan,
    ): Promise<void> {
        const actionTypes = new Set(plan.actions.map(a => a.type));
        const { bitrix, PortalModel } = await this.pbx.init(domain);
        const smartActService = new SmartActService(
            domain,
            bitrix,
            PortalModel,
            this.categorySmartActService,
        );
        const smartProductRowService = new SmartProductRowService(
            bitrix,
            PortalModel,
        );
        // Товары смарта: строки сделки (plan.item.rows, owner D + dealId) → доля на месяц на элемент смарта.
        // Внутри — list по DYNAMIC_* + id акта; set только если снимок строк отличается от желаемого.
        // Нет периода / товаров или договор ещё не начался — reconcile уже описал notify/skip, мутаций не делаем.
        if (
            actionTypes.has('notify_responsible_missing_data') ||
            actionTypes.has('skip_contract_not_started')
        ) {
            return;
        }

        const dealIdNum = Number(plan.dealId);
        if (!Number.isFinite(dealIdNum)) {
            return;
        }

        // Контур reconcile: сначала убрать акты в стадии «не состоялся», чтобы не мешали расчёту.
        if (actionTypes.has('remove_failed_acts')) {
            const failed = plan.item.smartItems.items.filter(
                i => i.stageType === 'fail',
            );
            for (const it of failed) {
                const id = coerceSmartActId(it);
                if (id != null) {
                    await smartActService.delete(id);
                }
            }
        }

        // Дальше работаем только с не-fail (fail уже удалены или будут проигнорированы при матчинге).
        const workableItems = plan.item.smartItems.items.filter(
            i => i.stageType !== 'fail',
        );

        const expectedTotal = plan.actsSummury.expectedTotal;
        const currentMonth = plan.monthPeriodSummary.current;
        const periods = plan.expectedActPeriods;
        const slotsCount = Math.min(Math.max(expectedTotal, 0), periods.length);

        // Акты, попавшие под какой-либо слот — чтобы не удалить их как «лишние» на шаге remove_extra_acts.
        const usedIds = new Set<number>();

        // Цикл по месяцам договора 1..N: у каждого месяца есть календарный слот from/to и целевая стадия.
        for (let monthIndex = 1; monthIndex <= slotsCount; monthIndex++) {
            const slot = periods[monthIndex - 1];
            const match = findUnusedActMatchingSlot(
                workableItems,
                slot,
                usedIds,
            );
            const targetStage = resolveCreateStageForSlot(
                monthIndex,
                currentMonth,
            );

            // Нет акта под этот месяц — создаём (прошлые месяцы сразу в success, текущий — inprogress).
            if (!match) {
                const newId = await smartActService.createSmartActGsr({
                    dealId: dealIdNum,
                    productQuantity: plan.item.productQuantity,
                    productCoefficient: plan.item.productCoefficient,
                    smartItems: plan.item.smartItems,
                    from: slot.from,
                    to: slot.to,
                    quantity: 1,
                    stageType: targetStage,
                });
                if (newId != null) {
                    console.log('newId', newId);
                    console.log(
                        '1 Привязать товарные строки к новому элементу смарта (или пропуск, если sync выключен).',
                        plan.item.rows,
                    );
                    // Привязать товарные строки к новому элементу смарта (или пропуск, если sync выключен).
                    await smartProductRowService.syncDealRowsToSmartIfNeeded(
                        plan.item.rows,
                        newId,
                    );
                }
                continue;
            }

            const actId = coerceSmartActId(match);
            if (actId != null) {
                usedIds.add(actId);
            }

            // Акт есть, но месяц уже прошёл по правилам договора — должен быть закрыт в успех.
            if (
                targetStage === 'success' &&
                match.stageType !== 'success' &&
                actId != null
            ) {
                await this.smartActGsrService.closeSuccessSmartAct(actId);
            }

            // Даты в UF не совпали со слотом (например сдвинули договор) — подтягиваем from/to под календарь.
            if (
                actId != null &&
                (!isoDatesRoughlyEqual(match.from, slot.from) ||
                    !isoDatesRoughlyEqual(match.to, slot.to))
            ) {
                await smartActService.updateSmartActFromTo(
                    actId,
                    slot.from,
                    slot.to,
                );
            }

            if (actId != null) {
                console.log(
                    '2 Акт уже есть: при изменении товаров/цен в сделке подтянуть строки акта без лишнего set при совпадении.',
                    plan.item.rows,
                );
                // Акт уже есть: при изменении товаров/цен в сделке подтянуть строки акта без лишнего set при совпадении.
                await smartProductRowService.syncDealRowsToSmartIfNeeded(
                    plan.item.rows,
                    actId,
                );
            }
        }

        // Лишние акты сверх нормы по reconcile (часто после укорочения договора задним числом).
        if (actionTypes.has('remove_extra_acts')) {
            for (const it of plan.item.smartItems.items) {
                if (it.stageType === 'fail') {
                    continue;
                }
                const id = coerceSmartActId(it);
                if (id == null || usedIds.has(id)) {
                    continue;
                }
                await smartActService.delete(id);
            }
        }
    }
}
