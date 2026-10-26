import {
    escapeBbCode,
    escapeHtml,
    formatSupportBell,
    formatSupportTelegram,
    formatWaitDuration,
    SUPPORT_QUOTE_MAX_LENGTH,
    supportBellTag,
    supportDialogUrl,
} from '../domain/support-signal.formatter';
import {
    SUPPORT_EMPTY_MESSAGE_TEXT,
    toSupportPlainText,
} from '../domain/support-text.util';
import { SupportSignal } from '../domain/support-dialog.types';
import { dialog, message } from './support-fixtures';

const LINE = 'april-dev.bitrix24.ru';

const signal = (overrides: Partial<SupportSignal> = {}): SupportSignal => {
    const pending = message(10, 'client', 0, 'Не открывается отчёт');
    return {
        kind: 'new_dialog',
        dialog: dialog([pending]),
        pending,
        waitedMinutes: 0,
        ...overrides,
    };
};

describe('formatWaitDuration', () => {
    it('минуты и часы без склонений', () => {
        expect(formatWaitDuration(12)).toBe('12 мин');
        expect(formatWaitDuration(65)).toBe('1 ч 5 мин');
        expect(formatWaitDuration(120)).toBe('2 ч');
    });
});

describe('formatSupportBell', () => {
    it('новый диалог: клиент, портал, цитата, оператор и ссылка', () => {
        const text = formatSupportBell(signal(), LINE);
        expect(text.split('\n')).toEqual([
            '[B]Новый вопрос в поддержке[/B]',
            'Клиент: Савчук Вадим, портал alfacentr.bitrix24.ru',
            '«Не открывается отчёт»',
            'Оператор: Муравьева Юлия',
            '[URL=https://april-dev.bitrix24.ru/online/?IM_DIALOG=chat769]Открыть диалог[/URL]',
        ]);
    });

    it('новый диалог, который уже ждёт, показывает время ожидания', () => {
        const text = formatSupportBell(signal({ waitedMinutes: 25 }), LINE);
        expect(text).toContain('Ждёт ответа 25 мин');
    });

    it('напоминание и срочный повтор — в заголовке', () => {
        expect(
            formatSupportBell(
                signal({ kind: 'waiting', waitedMinutes: 12 }),
                LINE,
            ),
        ).toContain('[B]Клиент ждёт ответа 12 мин[/B]');
        expect(
            formatSupportBell(
                signal({ kind: 'escalation', waitedMinutes: 31 }),
                LINE,
            ),
        ).toContain('[B]Клиент ждёт ответа уже 31 мин, нужен ответ[/B]');
    });

    it('диалог без оператора и без портала клиента', () => {
        const base = signal();
        const text = formatSupportBell(
            {
                ...base,
                dialog: {
                    ...base.dialog,
                    operatorId: 0,
                    operatorName: null,
                    client: { ...base.dialog.client, portal: null },
                },
            },
            LINE,
        );
        expect(text).toContain('Клиент: Савчук Вадим\n');
        expect(text).toContain('Пока никто не взял');
    });

    it('скобки клиента не становятся разметкой колокольчика', () => {
        const pending = message(10, 'client', 0, 'смотрите [URL=x]тут[/URL]');
        const text = formatSupportBell(
            signal({ pending, dialog: dialog([pending]) }),
            LINE,
        );
        expect(text).toContain('«смотрите (URL=x)тут(/URL)»');
    });

    it('длинное сообщение обрезается', () => {
        const pending = message(10, 'client', 0, 'а'.repeat(500));
        const text = formatSupportBell(
            signal({ pending, dialog: dialog([pending]) }),
            LINE,
        );
        expect(text).toContain(`«${'а'.repeat(SUPPORT_QUOTE_MAX_LENGTH)}…»`);
    });

    it('без неотвеченного цитирует последнее сообщение клиента', () => {
        const messages = [
            message(10, 'client', 0, 'первое'),
            message(11, 'staff', 1),
            message(12, 'client', 2, 'спасибо'),
            message(13, 'staff', 3),
        ];
        const text = formatSupportBell(
            signal({ pending: null, dialog: dialog(messages) }),
            LINE,
        );
        expect(text).toContain('«спасибо»');
    });
});

describe('formatSupportTelegram', () => {
    it('HTML с экранированием и ссылкой', () => {
        const pending = message(10, 'client', 0, 'a < b & "c"');
        const text = formatSupportTelegram(
            signal({
                kind: 'escalation',
                waitedMinutes: 40,
                pending,
                dialog: dialog([pending]),
            }),
            LINE,
        );
        expect(text.split('\n')[0]).toBe(
            '🔴 <b>Клиент ждёт ответа уже 40 мин, нужен ответ</b>',
        );
        expect(text).toContain('«a &lt; b &amp; &quot;c&quot;»');
        expect(text).toContain(
            '<a href="https://april-dev.bitrix24.ru/online/?IM_DIALOG=chat769">Открыть диалог</a>',
        );
    });
});

describe('вспомогательные', () => {
    it('ссылка, тег и экранирование', () => {
        expect(supportDialogUrl(LINE, 5)).toBe(
            'https://april-dev.bitrix24.ru/online/?IM_DIALOG=chat5',
        );
        expect(supportBellTag(LINE, 71)).toBe(
            'support-monitor:april-dev.bitrix24.ru:71',
        );
        expect(escapeHtml('<b>&')).toBe('&lt;b&gt;&amp;');
        expect(escapeBbCode('[B]x[/B]')).toBe('(B)x(/B)');
    });

    it('текст Битрикса → обычный текст', () => {
        expect(
            toSupportPlainText(
                '[USER=1 REPLACE]Вадим Савчук[/USER] переадресовал диалог на [b]Юлию[/b]',
            ),
        ).toBe('Вадим Савчук переадресовал диалог на Юлию');
        expect(
            toSupportPlainText('[URL=https://x.ru]ссылка[/URL]\n\n  ок'),
        ).toBe('ссылка ок');
        expect(toSupportPlainText('')).toBe(SUPPORT_EMPTY_MESSAGE_TEXT);
        expect(toSupportPlainText(null)).toBe(SUPPORT_EMPTY_MESSAGE_TEXT);
    });
});
