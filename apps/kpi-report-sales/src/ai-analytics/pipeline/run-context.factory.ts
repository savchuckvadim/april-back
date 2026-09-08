/**
 * Сбор контекста одного прогона ночного конвейера (план Фазы 2, поток 12):
 * настройки портала, производственный календарь, реестр параметров, ростер
 * и версии расчёта.
 *
 * Вынесено из `snapshot-pipeline.service.ts` осознанно (риск потока 12
 * «раннер не должен стать богом» и лимит 300 строк на файл): раннер
 * оркеструет прогон, фабрика — собирает его входы. Одна ответственность
 * на класс, методы ≤ 60 строк.
 *
 * `@Injectable` без bitrix-состояния: календарь ходит в портал через
 * загрузчик, который берёт инстанс на вызов (`PBXService.init(domain)`).
 */
import { Injectable } from '@nestjs/common';
import { toPortalDate, WorkCalendar } from '@lib/sales-ai-analytics';
import { AI_ANALYTICS_CALC_VERSION } from '../constants/ai-overview.const';
import {
    AiPipelineRhythm,
    resolvePipelineKeys,
} from '../constants/ai-snapshot.const';
import { AiAnalyticsCalendarLoader } from '../domain/loaders/calendar.loader';
import { ManagersLoader } from '../domain/loaders/managers.loader';
import { AiAnalyticsParamsLoader } from '../domain/loaders/params.loader';
import {
    AiAnalyticsPortalSettings,
    SettingsLoader,
} from '../domain/loaders/settings.loader';
import { AiSnapshotJobData } from '../dto/ai-snapshot.dto';
import { AiPipelineStepContext, buildInputsHash } from '../steps/step.types';

/** Контекст прогона и оговорки его сбора (уезжают в журнал прогона). */
export interface AiPipelineRunContext {
    ctx: AiPipelineStepContext;
    /** Предупреждения календаря: деградация видна руководителю. */
    warnings: string[];
}

/** Календарь прогона и оговорки его получения. */
interface ResolvedCalendar {
    calendar: WorkCalendar;
    warnings: string[];
}

@Injectable()
export class AiPipelineRunContextFactory {
    constructor(
        private readonly settings: SettingsLoader,
        private readonly params: AiAnalyticsParamsLoader,
        private readonly managers: ManagersLoader,
        private readonly calendar: AiAnalyticsCalendarLoader,
    ) {}

    /** Настройки → календарь → ключи периода → реестр и ростер. */
    async build(
        data: AiSnapshotJobData,
        rhythm: AiPipelineRhythm,
        now: Date,
    ): Promise<AiPipelineRunContext> {
        const settings = await this.settings.load(data.domain);
        const { calendar, warnings } = await this.resolveCalendar(
            data.domain,
            settings,
            now,
        );
        const day = data.day ?? toPortalDate(now, calendar.timeZone);
        const keys = resolvePipelineKeys(rhythm, day);
        const [params, managerIds] = await Promise.all([
            this.params.load(data.domain),
            this.managers.resolve(data.domain),
        ]);
        const ctx: AiPipelineStepContext = {
            domain: data.domain,
            rhythm,
            day,
            weekKey: data.weekKey ?? keys.weekKey,
            monthKey: data.monthKey || keys.monthKey,
            timeZone: calendar.timeZone,
            calendar,
            settings,
            registry: params.ctx,
            paramsVersion: params.paramsVersion,
            calcVersion: AI_ANALYTICS_CALC_VERSION,
            comparableFrom: params.comparableFrom,
            inputsHash: '',
            managerIds,
            now,
            forceRefresh: data.forceRefresh ?? false,
        };
        return { ctx: { ...ctx, inputsHash: buildInputsHash(ctx) }, warnings };
    }

    /**
     * Календарь портала: импорт `calendar.settings.get` → переопределение
     * ключом `ai_analytics_calendar` → запасной производственный календарь
     * РФ (всё это внутри загрузчика). Отказ самого загрузчика конвейер не
     * роняет (штатная деградация §5.4): берём календарь настроек портала
     * и объясняем это оговоркой в журнале прогона.
     */
    private async resolveCalendar(
        domain: string,
        settings: AiAnalyticsPortalSettings,
        now: Date,
    ): Promise<ResolvedCalendar> {
        try {
            const result = await this.calendar.load(domain, { now });
            return { calendar: result.calendar, warnings: result.warnings };
        } catch (error) {
            return {
                calendar: settings.calendar,
                warnings: [
                    'Производственный календарь не прочитан ' +
                        `(${(error as Error).message}) — ` +
                        'считаем по календарю настроек портала',
                ],
            };
        }
    }
}
