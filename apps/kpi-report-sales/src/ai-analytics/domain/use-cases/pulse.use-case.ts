import { Injectable, Logger } from '@nestjs/common';
import {
    computePulse,
    lastWorkdays,
    previousWorkday,
    PULSE_DEFAULTS,
    resolveNumberParam,
    toPortalDate,
    toScore10,
} from '@lib/sales-ai-analytics';
import { AI_ANALYTICS_WINDOWS } from '../../constants/ai-analytics.const';
import { AiPulseDto } from '../../dto/ai-pulse.dto';
import { AiAnalyticsFeedbackStore } from '../../store/ai-analytics-feedback.store';
import { AiAnalyticsCalendarLoader } from '../loaders/calendar.loader';
import { CallsLoader } from '../loaders/calls.loader';
import { toPulseRow } from '../loaders/lite-row.mapper';
import { portalMinDurationByType } from '../loaders/min-duration.util';
import { portalRangeUtc } from '../loaders/period.util';
import { PulseTelephonyLoader } from '../loaders/pulse-telephony.loader';
import {
    AiAnalyticsPortalSettings,
    SettingsLoader,
} from '../loaders/settings.loader';
import { SmartLinkLoader } from '../loaders/smart-link.loader';
import { AlertMarks, collectPulseAlerts } from '../presenter/pulse-alerts.util';
import { toPulseDto, withPulseAlertLinks } from '../presenter/pulse.presenter';
import { portalRegistryOf } from '../presenter/readiness-stages.util';

/**
 * Единый порог «разбираемого» звонка живёт в
 * `domain/loaders/min-duration.util` (его же читают шаги calls/finance
 * конвейера); реэкспорт держит прежний публичный путь фичи (`index.ts`)
 * без правки барреля.
 */
export { portalMinDurationByType } from '../loaders/min-duration.util';

/** Более поздний из двух моментов. */
const laterOf = (left: Date, right: Date): Date =>
    left.getTime() >= right.getTime() ? left : right;

/**
 * Минимум разборов сотрудника за окно для его строки в пульсе: код
 * реестра `pulse_manager_min_n` со слоем портала
 * (`ai_analytics_model_params`); значение вне диапазона реестр сам
 * откатывает к дефолту.
 */
export function pulseManagerMinN(
    settings: Pick<
        AiAnalyticsPortalSettings,
        'modelParams' | 'definitions' | 'targets'
    >,
): number {
    return (
        resolveNumberParam('pulse_manager_min_n', portalRegistryOf(settings)) ??
        PULSE_DEFAULTS.managerMinN
    );
}

export interface PulseUseCaseOptions {
    /** «Сейчас» (для тестов и крона); по умолчанию — текущее время. */
    now?: Date;
}

/**
 * Пульс дисциплины «следующий шаг с датой» (план, 6.2/6.3): окно из 5
 * рабочих дней до вчерашнего рабочего дня в TZ портала, история 25
 * рабочих дней для XmR, сигналы руководителю по звонкам окна. Строка
 * сотрудника — с порога портала `pulse_manager_min_n` (дефолт реестра 8);
 * применённый порог и порог «короткого» звонка уходят в ответ, чтобы
 * витрина не писала числа наугад.
 *
 * Рабочие дни — по производственному календарю портала, тому же, что у
 * ночного конвейера (AiAnalyticsCalendarLoader: календарь Битрикса → РФ),
 * а не по JSON настроек без праздников (05.11.2026: 04.11 считался
 * рабочим). День без единого звонка в выборке — выходной, которого не
 * знает и календарь: окно берёт день раньше (skipDaysWithoutCalls).
 * Доля коротких разговоров — из телефонии (PulseTelephonyLoader).
 *
 * Отметки алертов (alert_sent / alert_handled) читаются до момента запроса,
 * а не до конца окна: «Отработано», поставленное сегодня по звонку окна,
 * видно сразу. Запись alert_handled сбрасывает кэш пульса домена
 * (FeedbackUseCase), поэтому следующий запрос пересчитывает отметки.
 *
 * Каждый сигнал несёт ссылку на карточку разбора в смарте «AI-анализ
 * звонков» (SmartLinkLoader, как в повестке и «Внимании»): один вызов
 * загрузчика на все сигналы окна; fail-open — без элемента смарта или при
 * ошибке загрузчика link = null, пульс отдаётся без ссылок.
 *
 * Результат — на весь домен (кэшируется контроллером); периметр
 * requester'а применяется presenter'ом при отдаче.
 */
@Injectable()
export class PulseUseCase {
    private readonly logger = new Logger(PulseUseCase.name);

    constructor(
        private readonly calls: CallsLoader,
        private readonly settings: SettingsLoader,
        private readonly feedback: AiAnalyticsFeedbackStore,
        private readonly smartLinks: SmartLinkLoader,
        private readonly calendars: AiAnalyticsCalendarLoader,
        private readonly telephony: PulseTelephonyLoader,
    ) {}

    /**
     * День ключа кэша: «сегодня» в TZ портала. Не последний день окна:
     * его считает календарь с Битрикса, а резюме (без PBX) должно найти
     * пульс тем же ключом — «сегодня» оба знают одинаково.
     */
    async resolveCacheDay(domain: string, now = new Date()): Promise<string> {
        const { calendar } = await this.settings.load(domain);
        return toPortalDate(now, calendar.timeZone);
    }

    async execute(
        domain: string,
        options: PulseUseCaseOptions = {},
    ): Promise<AiPulseDto> {
        const now = options.now ?? new Date();
        const settings = await this.settings.load(domain);
        const { calendar } = await this.calendars.load(domain, { now });
        const endDate = previousWorkday(
            toPortalDate(now, calendar.timeZone),
            calendar,
        );
        const history = lastWorkdays(
            endDate,
            AI_ANALYTICS_WINDOWS.pulseHistoryWorkdays,
            calendar,
        );
        const { from, to } = portalRangeUtc(
            history[0] ?? endDate,
            endDate,
            calendar.timeZone,
        );

        const [rows, marks] = await Promise.all([
            this.calls.loadLite(domain, from, to),
            // Окно звонков — до конца вчерашнего рабочего дня, отметки — до
            // «сейчас» (с тем же началом: отметка не старше звонка).
            this.loadAlertMarks(domain, from, laterOf(to, now)),
        ]);
        const result = computePulse(rows.map(toPulseRow), {
            endDate,
            calendar,
            historyWorkdays: AI_ANALYTICS_WINDOWS.pulseHistoryWorkdays,
            minDurationSecByType: portalMinDurationByType(settings),
            managerMinN: pulseManagerMinN(settings),
            skipDaysWithoutCalls: true,
        });
        const alerts = collectPulseAlerts(
            rows,
            result.window,
            calendar.timeZone,
            marks,
        );
        // Ссылки одним вызовом: сигналы и звонки-примеры «С кем поработать».
        const exampleIds = result.byManager.flatMap(row => [
            ...row.noDateCallIds,
            ...(row.dateCallId ? [row.dateCallId] : []),
        ]);
        const [links, shortShare] = await Promise.all([
            this.resolveLinks(domain, [
                ...alerts.map(alert => alert.transcriptionId),
                ...exampleIds,
            ]),
            this.telephony.shortShare(domain, {
                from: result.window.from,
                to: result.window.to,
                timeZone: calendar.timeZone,
                minDurationSec: result.minDurationSec,
                callReport: settings.callReport,
            }),
        ]);
        const byId = new Map(rows.map(row => [row.transcriptionId, row]));
        return toPulseDto(
            endDate,
            result,
            withPulseAlertLinks(alerts, links),
            shortShare,
            (transcriptionId: string) => {
                const row = byId.get(transcriptionId);
                return {
                    transcriptionId,
                    callStartedAt: row?.callStartedAt.toISOString() ?? null,
                    link: links.get(transcriptionId) ?? null,
                    // Оценка образца уходит витрине: «образец» должен быть
                    // объясним («8,4 из 10»), а не просто ссылкой.
                    score: toScore10(row?.score),
                };
            },
        );
    }

    /** Отправленные/отработанные алерты по звонкам (ais feedback). */
    private async loadAlertMarks(
        domain: string,
        from: Date,
        to: Date,
    ): Promise<AlertMarks> {
        const records = await this.feedback.listInPeriod(domain, from, to);
        const sent = new Set<string>();
        const handled = new Set<string>();
        for (const record of records) {
            if (!record.transcriptionId) continue;
            if (record.kind === 'alert_sent') sent.add(record.transcriptionId);
            if (record.kind === 'alert_handled') {
                handled.add(record.transcriptionId);
            }
        }
        return { sent, handled };
    }

    /**
     * Ссылки на карточки разборов (сигналы и звонки-примеры) одним вызовом
     * загрузчика (он сам ходит в смарт и ais пачкой по всем id). Fail-open:
     * ошибка загрузчика → пустая карта, у всех link = null.
     */
    private async resolveLinks(
        domain: string,
        transcriptionIds: readonly string[],
    ): Promise<ReadonlyMap<string, string | null>> {
        const ids = [...new Set(transcriptionIds)];
        if (!ids.length) return new Map();
        try {
            return await this.smartLinks.resolveLinks(domain, ids);
        } catch (error) {
            this.logger.warn(
                `Ссылки на разборы пульса (${domain}) не построены: ${(error as Error).message}`,
            );
            return new Map();
        }
    }
}
