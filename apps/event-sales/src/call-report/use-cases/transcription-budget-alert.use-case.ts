import { Injectable, Logger } from '@nestjs/common';
import {
    TranscriptionSpendService,
    yandexBudgetAlertText,
    yandexBudgetReached,
} from '@lib/call-lib';
import { RedisService } from '@lib/core/redis/redis.service';
import { PortalAiSettingsService } from '@lib/portal-lib/store/ai-settings/portal-ai-settings.service';

/** Отметка «оповещение отправлено» живёт дольше месяца — 40 дней. */
const ALERT_TTL_SEC = 40 * 24 * 60 * 60;

/** Ключ отметки: портал, месяц и сам лимит — подняли лимит, оповестим снова. */
export const yandexBudgetAlertKey = (
    domain: string,
    month: string,
    budgetRub: number,
): string =>
    `transcription:yandex-budget-alert:${domain.toLowerCase()}:${month}:${budgetRub}`;

/** Что показала проверка портала. */
export type YandexBudgetCheck =
    /** Лимит не задан. */
    | 'no-budget'
    /** Расход меньше лимита. */
    | 'below'
    /** Лимит достигнут, оповещение отправлено сейчас. */
    | 'alerted'
    /** Лимит достигнут, оповещение за этот месяц и лимит уже было. */
    | 'already-alerted';

/**
 * Месячный лимит Яндекса портала (16.11.2026, решение владельца — «только
 * оповещение»): расход на распознавание Яндексом дошёл до лимита из настроек
 * AI портала — одно сообщение в телеграм за месяц и значение лимита. Маршрут
 * распознавания не меняется.
 *
 * `@Injectable` без bitrix-состояния: домен приходит параметром.
 */
@Injectable()
export class TranscriptionBudgetAlertUseCase {
    private readonly logger = new Logger(TranscriptionBudgetAlertUseCase.name);

    constructor(
        private readonly portalAiSettings: PortalAiSettingsService,
        private readonly spend: TranscriptionSpendService,
        private readonly redisService: RedisService,
    ) {}

    async check(domain: string, now = new Date()): Promise<YandexBudgetCheck> {
        const record = await this.portalAiSettings.getByDomain(domain);
        const budgetRub = record?.yandexMonthlyBudgetRub ?? null;
        if (budgetRub === null || budgetRub <= 0) return 'no-budget';

        const { month, totals } = await this.spend.yandexMonth(domain, now);
        if (!yandexBudgetReached(totals.rub, budgetRub)) return 'below';

        // Отметка ставится до отправки: две реплики приложения не пришлют
        // одно и то же сообщение дважды.
        const claimed = await this.redisService
            .getClient()
            .set(
                yandexBudgetAlertKey(domain, month, budgetRub),
                now.toISOString(),
                'EX',
                ALERT_TTL_SEC,
                'NX',
            );
        if (!claimed) return 'already-alerted';

        this.logger.warn(
            yandexBudgetAlertText({ domain, month, budgetRub, totals }),
            { telegram: true, domain },
        );
        return 'alerted';
    }
}
