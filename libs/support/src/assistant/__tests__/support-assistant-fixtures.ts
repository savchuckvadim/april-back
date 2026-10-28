import { SupportChatView } from '../../desk/domain/support-desk.types';
import { SupportDialogReport } from '../../monitor/application/support-monitor.report';
import { SupportMessage } from '../../monitor/domain/support-dialog.types';
import {
    SupportAnalysis,
    SupportDraft,
} from '../domain/support-assistant.types';

export const LINE = 'april-dev.bitrix24.ru';

export function report(
    overrides: Partial<SupportDialogReport> = {},
): SupportDialogReport {
    return {
        sessionId: 71,
        chatId: 769,
        lineId: 9,
        clientName: 'Соломатова Анна',
        clientPortal: 'alfacentr.bitrix24.ru',
        operatorName: null,
        waitedMinutes: 12,
        pendingText: 'Не открывается отчёт',
        url: `https://${LINE}/online/?IM_DIALOG=chat769`,
        crmUrl: null,
        ...overrides,
    };
}

export function message(
    id: number,
    role: SupportMessage['role'],
    text: string,
    authorName: string | null = role === 'client' ? 'Соломатова Анна' : 'Юлия',
): SupportMessage {
    return {
        id,
        at: new Date(Date.UTC(2026, 9, 28, 8, 0, id)),
        role,
        authorName,
        text,
    };
}

export function chatView(
    overrides: Partial<SupportChatView> = {},
): SupportChatView {
    return {
        domain: LINE,
        chatId: 769,
        url: `https://${LINE}/online/?IM_DIALOG=chat769`,
        client: {
            userId: 500,
            name: 'Соломатова Анна',
            portal: 'alfacentr.bitrix24.ru',
        },
        participants: [],
        messages: [
            message(1, 'client', 'Добрый день! Не открывается отчёт о звонке'),
            message(2, 'other', 'Диалог переведён', null),
        ],
        hasMore: false,
        ...overrides,
    };
}

export function analysis(
    overrides: Partial<SupportAnalysis> = {},
): SupportAnalysis {
    return {
        summary: 'Не открывается отчёт о звонке',
        cause: 'Похоже на карточку «Отчёт о звонке не отправился»',
        draftReply: 'Отчёт не потерялся, он отправится сам.',
        confidence: 'medium',
        needsDeveloper: false,
        taskTitle: null,
        missingInfo: [],
        ...overrides,
    };
}

export function draft(overrides: Partial<SupportDraft> = {}): SupportDraft {
    const body = analysis();
    return {
        id: 'abc123',
        lineDomain: LINE,
        chatId: 769,
        clientName: 'Соломатова Анна',
        clientPortal: 'alfacentr.bitrix24.ru',
        analysis: body,
        replyText: body.draftReply,
        createdAt: '2026-10-28T12:00:00.000Z',
        provider: 'vibecode',
        model: 'BitrixGPT',
        ...overrides,
    };
}

/** Память черновиков в тесте вместо Redis. */
export class MemoryDraftStore {
    readonly drafts = new Map<string, SupportDraft>();
    readonly bindings = new Map<string, string>();

    save = jest.fn((item: SupportDraft) => {
        this.drafts.set(item.id, item);
        return Promise.resolve();
    });
    load = jest.fn((id: string) =>
        Promise.resolve(this.drafts.get(id) ?? null),
    );
    delete = jest.fn((id: string) => {
        this.drafts.delete(id);
        return Promise.resolve();
    });
    bindMessage = jest.fn(
        (chatId: number | string, messageId: number, draftId: string) => {
            this.bindings.set(`${chatId}:${messageId}`, draftId);
            return Promise.resolve();
        },
    );
    draftIdOfMessage = jest.fn((chatId: number | string, messageId: number) =>
        Promise.resolve(this.bindings.get(`${chatId}:${messageId}`) ?? null),
    );
}
