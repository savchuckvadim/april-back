import { readinessStageGatesOf } from '@lib/sales-ai-analytics';
import {
    portalRegistryOf,
    stageFlagsOf,
} from '../presenter/readiness-stages.util';
import {
    BadRequestException,
    Injectable,
    Logger,
    Optional,
} from '@nestjs/common';
import { AI_ANALYTICS_OVERVIEW_MAX_MONTHS } from '../../constants/ai-overview.const';
import { AiManagerRowDto } from '../../dto/ai-manager-row.dto';
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
import { SmartLinkLoader } from '../loaders/smart-link.loader';
import {
    overviewRiskCallIds,
    withOverviewRiskCallLinks,
} from '../presenter/overview-links.presenter';
import { applyLeverMarks } from '../presenter/levers.presenter';
import {
    buildOverviewDto,
    type OverviewPresenterSources,
} from '../presenter/overview.presenter';
import {
    type LeverFeedbackMarks,
    periodLeverFeedbackMarks,
} from './feedback-lever.util';

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

/** Обратная связь периода, нужная обзору: несогласия и отметки по советам. */
interface OverviewFeedbackFacts {
    disagreementsCount: number;
    levers: LeverFeedbackMarks;
}

/**
 * Оркестрация обзора менеджер × тип (план 6.4, ТЗ FR-13): период
 * (≤ 3 мес., иначе 400) → ростер → параллельно звонки (loadLite за UTC-окно
 * периода), KPI-месяцы, финансы, планы руководителя, раскладка по отделам,
 * уровни из стора, несогласия и снапшоты `ais` (Фаза 2, «год назад»,
 * паспорта месяца — уровень и стаж строки без ручной записи) →
 * assembler/presenter → AiOverviewDto на весь домен → отметки «Сделано» и
 * день выдачи на советах строк (обратная связь периода, Фаза 4) → ссылки
 * риск-звонков строк на карточки разборов одним вызовом SmartLinkLoader (как у сигналов
 * пульса; fail-open — при ошибке загрузчика link = null и один warn).
 * Периметр requester'а применяется при отдаче (applyOverviewPerimeter),
 * результат кэшируется процессором.
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
        /** Ссылки риск-звонков строк на карточки разборов в смарте портала. */
        private readonly smartLinks: SmartLinkLoader,
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
            this.fromSnapshots(domain, 'Снапшоты ступеней Фазы 4', loader =>
                loader.loadPhase4(domain),
            ),
        ]);
        const [rows, kpi, finance, plans, org, levels, feedback] =
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
                this.loadFeedbackFacts(domain, range.from, range.to, now),
            ]);

        const [snapshots, yoy, passports, phase4] = await snapshotReads;
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
            disagreementsCount: feedback.disagreementsCount,
            snapshots: snapshots ?? {},
            ...(yoy === undefined ? {} : { yoy }),
            ...(passports === undefined ? {} : { passports }),
            rosterConfirmedAt: settings.rosterConfirmedAt,
            hypothesisPairs: settings.hypothesis?.pairs.length ?? 0,
            ...(phase4 === undefined
                ? {}
                : {
                      stageSources: {
                          snapshots: phase4,
                          flags: stageFlagsOf(settings),
                          gates: readinessStageGatesOf(
                              portalRegistryOf(settings),
                          ),
                      },
                  }),
        };
        const overview = buildOverviewDto(sources, now);
        const built: AiOverviewDto = {
            ...overview,
            managers: applyLeverMarks(overview.managers, feedback.levers),
        };
        const dto = withOverviewRiskCallLinks(
            built,
            await this.resolveRiskCallLinks(domain, built.managers),
        );
        this.logger.log(
            `Обзор ${domain} ${from}..${to}: менеджеров ${dto.managers.length}, ` +
                `звонков ${dto.meta.totalCalls}, разборов ${dto.meta.analyzedCalls}, ` +
                `${Date.now() - startedAt} мс`,
        );
        return dto;
    }

    /**
     * Ссылки на карточки разборов всех риск-звонков обзора одним вызовом
     * загрузчика (он сам ходит в смарт и ais пачкой по всем id). Fail-open:
     * ошибка загрузчика → один warn и пустая карта, у всех риск-звонков
     * link = null — обзор не гаснет из-за ссылок.
     */
    private async resolveRiskCallLinks(
        domain: string,
        managers: readonly AiManagerRowDto[],
    ): Promise<ReadonlyMap<string, string | null>> {
        const ids = overviewRiskCallIds(managers);
        if (!ids.length) return new Map();
        try {
            return await this.smartLinks.resolveLinks(domain, ids);
        } catch (error) {
            this.logger.warn(
                `Ссылки на разборы риск-звонков обзора (${domain}) не построены: ${(error as Error).message}`,
            );
            return new Map();
        }
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

    /**
     * Одна выборка обратной связи (по created_at записи): реакции disagree
     * и день выдачи советов — за период, «Сделано» — от начала периода до
     * «сейчас». Прошлый период смотрят и после его конца (сентябрь — 2
     * октября): отметка, поставленная позже периода, иначе пропадала бы
     * после перечитки обзора, кнопка возвращалась и копила дубли.
     */
    private async loadFeedbackFacts(
        domain: string,
        from: Date,
        to: Date,
        now: Date,
    ): Promise<OverviewFeedbackFacts> {
        const until = now.getTime() > to.getTime() ? now : to;
        const records = await this.feedback.listInPeriod(domain, from, until);
        const inPeriod = records.filter(
            record => record.createdAt.getTime() <= to.getTime(),
        );
        return {
            disagreementsCount: inPeriod.filter(
                record => record.kind === DISAGREE_KIND,
            ).length,
            levers: periodLeverFeedbackMarks(records, to),
        };
    }
}
