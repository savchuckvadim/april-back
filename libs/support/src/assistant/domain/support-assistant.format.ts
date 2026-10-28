import { SupportDialogReport } from '../../monitor/application/support-monitor.report';
import {
    escapeHtml,
    formatWaitDuration,
    supportDialogUrl,
} from '../../monitor/domain/support-signal.formatter';
import {
    SUPPORT_CONFIDENCE_LABEL,
    SupportDraft,
} from './support-assistant.types';

/**
 * Пределы показа в Telegram: лимит сообщения 4096, а обрезать HTML
 * посередине тега нельзя — режем сами текстовые поля.
 */
const REPLY_SHOWN_MAX = 2500;
const NOTE_SHOWN_MAX = 600;
const PENDING_SHOWN_MAX = 140;

function clip(text: string, max: number): string {
    const value = text.trim();
    return value.length > max ? `${value.slice(0, max - 1).trimEnd()}…` : value;
}

const clientTitle = (name: string | null, portal: string | null): string =>
    `${escapeHtml(name ?? 'клиент')}${portal ? ` · ${escapeHtml(portal)}` : ''}`;

/** Разбор и черновик для Telegram-чата поддержки (HTML). */
export function formatDraftTelegram(draft: SupportDraft): string {
    const { analysis } = draft;
    const lines = [
        `🧠 <b>Разбор: ${clientTitle(draft.clientName, draft.clientPortal)}</b>`,
        `<b>Суть.</b> ${escapeHtml(clip(analysis.summary, NOTE_SHOWN_MAX))}`,
        `<b>Причина.</b> ${escapeHtml(clip(analysis.cause, NOTE_SHOWN_MAX))} ` +
            `(уверенность: ${SUPPORT_CONFIDENCE_LABEL[analysis.confidence]})`,
    ];
    if (analysis.needsDeveloper) {
        lines.push(
            `🛠 Нужен разработчик${analysis.taskTitle ? `: «${escapeHtml(analysis.taskTitle)}»` : ''}`,
        );
    }
    if (analysis.missingInfo.length) {
        lines.push(
            `❓ Не хватает: ${escapeHtml(analysis.missingInfo.join('; '))}`,
        );
    }
    lines.push(
        '',
        '<b>Черновик ответа клиенту:</b>',
        `<blockquote>${escapeHtml(clip(draft.replyText, REPLY_SHOWN_MAX))}</blockquote>`,
        '',
        `<a href="${escapeHtml(supportDialogUrl(draft.lineDomain, draft.chatId))}">Открыть диалог</a>`,
        '<i>Отправить — кнопка ниже. Поправить — ответьте на это сообщение новым текстом.</i>',
    );
    return lines.join('\n');
}

/** Список открытых диалогов: кто ждёт дольше — выше. */
export function formatDialogsTelegram(
    dialogs: readonly SupportDialogReport[],
): string {
    if (!dialogs.length) {
        return '📭 Открытых диалогов в поддержке нет.';
    }
    const sorted = [...dialogs].sort(
        (a, b) => b.waitedMinutes - a.waitedMinutes,
    );
    const lines = [`📬 <b>Открытые диалоги: ${sorted.length}</b>`];
    for (const dialog of sorted) {
        const waiting =
            dialog.waitedMinutes > 0
                ? `ждёт ${formatWaitDuration(dialog.waitedMinutes)}`
                : 'ответили';
        const operator = dialog.operatorName
            ? `у ${escapeHtml(dialog.operatorName)}`
            : 'никто не взял';
        lines.push(
            '',
            `• <b>${clientTitle(dialog.clientName, dialog.clientPortal)}</b> — ${waiting}, ${operator}`,
        );
        if (dialog.pendingText) {
            lines.push(
                `  «${escapeHtml(clip(dialog.pendingText, PENDING_SHOWN_MAX))}»`,
            );
        }
        lines.push(`  разбор: /analyze ${dialog.chatId}`);
    }
    return lines.join('\n');
}

/** Диалог по запросу не нашёлся или нашлось несколько — подсказать выбор. */
export function formatLookupMiss(
    query: string,
    lookup: {
        candidates: readonly SupportDialogReport[];
        dialogs: readonly SupportDialogReport[];
    },
): string {
    if (lookup.candidates.length > 1) {
        return [
            `🤔 Под «${escapeHtml(query)}» подходят несколько диалогов, уточните номер:`,
            ...lookup.candidates.map(
                dialog =>
                    `• ${clientTitle(dialog.clientName, dialog.clientPortal)} — /analyze ${dialog.chatId}`,
            ),
        ].join('\n');
    }
    const head = query.trim()
        ? `🔍 Открытого диалога «${escapeHtml(query)}» не нашёл.`
        : 'Укажите, кого разобрать: «разбери Иванова» или /analyze 769.';
    return `${head}\n\n${formatDialogsTelegram(lookup.dialogs)}`;
}

/** Подсказка по командам бота. */
export function formatAssistantHelp(): string {
    return [
        '🤖 <b>ИИ-помощник поддержки</b>',
        '',
        '• «что в поддержке» или /dialogs — открытые диалоги: кто ждёт и сколько.',
        '• «разбери Иванова» или /analyze 769 — причина и черновик ответа клиенту.',
        '• Под черновиком кнопки: «Отправить клиенту», «Задача разработчику», «Убрать».',
        '• Поправить черновик — ответьте на сообщение с ним новым текстом.',
        '',
        'Клиенту уходит только то, что подтвердил человек кнопкой.',
    ].join('\n');
}
