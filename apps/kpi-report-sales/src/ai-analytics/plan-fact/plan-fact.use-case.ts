/**
 * Реконсиляция «план — факт» за месяц (план Фазы 3, поток П2
 * `p3-plan-fact`): цели руководителя из снимка `ai-analytics-plan`
 * сверяются с фактом из месячных снапшотов `ai-analytics-manager-month`.
 * Ответ синхронный — всё уже лежит в `ais`, Битрикс не вызывается вовсе.
 *
 * Источник плана — ТОЛЬКО снимок целей (решение владельца В6 от
 * 22.09.2026): денежного плана не делаем.
 *
 * Кэш: закрытый месяц лежит 30 дней (снапшоты заморожены — читается без
 * единого обращения к порталу), текущий — минуты. Ключ входит в секцию
 * `plan`, поэтому существующий сброс `cache/reset` со scope `plan` и
 * `settings/save` его чистят.
 *
 * `ai_analytics_daily_plan_enabled = false` — НЕ 403: реконсиляция
 * отдаётся целиком, но `perDayNeeded` у строк равен null с причиной
 * `daily-plan-disabled` (приёмка потока).
 *
 * `@Injectable` без bitrix-состояния: `this.bitrix` здесь нет и быть не
 * может (CLAUDE.md) — источник данных один, таблица `ais`.
 */
import { Injectable } from '@nestjs/common';
import {
    AI_ANALYTICS_SNAPSHOT_TYPE,
    toPortalDate,
    type PlanSnapshot,
} from '@lib/sales-ai-analytics';
import {
    AI_PLAN_FACT_MONTH_LIMIT,
    AI_PLAN_FACT_TTL_SECONDS,
    buildPlanFactKey,
    isClosedMonth,
    planFactUsersKey,
} from '../constants/ai-plan-fact.const';
import { AiAnalyticsCacheService } from '../cache/ai-analytics-cache.service';
import { AiAnalyticsSnapshotStore } from '../store/ai-analytics-snapshot.store';
import type { RequesterAccess } from '../domain/access/perimeter.util';
import type { ManagerMonthPayload } from '../domain/assembler/manager-snapshot.types';
import {
    buildPlanFactView,
    planDayCeilingOf,
    type PlanFactView,
} from '../domain/assembler/plan-fact.assembler';
import {
    SettingsLoader,
    type AiAnalyticsPortalSettings,
} from '../domain/loaders/settings.loader';
import { ManagersLoader } from '../domain/loaders/managers.loader';
import { presentPlanFact } from '../domain/presenter/plan-fact.presenter';
import type {
    AiPlanFactRequestDto,
    AiPlanFactResponseDto,
} from '../dto/ai-plan-fact.dto';

@Injectable()
export class PlanFactUseCase {
    constructor(
        private readonly settings: SettingsLoader,
        private readonly managers: ManagersLoader,
        private readonly cache: AiAnalyticsCacheService,
        private readonly snapshots: AiAnalyticsSnapshotStore,
    ) {}

    async execute(
        dto: AiPlanFactRequestDto,
        access: RequesterAccess,
        now: Date = new Date(),
    ): Promise<AiPlanFactResponseDto> {
        const settings = await this.settings.load(dto.domain);
        const today = toPortalDate(now, settings.calendar.timeZone);
        const closed = isClosedMonth(dto.monthKey, today);
        const managerIds = await this.resolveManagers(dto, access);
        const requestKey = buildPlanFactKey(
            dto.domain,
            dto.monthKey,
            planFactUsersKey(managerIds),
        );
        const { value } = await this.cache.remember<PlanFactView>(
            requestKey,
            closed
                ? AI_PLAN_FACT_TTL_SECONDS.closed
                : AI_PLAN_FACT_TTL_SECONDS.live,
            () => this.build(dto, settings, managerIds, today),
        );

        return {
            status: 'ready',
            requestKey,
            data: presentPlanFact(value, access, { today, closed }),
        };
    }

    /**
     * Менеджеры расчёта: явный список пересекается с периметром (чужие
     * отбрасываются молча — 403 на чтение чужой строки означал бы, что
     * периметр раскрывается через код ответа), иначе весь периметр,
     * иначе — ростер ОП портала для тех, кто видит всех.
     */
    private async resolveManagers(
        dto: AiPlanFactRequestDto,
        access: RequesterAccess,
    ): Promise<string[]> {
        const visible = access.visibleManagerIds;
        if (dto.managerIds?.length) {
            const asked = normalizeIds(dto.managerIds);

            return visible === null
                ? asked
                : asked.filter(id => visible.includes(id));
        }
        if (visible !== null) return normalizeIds(visible);
        const roster = await this.managers.resolve(dto.domain);

        return normalizeIds(roster.map(String));
    }

    /** Сборка вида: снимок целей + месяцы менеджеров + календарь портала. */
    private async build(
        dto: AiPlanFactRequestDto,
        settings: AiAnalyticsPortalSettings,
        managerIds: readonly string[],
        today: string,
    ): Promise<PlanFactView> {
        const [plan, months] = await Promise.all([
            this.planOf(dto.domain, dto.monthKey),
            this.monthsOf(dto.domain, dto.monthKey, managerIds),
        ]);
        const ceiling = planDayCeilingOf(settings);

        return buildPlanFactView({
            monthKey: dto.monthKey,
            managerIds,
            plan,
            months,
            calendar: settings.calendar,
            today,
            dailyPlanEnabled: settings.dailyPlanEnabled,
            ...(ceiling === undefined ? {} : { dayCeiling: ceiling }),
        });
    }

    /** Снимок целей месяца; записи нет — null (строки уйдут в no-plan). */
    private async planOf(
        domain: string,
        monthKey: string,
    ): Promise<PlanSnapshot | null> {
        const records = await this.snapshots.findByKeys(
            domain,
            AI_ANALYTICS_SNAPSHOT_TYPE.plan,
            { periodKeys: [monthKey], latestOnly: true },
        );
        const record = records[records.length - 1];

        return record === undefined ? null : (record.payload as PlanSnapshot);
    }

    /** Месяцы менеджеров по ключу месяца: managerId → нагрузка снапшота. */
    private async monthsOf(
        domain: string,
        monthKey: string,
        managerIds: readonly string[],
    ): Promise<Map<string, Partial<ManagerMonthPayload>>> {
        const records = await this.snapshots.findManagerMonths(
            domain,
            [monthKey],
            {
                limit: AI_PLAN_FACT_MONTH_LIMIT,
                managerIds: [...managerIds],
            },
        );

        return new Map(
            records.flatMap(record =>
                record.managerId === null
                    ? []
                    : [
                          [
                              String(Number(record.managerId)),
                              record.payload as Partial<ManagerMonthPayload>,
                          ] as const,
                      ],
            ),
        );
    }
}

/**
 * Bitrix-id в той же форме, в какой периметр хранит своих менеджеров
 * (`String(Number(id))`), без повторов и по возрастанию — порядок строк
 * витрины и ключ кэша не должны зависеть от порядка в запросе.
 */
function normalizeIds(raw: readonly string[]): string[] {
    return [...new Set(raw.map(id => String(Number(id))))]
        .filter(id => id !== 'NaN' && id !== '0')
        .sort((left, right) => Number(left) - Number(right));
}
