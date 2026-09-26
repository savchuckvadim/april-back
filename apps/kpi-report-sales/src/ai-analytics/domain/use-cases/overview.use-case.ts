import {
    BadRequestException,
    Injectable,
    Logger,
    Optional,
} from '@nestjs/common';
import { AI_ANALYTICS_OVERVIEW_MAX_MONTHS } from '../../constants/ai-overview.const';
import { AiOverviewDto } from '../../dto/ai-overview.dto';
import { isOverviewPeriodValid } from '../../dto/validators/overview-period.validator';
import { AiAnalyticsFeedbackStore } from '../../store/ai-analytics-feedback.store';
import { AiAnalyticsSettingsStore } from '../../store/ai-analytics-settings.store';
import { AiAnalyticsSnapshotStore } from '../../store/ai-analytics-snapshot.store';
import { CallsLoader } from '../loaders/calls.loader';
import { FinanceLoader } from '../loaders/finance.loader';
import { KpiLoader } from '../loaders/kpi.loader';
import { ManagerOrgLoader } from '../loaders/manager-org.loader';
import { ManagersLoader } from '../loaders/managers.loader';
import { OverviewSnapshotsLoader } from '../loaders/overview-snapshots.loader';
import { portalRangeUtc } from '../loaders/period.util';
import { PlansLoader } from '../loaders/plans.loader';
import { SettingsLoader } from '../loaders/settings.loader';
import {
    buildOverviewDto,
    type OverviewPresenterSources,
} from '../presenter/overview.presenter';

/** Вход расчёта обзора: период в TZ портала, ростер (пусто — структура). */
export interface OverviewInput {
    domain: string;
    from: string;
    to: string;
    managerIds?: readonly (string | number)[];
    confirmedOnly?: boolean;
    /** Обойти чтение кэшей loader'ов (kpi-month, finance, plans). */
    forceRefresh?: boolean;
}

export interface OverviewUseCaseOptions {
    /** «Сейчас» (для тестов и процессора); по умолчанию — текущее время. */
    now?: Date;
}

const DISAGREE_KIND = 'disagree';

/**
 * Оркестрация обзора менеджер × тип (план 6.4, ТЗ FR-13): период
 * (≤ 3 мес., иначе 400) → ростер → параллельно звонки (loadLite за UTC-окно
 * периода), KPI-месяцы, финансы, планы руководителя, раскладка по отделам,
 * уровни из стора, несогласия и снапшоты `ais` (Фаза 2, «год назад»,
 * паспорта месяца — уровень и стаж строки без ручной записи) →
 * assembler/presenter → AiOverviewDto на весь домен. Периметр requester'а
 * применяется при отдаче (applyOverviewPerimeter), результат кэшируется
 * процессором.
 *
 * Сам ничего не считает и не ходит в Bitrix напрямую: всё — в loader'ах
 * (PBXService.init(domain) внутри них), поэтому @Injectable без
 * bitrix-состояния.
 */
@Injectable()
export class OverviewUseCase {
    private readonly logger = new Logger(OverviewUseCase.name);

    constructor(
        private readonly settings: SettingsLoader,
        private readonly managers: ManagersLoader,
        private readonly calls: CallsLoader,
        private readonly kpi: KpiLoader,
        private readonly finance: FinanceLoader,
        private readonly plans: PlansLoader,
        private readonly org: ManagerOrgLoader,
        private readonly levels: AiAnalyticsSettingsStore,
        private readonly feedback: AiAnalyticsFeedbackStore,
        /**
         * Стор снапшотов Фазы 2 (модель портала, прогнозы, стиль).
         * Необязателен: без него витрина отдаёт то же, что в Фазе 1b —
         * нормы null, `priorSource: none`, рекомендации пусты (§5.4).
         */
        @Optional()
        private readonly snapshots?: AiAnalyticsSnapshotStore,
    ) {}

    async execute(
        input: OverviewInput,
        options: OverviewUseCaseOptions = {},
    ): Promise<AiOverviewDto> {
        this.assertPeriod(input.from, input.to);
        const now = options.now ?? new Date();
        const startedAt = Date.now();
        const { domain, from, to } = input;
        const forceRefresh = input.forceRefresh === true;

        const [settings, managerIds] = await Promise.all([
            this.settings.load(domain),
            this.managers.resolve(domain, input.managerIds),
        ]);
        const range = portalRangeUtc(from, to, settings.calendar.timeZone);

        // Снапшоты `ais` (Фаза 2, «год назад», паспорта месяца) идут
        // параллельно с загрузчиками Bitrix; чтение не бросает (деградирует
        // до undefined), поэтому ожидается после них.
        const snapshotReads = Promise.all([
            this.fromSnapshots(domain, 'Снапшоты Фазы 2', loader =>
                loader.load(domain, to),
            ),
            this.fromSnapshots(domain, 'Месяцы года назад', loader =>
                loader.loadYoy(domain, to),
            ),
            this.fromSnapshots(domain, 'Паспорта менеджеров', loader =>
                loader.loadPassports(domain, to),
            ),
        ]);
        const [rows, kpi, finance, plans, org, levels, disagreementsCount] =
            await Promise.all([
                this.calls.loadLite(domain, range.from, range.to),
                this.kpi.loadKpiMonths(domain, from, to, managerIds, {
                    forceRefresh,
                    now,
                }),
                this.finance.loadFinance(domain, from, to, managerIds, {
                    forceRefresh,
                    now,
                }),
                this.plans.loadPlans(domain, managerIds, { forceRefresh }),
                this.org.load(domain),
                this.levels.loadLevels(domain),
                this.countDisagreements(domain, range.from, range.to),
            ]);

        const [snapshots, yoy, passports] = await snapshotReads;
        const sources: OverviewPresenterSources = {
            domain,
            from,
            to,
            confirmedOnly: input.confirmedOnly === true,
            calendar: settings.calendar,
            enabled: settings.enabled,
            managerIds,
            rows,
            kpi,
            finance,
            plans,
            org,
            levels,
            disagreementsCount,
            snapshots: snapshots ?? {},
            ...(yoy === undefined ? {} : { yoy }),
            ...(passports === undefined ? {} : { passports }),
            rosterConfirmedAt: settings.rosterConfirmedAt,
            hypothesisPairs: settings.hypothesis?.pairs.length ?? 0,
        };
        const dto = buildOverviewDto(sources, now);
        this.logger.log(
            `Обзор ${domain} ${from}..${to}: менеджеров ${dto.managers.length}, ` +
                `звонков ${dto.meta.totalCalls}, разборов ${dto.meta.analyzedCalls}, ` +
                `${Date.now() - startedAt} мс`,
        );
        return dto;
    }

    /**
     * Чтение снапшотов `ais` для витрины: снапшоты Фазы 2 на конец
     * периода, месяцы «год назад» (П3), паспорта месяца (уровень и стаж
     * строки). Стора нет либо `ais` не ответила — undefined, и витрина
     * остаётся в прежнем поведении: обзор не гаснет из-за ночного
     * конвейера (§5.4).
     */
    private async fromSnapshots<T>(
        domain: string,
        what: string,
        read: (loader: OverviewSnapshotsLoader) => Promise<T>,
    ): Promise<T | undefined> {
        if (!this.snapshots) return undefined;
        try {
            return await read(new OverviewSnapshotsLoader(this.snapshots));
        } catch (error) {
            this.logger.warn(
                `${what} недоступны (${domain}): ${String(error)}`,
            );
            return undefined;
        }
    }

    /** Период задан, from ≤ to и не длиннее AI_ANALYTICS_OVERVIEW_MAX_MONTHS. */
    private assertPeriod(from: string, to: string): void {
        if (!isOverviewPeriodValid(from, to)) {
            throw new BadRequestException(
                `Период обзора должен быть в формате YYYY-MM-DD, from ≤ to и не длиннее ${AI_ANALYTICS_OVERVIEW_MAX_MONTHS} мес.`,
            );
        }
    }

    /** Реакций disagree за период (по created_at записи). */
    private async countDisagreements(
        domain: string,
        from: Date,
        to: Date,
    ): Promise<number> {
        const records = await this.feedback.listInPeriod(domain, from, to);
        return records.filter(record => record.kind === DISAGREE_KIND).length;
    }
}
