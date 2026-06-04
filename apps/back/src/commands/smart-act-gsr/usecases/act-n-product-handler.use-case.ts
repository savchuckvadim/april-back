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
import { SmartDealProductRowService } from '../services/smart/smart-deal-product-row.service';
import { getContractPeriodFieldBitrixId } from '../services/ork-deals/utils/get-contract-period-field.util';
import { BitrixService, IBXDeal } from '@/modules/bitrix';
import { PortalModel } from '@lib/portal/services/portal.model';
import { SmartActTimelineChangeContractStartService } from '../services/timeline/smart-act.timeline.service';
import type { ISmartActWarningTaskSendData } from '../services/task/smart-act-plan-warning.constants';
import { buildSmartActWarningTasksFromPlan } from '../services/task/smart-act-plan-warning-from-plan.util';
import { SmartActWarningTaskService } from '../services/task/smart-act-task-warning.service';

export const domain = 'gsr.bitrix24.ru';
@Injectable()
export class ActNProductHandlerUseCase {
    constructor(
        private readonly pbx: PBXService,
        private readonly orkActsReconcilePlanUseCase: OrkActsReconcilePlanUseCase,
        private readonly smartActGsrService: SmartActGsrService,
        private readonly categorySmartActService: CategorySmartActService,
    ) {}

    async execute(dealId?: number): Promise<{ plans: IDealReconcilePlan[] }> {
        // 1) Планы reconcile по сделкам (акты, товары, действия) на основе текущих данных CRM.
        let { plans } = await this.orkActsReconcilePlanUseCase.execute(dealId);
        // 2) Подключение Bitrix API и модели портала (маппинг UF полей договора и т.д.).
        const { bitrix, PortalModel } = await this.pbx.init(domain);
        // 3) Флаг: хотя бы у одной сделки сдвинули дату начала договора по паттерну лицензии.
        let didShiftContractStart = false;
        const changedFromContractTasks: ISmartActWarningTaskSendData[] = [];
        for (const plan of plans) {
            // 4) Если в плане есть align_contract_start_one_month_license — пишем UF «с» + комментарий в таймлайн.
            const shifted = await this.shiftContractStartOneMonthForward(
                plan,
                bitrix,
                PortalModel,
            );
            // 5) Накопление флага по результату сдвига текущего плана (await выше выполняется на каждой итерации).
            didShiftContractStart ||= shifted;
            if (shifted) {
                changedFromContractTasks.push({
                    type: 'changed_from',
                    dealId: plan.dealId,
                    companyId: plan.companyId,
                    responsibleId: Number(plan.assignedById),
                });
            }
        }
        if (didShiftContractStart) {
            // 6) После изменения UF пересобираем планы — totalMonths/слоты/qty уже от новой даты начала.
            ({ plans } =
                await this.orkActsReconcilePlanUseCase.execute(dealId));
        }
        for (const plan of plans) {
            // 7) Синхронизация актов и строк по итоговому плану (создание, закрытие, qty сделки).
            await this.syncDealActsFromPlan(plan);
        }
        // 8) Задачи-предупреждения: сдвиг «начала договора» (changed_from) + проблемы по плану (один batch).
        const planWarningTasks = plans.flatMap(p =>
            buildSmartActWarningTasksFromPlan(p),
        );
        const warningTasks = [...changedFromContractTasks, ...planWarningTasks];
        if (warningTasks.length > 0) {
            const warningTaskService = new SmartActWarningTaskService(bitrix);
            await warningTaskService.sendTasks(warningTasks);
        }

        // 9) Ответ API — финальные планы (после возможного второго reconcile).
        return { plans };
    }

    /**
     * Паттерн «лицензия 6/12/24 мес. + ровно 1 лишний календарный месяц»: обновить UF начала договора и зафиксировать в таймлайне.
     * @returns true, если для плана было действие и выполнен сдвиг в CRM.
     */
    private async shiftContractStartOneMonthForward(
        plan: IDealReconcilePlan,
        bitrix: BitrixService,
        portal: PortalModel,
    ): Promise<boolean> {
        const shift = plan.actions.find(
            a =>
                a.type === 'align_contract_start_one_month_license' &&
                a.shiftedContractStartIso != null,
        );
        if (shift?.shiftedContractStartIso == null) {
            return false;
        }

        const startField = getContractPeriodFieldBitrixId(portal, 'start');
        await bitrix.deal.update(plan.dealId, {
            [startField]: shift.shiftedContractStartIso,
        } as Partial<IBXDeal>);
        //отправка в timeline комментария о сдвиге даты начала договора
        const smartActTimelineChangeContractStartService =
            new SmartActTimelineChangeContractStartService(
                bitrix,
                plan.item.deal.periodData.from,
                shift.shiftedContractStartIso,
                plan.dealId,
                Number(plan.assignedById),
            );
        await smartActTimelineChangeContractStartService.execute();

        return true;
    }

    /**
     * Сопоставляет слоты expectedActPeriods с актами по UF-периоду,
     * создаёт недостающие (success для слотов за полностью прошедшие месяцы, inprogress для текущего незавершённого),
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
        const dealProductRowService = new SmartDealProductRowService(bitrix);
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

        // Подогнать quantity в строках сделки под месяцы договора (ретро-отказ / догонка); затем обновить plan.item.rows из Bitrix.
        await dealProductRowService.syncDealRowsQuantityFromPlanIfNeeded(
            plan,
            dealIdNum,
        );

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
        const passedMonths = plan.monthPeriodSummary.passed;
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
                passedMonths,
            );

            // Нет акта под этот месяц — создаём (закрытые месяцы — success, текущий незавершённый — inprogress).
            if (!match) {
                const newId = await smartActService.createSmartActGsr({
                    dealId: dealIdNum,
                    companyId: plan.companyId,
                    responsibleId: Number(plan.assignedById),
                    productQuantity: plan.item.productQuantity,
                    productCoefficient: plan.item.productCoefficient,
                    smartItems: plan.item.smartItems,
                    from: slot.from,
                    to: slot.to,
                    quantity: 1,
                    stageType: targetStage,
                });
                if (newId != null) {
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
