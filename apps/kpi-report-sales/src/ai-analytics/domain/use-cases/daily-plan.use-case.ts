import { ForbiddenException, Injectable } from '@nestjs/common';
import {
    AI_ANALYTICS_SNAPSHOT_TYPE,
    buildRegistryContext,
    resolveNumberParam,
    toPortalDate,
} from '@lib/sales-ai-analytics';
import {
    AI_DAILY_PLAN_DISABLED_MESSAGE,
    AI_DAILY_PLAN_MONTH_LIMIT,
    AI_DAILY_PLAN_TTL_SECONDS,
    buildDailyPlanKey,
} from '../../constants/ai-plan.const';
import type {
    AiDailyPlanRequestDto,
    AiDailyPlanResponseDto,
} from '../../dto/ai-daily-plan.dto';
import { AiAnalyticsCacheService } from '../../cache/ai-analytics-cache.service';
import { AiAnalyticsSnapshotStore } from '../../store/ai-analytics-snapshot.store';
import { buildDailyPlanView } from '../assembler/daily-plan-input.assembler';
import type {
    DailyPlanSnapshots,
    DailyPlanView,
} from '../assembler/daily-plan-input.types';
import type { ForecastPayload } from '../assembler/forecast.types';
import type { ManagerMonthPayload } from '../assembler/manager-snapshot.types';
import type { PortalModelPayload } from '../assembler/portal-model.types';
import type { RequesterAccess } from '../access/perimeter.util';
import { RequesterAccessService } from '../access/requester-access.service';
import {
    SettingsLoader,
    type AiAnalyticsPortalSettings,
} from '../loaders/settings.loader';
import { presentDailyPlan } from '../presenter/daily-plan.presenter';

/**
 * План дня менеджера (план Фазы 2, §4.9 и §5.2, поток 17
 * `p2-api-plan-daily`): обратная задача «от цели месяца к активностям
 * сегодня», ответ синхронный.
 *
 * Читаются ТОЛЬКО снапшоты `ais` — дневной прогноз, месячная модель
 * портала и месяц менеджера; Битрикс не вызывается вовсе (бюджет ответа
 * — сотни миллисекунд, а не минуты). Кэш — `…:{domain}:plan:{date}:
 * {managerId}` на 180 с; он же сбрасывается по `settings/save` вместе с
 * секцией `plan` (решение человека меняет цели и нормы, §3.4).
 *
 * Права: `ai_analytics_daily_plan_enabled = false` → 403 с текстом о
 * выключенной настройке (решение владельца, §9 вопрос 4); чужой
 * `managerId` вне периметра → 403; `ropOnly` отдаётся только
 * руководителям (это делает презентер, кэш от роли не зависит).
 *
 * `@Injectable` без bitrix-состояния: `this.bitrix` здесь нет и быть не
 * может (CLAUDE.md) — источник данных один, таблица `ais`.
 */
@Injectable()
export class DailyPlanUseCase {
    constructor(
        private readonly settings: SettingsLoader,
        private readonly access: RequesterAccessService,
        private readonly cache: AiAnalyticsCacheService,
        private readonly snapshots: AiAnalyticsSnapshotStore,
    ) {}

    async execute(
        dto: AiDailyPlanRequestDto,
        access: RequesterAccess,
        now: Date = new Date(),
    ): Promise<AiDailyPlanResponseDto> {
        const settings = await this.settings.load(dto.domain);
        if (!settings.dailyPlanEnabled) {
            throw new ForbiddenException(AI_DAILY_PLAN_DISABLED_MESSAGE);
        }
        const managerId = normalizeManagerId(
            dto.managerId ?? dto.requesterUserId,
        );
        this.access.assertVisible(access, managerId);
        const date = dto.date ?? toPortalDate(now, settings.calendar.timeZone);
        const monthKey = date.slice(0, 7);
        const requestKey = buildDailyPlanKey(dto.domain, date, managerId);
        const ceiling = planDayCeilingOf(settings);
        const { value } = await this.cache.remember<DailyPlanView>(
            requestKey,
            AI_DAILY_PLAN_TTL_SECONDS,
            async () =>
                buildDailyPlanView({
                    managerId,
                    date,
                    monthKey,
                    calendar: settings.calendar,
                    targets: settings.targets,
                    ...(ceiling === undefined
                        ? {}
                        : { ceilingMultiplier: ceiling }),
                    snapshots: await this.load(dto.domain, date, managerId),
                }),
        );

        return {
            status: 'ready',
            requestKey,
            data: presentDailyPlan(value, access),
        };
    }

    /** Три снапшота одним заходом; чего нет — null, а не исключение. */
    private async load(
        domain: string,
        date: string,
        managerId: string,
    ): Promise<DailyPlanSnapshots> {
        const monthKey = date.slice(0, 7);
        const [forecast, model, month] = await Promise.all([
            this.forecastOf(domain, date, managerId),
            this.modelOf(domain, monthKey),
            this.monthOf(domain, monthKey, managerId),
        ]);

        return { forecast, model, month };
    }

    /** Прогноз дня менеджера; записи нет — null (план пойдёт по объёму). */
    private async forecastOf(
        domain: string,
        date: string,
        managerId: string,
    ): Promise<Partial<ForecastPayload> | null> {
        const records = await this.snapshots.findByKeys(
            domain,
            AI_ANALYTICS_SNAPSHOT_TYPE.forecast,
            {
                periodKeys: [date],
                managerIds: [managerId],
                latestOnly: true,
            },
        );
        const record = records[records.length - 1];

        return record === undefined
            ? null
            : (record.payload as Partial<ForecastPayload>);
    }

    /**
     * Модель портала за месяц плана; за этот месяц её ещё нет — последняя
     * записанная (нормы прошлого месяца честнее отсутствия норм).
     */
    private async modelOf(
        domain: string,
        monthKey: string,
    ): Promise<Partial<PortalModelPayload> | null> {
        const record =
            (await this.snapshots.latestModel(domain, monthKey)) ??
            (await this.snapshots.latestModel(domain));

        return record === null
            ? null
            : (record.payload as Partial<PortalModelPayload>);
    }

    /** Месяц менеджера: объёмы рёбер, снимок плана и финансовый хвост. */
    private async monthOf(
        domain: string,
        monthKey: string,
        managerId: string,
    ): Promise<Partial<ManagerMonthPayload> | null> {
        const records = await this.snapshots.findManagerMonths(
            domain,
            [monthKey],
            { limit: AI_DAILY_PLAN_MONTH_LIMIT, managerIds: [managerId] },
        );
        const record = records[records.length - 1];

        return record === undefined
            ? null
            : (record.payload as Partial<ManagerMonthPayload>);
    }
}

/**
 * Bitrix-id в той же форме, в какой периметр хранит своих менеджеров
 * (`String(Number(id))`): иначе '0447' прошёл бы мимо периметра.
 */
function normalizeManagerId(raw: string): string {
    return String(Number(raw));
}

/**
 * `plan_day_ceiling` реестра со слоями портала — тот же множитель, что
 * берёт ночной прогноз (`forecast.plan.ts`). Портал ничего не решал —
 * undefined, и библиотека подставит свой дефолт 1,5.
 */
function planDayCeilingOf(
    settings: AiAnalyticsPortalSettings,
): number | undefined {
    return resolveNumberParam(
        'plan_day_ceiling',
        buildRegistryContext({
            modelParams: settings.modelParams,
            definitions: settings.definitions,
        }),
    );
}
