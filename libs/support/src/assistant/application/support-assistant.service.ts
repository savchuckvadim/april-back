import { randomBytes } from 'crypto';
import {
    BadRequestException,
    Injectable,
    Logger,
    NotFoundException,
} from '@nestjs/common';
import { StructuredLlmGateway } from '@lib/llm-gateway';
import { SupportDeskService } from '../../desk/application/support-desk.service';
import { SUPPORT_REPLY_MAX_LENGTH } from '../../desk/domain/support-desk.text';
import {
    SupportClientErrors,
    SupportReplyResult,
    SupportTaskResult,
} from '../../desk/domain/support-desk.types';
import { SupportMonitorSettingsService } from '../../monitor/application/support-monitor-settings.service';
import { SupportDialogReport } from '../../monitor/application/support-monitor.report';
import {
    buildAnalysisContent,
    SUPPORT_ASSISTANT_SYSTEM_PROMPT,
} from '../domain/support-assistant.prompt';
import {
    parseSupportAnalysis,
    SUPPORT_ANALYSIS_SCHEMA,
    SUPPORT_ANALYSIS_SCHEMA_NAME,
} from '../domain/support-assistant.schema';
import { SupportDraft } from '../domain/support-assistant.types';
import { findDialogByQuery } from '../domain/support-dialog.lookup';
import { SupportDraftStore } from '../infrastructure/support-draft.store';

/** Сколько последних сообщений чата отдаём модели. */
const ANALYSIS_MESSAGES = 30;
/** Окно ошибок портала клиента для разбора. */
const ERRORS_HOURS = 24;
/** Длина названия задачи Битрикса. */
const TASK_TITLE_MAX = 250;

/** Итог поиска диалога по запросу человека. */
export interface SupportDialogLookup {
    lineDomain: string;
    /** Единственный подходящий диалог; null — не нашли или нашли несколько. */
    dialog: SupportDialogReport | null;
    /** Подходящие диалоги, когда их больше одного. */
    candidates: SupportDialogReport[];
    /** Все открытые диалоги — подсказать, из чего выбирать. */
    dialogs: SupportDialogReport[];
}

/**
 * ИИ-помощник поддержки — серверный «мозг» (решение владельца 28.10.2026:
 * провайдер — шлюз LLM с VibeCode на портале линии, Anthropic — настройкой).
 * Читает переписку и ошибки портала клиента через стойку, получает разбор по
 * strict-схеме, хранит черновик в Redis. Клиенту пишет ТОЛЬКО `send` после
 * явного «да» человека — кнопка в Telegram и есть это «да».
 *
 * `@Injectable` без bitrix-состояния: инстансы Битрикса — внутри стойки.
 */
@Injectable()
export class SupportAssistantService {
    private readonly logger = new Logger(SupportAssistantService.name);

    constructor(
        private readonly desk: SupportDeskService,
        private readonly llm: StructuredLlmGateway,
        private readonly drafts: SupportDraftStore,
        private readonly settings: SupportMonitorSettingsService,
    ) {}

    /** Открытые диалоги линии — для входов (Telegram). */
    async listDialogs(domain?: string) {
        return this.desk.listDialogs(domain);
    }

    /** Диалог по номеру чата или части имени клиента («разбери Соломатову»). */
    async findDialog(
        query: string,
        domain?: string,
    ): Promise<SupportDialogLookup> {
        const list = await this.desk.listDialogs(domain);
        const { dialog, candidates } = findDialogByQuery(list.dialogs, query);
        return {
            lineDomain: list.domain,
            dialog,
            candidates,
            dialogs: list.dialogs,
        };
    }

    /** Разбор диалога: причина, черновик, нужен ли разработчик. */
    async analyze(chatId: number, domain?: string): Promise<SupportDraft> {
        const view = await this.desk.readDialog(
            chatId,
            ANALYSIS_MESSAGES,
            domain,
        );
        const errors = await this.clientErrorsOf(view.client?.portal ?? null);
        const response = await this.llm.structuredCompletionWithUsage(
            SUPPORT_ASSISTANT_SYSTEM_PROMPT,
            buildAnalysisContent({ view, errors }),
            SUPPORT_ANALYSIS_SCHEMA_NAME,
            SUPPORT_ANALYSIS_SCHEMA,
            view.domain,
        );
        const analysis = parseSupportAnalysis(response.result);
        const draft: SupportDraft = {
            id: randomBytes(6).toString('hex'),
            lineDomain: view.domain,
            chatId,
            clientName: view.client?.name ?? null,
            clientPortal: view.client?.portal ?? null,
            analysis,
            replyText: analysis.draftReply,
            createdAt: new Date().toISOString(),
            provider: response.provider,
            model: response.model,
        };
        await this.drafts.save(draft);
        this.logger.log(
            `Разбор диалога ${view.domain} чат ${chatId}: ${response.provider}/${response.model ?? '?'}, ` +
                `уверенность ${analysis.confidence}, разработчик ${analysis.needsDeveloper ? 'нужен' : 'не нужен'}`,
        );
        return draft;
    }

    getDraft(id: string): Promise<SupportDraft | null> {
        return this.drafts.load(id);
    }

    /** Человек поправил текст ответа — черновик обновлён, отправки нет. */
    async revise(id: string, replyText: string): Promise<SupportDraft> {
        const draft = await this.requireDraft(id);
        const text = replyText.trim().slice(0, SUPPORT_REPLY_MAX_LENGTH);
        if (!text) throw new BadRequestException('Пустой текст ответа');
        const revised: SupportDraft = { ...draft, replyText: text };
        await this.drafts.save(revised);
        return revised;
    }

    /**
     * Отправка клиенту — ТОЛЬКО после явного «да» человека.
     * @param confirmedBy кто подтвердил — в журнал и в Telegram-чат.
     */
    async send(
        id: string,
        confirmedBy: string,
    ): Promise<{ draft: SupportDraft; result: SupportReplyResult }> {
        const draft = await this.requireDraft(id);
        const result = await this.desk.reply(
            draft.chatId,
            draft.replyText,
            confirmedBy,
            draft.lineDomain,
        );
        await this.drafts.delete(id);
        return { draft, result };
    }

    /** Задача разработчику по черновику — первому получателю колокольчика. */
    async createTask(id: string): Promise<SupportTaskResult> {
        const draft = await this.requireDraft(id);
        const options = await this.settings.resolveOptions(draft.lineDomain);
        const [responsibleId] = options.notifyUserIds;
        if (!responsibleId) {
            throw new BadRequestException(
                'Некому ставить задачу: получатели колокольчика не заданы',
            );
        }
        const { analysis } = draft;
        return this.desk.createTask(
            {
                title: (
                    analysis.taskTitle ?? `Поддержка: ${analysis.summary}`
                ).slice(0, TASK_TITLE_MAX),
                description: [
                    analysis.summary,
                    '',
                    `Причина: ${analysis.cause}`,
                    '',
                    `Клиент: ${draft.clientName ?? '—'}${draft.clientPortal ? ` (${draft.clientPortal})` : ''}`,
                ].join('\n'),
                responsibleId,
                chatId: draft.chatId,
            },
            draft.lineDomain,
        );
    }

    async discard(id: string): Promise<void> {
        await this.drafts.delete(id);
    }

    private async requireDraft(id: string): Promise<SupportDraft> {
        const draft = await this.drafts.load(id);
        if (!draft) {
            throw new NotFoundException(
                'Черновик не найден или устарел — попросите разбор заново',
            );
        }
        return draft;
    }

    /** Ошибки портала клиента — контекст, а не условие: не прочитались — разбираем без них. */
    private async clientErrorsOf(
        portal: string | null,
    ): Promise<SupportClientErrors | null> {
        if (!portal) return null;
        try {
            return await this.desk.clientErrors(portal, ERRORS_HOURS);
        } catch (error) {
            this.logger.warn(
                `Ошибки портала ${portal} для разбора не прочитаны: ${(error as Error).message}`,
            );
            return null;
        }
    }
}
