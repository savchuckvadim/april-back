import type {
    BitrixService,
    IBXImOpenlinesV2Session,
    IBXImOpenlinesV2SessionListRequest,
    IBXImOpenlinesV2SessionListResponse,
} from '@lib/bitrix';
import { BX_IMOPENLINES_SESSION_LIST_MAX_LIMIT } from '@lib/bitrix';
import type { IBXImV2ChatMessageTailResponse } from '@lib/bitrix/domain/chat/im-v2-chat-message';
import {
    SUPPORT_OPEN_STATUSES,
    SupportDialog,
    SupportOpenStatus,
} from '../domain/support-dialog.types';
import { toSupportDialog } from './support-dialog.mapper';
import { runSupportBatch } from './support-batch.util';

/** Глубина поиска открытых диалогов: старше — уже не «ждёт ответа». */
export const SUPPORT_LOOKBACK_DAYS = 30;
/** Сколько последних сообщений брать по диалогу. */
export const SUPPORT_TAIL_LIMIT = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

const sessionsKey = (status: SupportOpenStatus): string => `sessions_${status}`;
const tailKey = (sessionId: number): string => `tail_${sessionId}`;

export interface SupportLineReadResult {
    dialogs: SupportDialog[];
    /** Что прочитать не удалось — диалоги всё равно разобраны без переписки. */
    warnings: string[];
}

export interface SupportLineReadOptions {
    /** CONFIG_ID линии; 0 — все линии портала. */
    lineId: number;
    now: Date;
}

/**
 * Чтение открытых диалогов линии за ДВЕ пачки:
 * 1) списки сессий в статусах «новый» и «взят оператором»;
 * 2) последние сообщения каждого диалога.
 *
 * Не Injectable: создаётся на такт с инстансом Битрикса портала линии
 * (`new SupportLineReader(bitrix)`), чтобы пачки копились и уходили в
 * ОДНОМ инстансе и не смешивались с чужими (CLAUDE.md: без this.bitrix в
 * Injectable-сервисах).
 */
export class SupportLineReader {
    constructor(private readonly bitrix: BitrixService) {}

    async readOpenDialogs(
        options: SupportLineReadOptions,
    ): Promise<SupportLineReadResult> {
        const warnings: string[] = [];
        const sessions = await this.readSessions(options, warnings);
        if (!sessions.length) return { dialogs: [], warnings };

        const tails = await this.readTails(sessions, warnings);
        const dialogs = sessions
            .map(session =>
                toSupportDialog(session, tails.get(session.id) ?? null),
            )
            .filter((dialog): dialog is SupportDialog => dialog !== null);
        return { dialogs, warnings };
    }

    private async readSessions(
        { lineId, now }: SupportLineReadOptions,
        warnings: string[],
    ): Promise<IBXImOpenlinesV2Session[]> {
        const base: IBXImOpenlinesV2SessionListRequest = {
            dateCreateFrom: new Date(
                now.getTime() - SUPPORT_LOOKBACK_DAYS * DAY_MS,
            ).toISOString(),
            limit: BX_IMOPENLINES_SESSION_LIST_MAX_LIMIT,
            ...(lineId > 0 ? { configId: lineId } : {}),
        };
        for (const status of SUPPORT_OPEN_STATUSES) {
            this.bitrix.batch.imOpenlinesV2Session.list(sessionsKey(status), {
                ...base,
                status,
            });
        }
        const { results, errors } = await runSupportBatch(this.bitrix);

        const byId = new Map<number, IBXImOpenlinesV2Session>();
        for (const status of SUPPORT_OPEN_STATUSES) {
            const key = sessionsKey(status);
            if (errors[key]) {
                // Без списка диалогов судить не о чем: молча пропущенный
                // статус выглядел бы как «все ответили».
                throw new Error(
                    `Список диалогов линии не прочитан (${status}): ${errors[key]}`,
                );
            }
            const page = results[key] as
                | IBXImOpenlinesV2SessionListResponse
                | undefined;
            if (page?.hasNextPage) {
                warnings.push(
                    `открытых диалогов в статусе ${status} больше ${BX_IMOPENLINES_SESSION_LIST_MAX_LIMIT} — разобраны первые`,
                );
            }
            for (const session of page?.sessions ?? []) {
                byId.set(session.id, session);
            }
        }
        return [...byId.values()];
    }

    private async readTails(
        sessions: readonly IBXImOpenlinesV2Session[],
        warnings: string[],
    ): Promise<Map<number, IBXImV2ChatMessageTailResponse>> {
        for (const session of sessions) {
            this.bitrix.batch.imV2ChatMessage.tail(tailKey(session.id), {
                dialogId: `chat${session.chatId}`,
                limit: SUPPORT_TAIL_LIMIT,
            });
        }
        const { results, errors } = await runSupportBatch(this.bitrix);

        const tails = new Map<number, IBXImV2ChatMessageTailResponse>();
        for (const session of sessions) {
            const key = tailKey(session.id);
            const tail = results[key] as
                | IBXImV2ChatMessageTailResponse
                | undefined;
            if (tail && Array.isArray(tail.messages)) {
                tails.set(session.id, tail);
                continue;
            }
            warnings.push(
                `переписка диалога ${session.id} не прочитана${errors[key] ? `: ${errors[key]}` : ''}`,
            );
        }
        return tails;
    }
}
