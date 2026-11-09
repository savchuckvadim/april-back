import { Injectable, Logger } from '@nestjs/common';
import { SupportTelegramNotifier } from '@lib/support';
import { TelegramSendWindow } from '@lib/telegram';
import { formatSiteBriefMessages } from './domain/site-brief.message';
import {
    SITE_BRIEF_DEADLINE_MS,
    SITE_BRIEF_PART_PAUSE_MS,
    type SiteBrief,
    type SiteBriefSubmitResult,
} from './domain/site-brief.types';
import { formatSiteLeadMessage } from './domain/site-lead.message';
import {
    SITE_LEAD_MAX_PER_MINUTE,
    type SiteLead,
    type SiteLeadSubmitResult,
} from './domain/site-lead.types';

/**
 * Доставка заявок и брифов с сайта в чат «April Client» — тем же ботом и в
 * тот же чат, что сигналы поддержки (SUPPORT_TELEGRAM_BOT_TOKEN и
 * SUPPORT_TELEGRAM_CHAT_ID в админке, иначе env приложения bot).
 *
 * В отличие от публичной ручки тревог /telegram, итог честный: «доставлено»
 * только когда Telegram принял сообщение, — сайт по нему решает, показать
 * «заявка у нас» или телефон для связи.
 */
@Injectable()
export class SiteLeadService {
    private readonly logger = new Logger(SiteLeadService.name);
    /** Один предохранитель на заявки и брифы: чат у них общий. */
    private readonly window = new TelegramSendWindow(SITE_LEAD_MAX_PER_MINUTE);

    constructor(private readonly notifier: SupportTelegramNotifier) {}

    async submit(lead: SiteLead): Promise<SiteLeadSubmitResult> {
        if (!this.window.tryConsume(this.now())) {
            this.warnThrottled(lead.page);
            return 'throttled';
        }
        if (!(await this.notifier.send(formatSiteLeadMessage(lead)))) {
            this.reportUndelivered(`Заявка (${lead.kind})`, lead.page);
            return 'failed';
        }
        return 'delivered';
    }

    /**
     * Бриф уходит частями по порядку, с паузой: Telegram ограничивает частоту
     * сообщений в группе. Первая же недоставленная часть — «не доставлено»:
     * сайт предложит повторить, а в чате будет видно, что пришло не всё.
     */
    async submitBrief(brief: SiteBrief): Promise<SiteBriefSubmitResult> {
        const messages = formatSiteBriefMessages(brief);
        // Все части разом: бриф, которому не хватит места в окне, не начинаем,
        // чтобы не оставить в чате половину и не задвоить её при повторе.
        if (!this.window.tryConsume(this.now(), messages.length)) {
            this.warnThrottled(brief.page ?? '—');
            return { status: 'throttled', parts: 0 };
        }
        const startedAt = this.now();
        for (const [index, html] of messages.entries()) {
            if (index > 0) {
                if (this.now() - startedAt > SITE_BRIEF_DEADLINE_MS) {
                    this.reportUndelivered(
                        `Бриф (${brief.kind}) не уложился в срок: отправлено ${index} из ${messages.length} частей,`,
                        brief.page ?? '—',
                    );
                    return { status: 'failed', parts: index };
                }
                await this.pause(SITE_BRIEF_PART_PAUSE_MS);
            }
            if (!(await this.notifier.send(html))) {
                this.reportUndelivered(
                    `Бриф (${brief.kind}), часть ${index + 1} из ${messages.length},`,
                    brief.page ?? '—',
                );
                return { status: 'failed', parts: index };
            }
        }
        return { status: 'delivered', parts: messages.length };
    }

    /** Пауза между частями брифа; в тестах подменяется на мгновенную. */
    protected pause(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /** Часы сервиса; в тестах подменяются, чтобы проверить срок брифа. */
    protected now(): number {
        return Date.now();
    }

    private warnThrottled(page: string): void {
        this.logger.warn(
            `Сайт: больше ${SITE_LEAD_MAX_PER_MINUTE} отправок в минуту — отправка со страницы ${page} отклонена`,
        );
    }

    /** Без имён и телефонов: в логах не место персональным данным. */
    private reportUndelivered(what: string, page: string): void {
        this.logger.error(
            `${what} со страницы ${page} не доставлена в Telegram — посетитель увидит телефон для связи`,
        );
    }
}
