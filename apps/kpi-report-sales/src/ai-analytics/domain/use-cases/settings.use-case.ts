import { Injectable, Logger } from '@nestjs/common';
import {
    AI_ANALYTICS_EVENT_KINDS,
    CALL_REPORT_CALL_TYPE_CODES,
} from '@lib/portal-lib/pbx/pbx-aicall-smart';
import { toPortalDate } from '@lib/sales-ai-analytics';
import { AI_ANALYTICS_WINDOWS } from '../../constants/ai-analytics.const';
import { AiCallReportStatusDto } from '../../dto/ai-settings-call-report.dto';
import {
    AiAnalyticsSettingsDto,
    AiCallTypeDto,
} from '../../dto/ai-settings.dto';
import { AiAnalyticsSnapshotStore } from '../../store/ai-analytics-snapshot.store';
import type { OverviewSnapshots } from '../assembler/overview-model.types';
import { CallsLoader } from '../loaders/calls.loader';
import { OverviewSnapshotsLoader } from '../loaders/overview-snapshots.loader';
import {
    AiAnalyticsPortalSettings,
    AiCallReportStatus,
    SettingsLoader,
} from '../loaders/settings.loader';
import {
    toAbsencesDto,
    toRosterConfirmedAt,
    toTargetsDto,
} from '../presenter/settings-blocks.presenter';
import {
    episodeSalesOf,
    modelReadinessOptions,
    sigmaLlmSourceOf,
} from '../presenter/overview-phase2.presenter';
import {
    buildReadiness,
    resolveComparableFrom,
} from '../presenter/readiness.util';

const DAY_MS = 86_400_000;

/** Подвкладки витрины из карты алфавитов (порядок — как в справочнике типов). */
export function buildCallTypes(): AiCallTypeDto[] {
    return CALL_REPORT_CALL_TYPE_CODES.map(code => {
        const kind = AI_ANALYTICS_EVENT_KINDS[code];
        return {
            code,
            title: kind.title,
            tone: kind.tone,
            bucket: kind.bucket,
            kpiPrimaryEventTypeCode: kind.kpiPrimaryEventTypeCode,
        };
    });
}

export interface SettingsUseCaseOptions {
    now?: Date;
}

/**
 * Настройки витрины + готовность (план, 6.2): флаги портала, pipelineEnabled
 * (есть ли разборы за 30 дней), типы звонков из карты алфавитов,
 * comparableFrom по версиям разборов, РОПы.
 *
 * Готовность — тем же адаптером, что и обзор (`readiness.util` +
 * `modelReadinessOptions`): окно счётчиков из месячной модели портала
 * (без неё — период 120 дней), календарь, состав и гипотеза из настроек,
 * продажи — из окна модели (при пустых — из эпизодов прогноза), кап §5.4
 * без модели, источник σ_llm — из последнего отчёта согласия (как у
 * обзора). Иначе `/settings` и обзор показывали бы два разных режима
 * в одном интерфейсе (долг 11 волны C). Одна lite-выборка на оба окна.
 * Статус конвейера разбора (callReport) — чтобы витрина отличала пилот
 * от поломки. Кэшируется контроллером на 300 с.
 */
@Injectable()
export class SettingsUseCase {
    private readonly logger = new Logger(SettingsUseCase.name);

    constructor(
        private readonly calls: CallsLoader,
        private readonly settings: SettingsLoader,
        private readonly snapshots: AiAnalyticsSnapshotStore,
    ) {}

    async execute(
        domain: string,
        options: SettingsUseCaseOptions = {},
    ): Promise<AiAnalyticsSettingsDto> {
        const now = options.now ?? new Date();
        const settings = await this.settings.load(domain);
        const rows = await this.calls.loadLite(
            domain,
            new Date(
                now.getTime() -
                    AI_ANALYTICS_WINDOWS.readinessLookbackDays * DAY_MS,
            ),
            now,
        );
        const pipelineFrom =
            now.getTime() - AI_ANALYTICS_WINDOWS.pipelineLookbackDays * DAY_MS;
        const pipelineEnabled = rows.some(
            row =>
                row.analysisPresent &&
                row.callStartedAt.getTime() >= pipelineFrom,
        );
        const snapshots = await this.loadSnapshots(
            domain,
            toPortalDate(now, settings.calendar.timeZone),
        );
        const sigmaLlmSource = sigmaLlmSourceOf(snapshots.goldenReport);

        return {
            enabled: settings.enabled,
            pipelineEnabled,
            auditEnabled: settings.auditEnabled,
            alertsEnabled: settings.alertsEnabled,
            digestEnabled: settings.digestEnabled,
            readiness: buildReadiness(rows, {
                now,
                enabled: settings.enabled,
                pipelineEnabled,
                ...portalReadinessOptions(settings),
                ...modelReadinessOptions(snapshots.model ?? null),
                financeSales: modelSalesOf(snapshots.model),
                episodeSales: episodeSalesOf(snapshots.forecasts),
                ...(sigmaLlmSource === undefined ? {} : { sigmaLlmSource }),
            }),
            callTypes: buildCallTypes(),
            comparableFrom: resolveComparableFrom(rows),
            ropUserIds: settings.ropUserIds,
            selfViewEnabled: settings.selfViewEnabled,
            dailyPlanEnabled: settings.dailyPlanEnabled,
            digestAllUserIds: settings.digestAllUserIds.map(String),
            poolOptIn: settings.poolOptIn,
            poolConsentAt: settings.poolConsentAt,
            experimentsEnabled: settings.experimentsEnabled,
            targets: toTargetsDto(settings.targets),
            absences: toAbsencesDto(settings.absences),
            rosterConfirmedAt: toRosterConfirmedAt(settings.rosterConfirmedAt),
            ...(settings.callReport === undefined
                ? {}
                : { callReport: toCallReportDto(settings.callReport) }),
        };
    }

    /**
     * Снапшоты Фазы 2 на сегодня: модель портала, прогнозы и отчёт
     * согласия (σ_llm). `ais` не ответила — настройки не гаснут,
     * готовность считается без модели (кап §5.4), как и в обзоре.
     */
    private async loadSnapshots(
        domain: string,
        day: string,
    ): Promise<OverviewSnapshots> {
        try {
            return await new OverviewSnapshotsLoader(this.snapshots).load(
                domain,
                day,
            );
        } catch (error) {
            this.logger.warn(
                `Снапшоты Фазы 2 недоступны (${domain}): ${String(error)}`,
            );
            return {};
        }
    }
}

/**
 * Решения портала для гейтов норм — те же источники, что у сборки модели
 * портала: праздники в календаре, уровни, дата подтверждения состава и
 * пары гипотезы из настроек.
 */
function portalReadinessOptions(
    settings: AiAnalyticsPortalSettings,
): Pick<
    Parameters<typeof buildReadiness>[1],
    | 'calendarImported'
    | 'rosterLevels'
    | 'rosterConfirmedAt'
    | 'hypothesisPairs'
> {
    return {
        calendarImported: settings.calendar.holidays.length > 0,
        rosterLevels: settings.levels.length,
        rosterConfirmedAt: settings.rosterConfirmedAt,
        hypothesisPairs: settings.hypothesis?.pairs.length ?? 0,
    };
}

/**
 * Продажи окна модели портала (`readiness.sales` — закрытые сделки
 * финансов за её окно): у `/settings` нет периода и финансов, поэтому
 * окном продаж служит окно модели. Нагрузка чужая — читается структурно.
 */
function modelSalesOf(model: OverviewSnapshots['model']): number {
    const sales = model?.readiness?.sales;
    return typeof sales === 'number' && Number.isFinite(sales) && sales > 0
        ? Math.floor(sales)
        : 0;
}

/** Статус конвейера разбора → DTO: id пилота строками, как у остальных списков. */
export function toCallReportDto(
    status: AiCallReportStatus,
): AiCallReportStatusDto {
    return {
        enabled: status.enabled,
        pilotUserIds: status.pilotUserIds?.map(String) ?? null,
        salesOnly: status.salesOnly,
        minDurationSec: status.minDurationSec,
    };
}
