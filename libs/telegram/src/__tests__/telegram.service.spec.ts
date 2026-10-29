import { of, throwError } from 'rxjs';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { TelegramService } from '../telegram.service';
import {
    TelegramSendMessageDto,
    TELEGRAM_FIELD_MAX_LENGTH,
    TELEGRAM_TEXT_MAX_LENGTH,
} from '../telegram.dto';
import {
    TELEGRAM_MAX_MESSAGES_PER_MINUTE,
    TELEGRAM_MAX_MESSAGE_LENGTH,
    TELEGRAM_THROTTLE_WINDOW_MS,
    TelegramSendWindow,
    toTelegramMarkdownText,
} from '../telegram-message.util';

/**
 * Единственный канал тревог монорепо (ручка /telegram, логгер-транспорт,
 * внутренние отправители). Обещания:
 *  - отправка идёт прямо в Bot API через исходящий прокси, реле нет;
 *  - WITH_TELEGRAM≠true или нет ключей — канал выключен, в сеть не ходим;
 *  - ошибка Telegram API не роняет вызвавший поток (тревога — не бизнес);
 *  - зацикленный клиент упирается в окно 20/мин, а не в лимиты Bot API;
 *  - Markdown-экранирование не ломает доставку и не мусорит стек-трейсы.
 */
type Cfg = Record<string, string | undefined>;

const ENABLED_CFG: Cfg = {
    WITH_TELEGRAM: 'true',
    TELEGRAM_BOT_TOKEN: 'test-token',
    TELEGRAM_ADMIN_CHAT_ID: '-100',
    APP_NAME: 'event-sales',
};

/** Прокси настроен, api.telegram.org в списке: адрес переписан, токен заголовком. */
const proxiedEgress = {
    route: (url: string) => ({
        url: `https://eu-proxy.example.com/p/api.telegram.org${new URL(url).pathname}`,
        headers: { 'X-Egress-Token': 'secret' },
        viaProxy: true,
    }),
    status: () => ({
        enabled: true,
        proxyHost: 'eu-proxy.example.com',
        hosts: ['api.telegram.org'],
    }),
};

const makeService = (
    cfg: Cfg,
    postImpl?: jest.Mock,
    egress: typeof proxiedEgress = proxiedEgress,
) => {
    const post = postImpl ?? jest.fn().mockReturnValue(of({ data: {} }));
    const configService = { get: jest.fn((key: string) => cfg[key]) };
    const service = new TelegramService(
        { post } as never,
        configService as never,
        egress as never,
    );
    const warn = jest
        .spyOn(service['logger'], 'warn')
        .mockImplementation(() => undefined);
    return { service, post, warn };
};

const dto = (over: Partial<TelegramSendMessageDto> = {}) =>
    ({
        app: 'event-sales-front',
        text: 'crm.contact.add failed',
        domain: 'example.bitrix24.ru',
        userId: '447',
        ...over,
    }) as TelegramSendMessageDto;

type PostCall = [string, Record<string, unknown>];

describe('TelegramService', () => {
    it('включён: шлёт в Bot API через прокси с chat_id и Markdown, маркер приложения как есть', async () => {
        const { service, post } = makeService(ENABLED_CFG);
        expect(service.enabled).toBe(true);

        await service.sendPublicMessage(dto());

        const [url, payload] = post.mock.calls[0] as PostCall;
        expect(url).toBe(
            'https://eu-proxy.example.com/p/api.telegram.org/bottest-token/sendMessage',
        );
        expect(payload.chat_id).toBe('-100');
        expect(payload.parse_mode).toBe('Markdown');
        expect(String(payload.text)).toContain('event-sales-front');
    });

    it('префикс приложения: обычное сообщение и ошибка админки подписаны именем приложения', async () => {
        const { service, post } = makeService(ENABLED_CFG);
        await service.sendMessage('boom');
        await service.sendMessageAdminError('boom');
        const texts = (post.mock.calls as PostCall[]).map(call =>
            String(call[1].text),
        );
        expect(texts[0]).toBe('NEST event-sales: boom');
        expect(texts[1]).toBe('NEST event-sales ADMIN ERROR: boom');
    });

    /*
     * Требование владельца: отправка тревоги не должна ломать
     * бизнес-операцию. Ошибка Bot API глотается, вызвавший поток жив.
     */
    it('ошибка Telegram API не роняет вызвавший поток', async () => {
        const consoleSpy = jest
            .spyOn(console, 'error')
            .mockImplementation(() => undefined);
        const failingPost = jest
            .fn()
            .mockReturnValue(throwError(() => new Error('429 Too Many')));
        const { service } = makeService(ENABLED_CFG, failingPost);

        await expect(service.sendPublicMessage(dto())).resolves.toContain(
            'event-sales-front',
        );
        await expect(service.sendMessage('boom')).resolves.toBeUndefined();
        await expect(
            service.sendMessageAdminError('boom'),
        ).resolves.toBeUndefined();

        expect(consoleSpy).toHaveBeenCalled();
        consoleSpy.mockRestore();
    });

    it('WITH_TELEGRAM≠true: канал выключен, в сеть не ходим, предупреждение одно', async () => {
        const { service, post, warn } = makeService({
            ...ENABLED_CFG,
            WITH_TELEGRAM: 'false',
        });
        expect(service.enabled).toBe(false);

        await service.sendMessage('a');
        await service.sendMessageAdminError('b');
        await expect(service.sendPublicMessage(dto())).resolves.toContain(
            'event-sales-front',
        );

        expect(post).not.toHaveBeenCalled();
        expect(warn).toHaveBeenCalledTimes(1);
        expect(String(warn.mock.calls[0][0])).toContain('WITH_TELEGRAM');
    });

    it('включён, но нет ключа или чата — выключен с понятной причиной', async () => {
        const noToken = makeService({ ...ENABLED_CFG, TELEGRAM_BOT_TOKEN: '' });
        await noToken.service.sendMessage('a');
        expect(noToken.post).not.toHaveBeenCalled();
        expect(String(noToken.warn.mock.calls[0][0])).toContain(
            'TELEGRAM_BOT_TOKEN',
        );

        const noChat = makeService({
            ...ENABLED_CFG,
            TELEGRAM_ADMIN_CHAT_ID: undefined,
        });
        await noChat.service.sendMessage('a');
        expect(noChat.post).not.toHaveBeenCalled();
        expect(String(noChat.warn.mock.calls[0][0])).toContain(
            'TELEGRAM_ADMIN_CHAT_ID',
        );
    });

    it('троттлинг: 21-я отправка в минуту пропускается, все методы делят окно', async () => {
        const { service, post, warn } = makeService(ENABLED_CFG);

        for (let i = 0; i < TELEGRAM_MAX_MESSAGES_PER_MINUTE - 1; i += 1) {
            await service.sendMessage(`msg ${i}`);
        }
        // Окно общее: 20-я уходит через другой метод…
        await service.sendPublicMessage(dto());
        expect(post).toHaveBeenCalledTimes(TELEGRAM_MAX_MESSAGES_PER_MINUTE);

        // …а 21-я (любым методом) уже не проходит.
        await service.sendPublicMessage(dto());
        await service.sendMessageAdminError('late');
        expect(post).toHaveBeenCalledTimes(TELEGRAM_MAX_MESSAGES_PER_MINUTE);
        expect(warn).toHaveBeenCalled();
    });
});

describe('TelegramSendWindow', () => {
    it('окно скользящее: после минуты лимит освобождается', () => {
        const window = new TelegramSendWindow(2);
        const start = 1_000_000;

        expect(window.tryConsume(start)).toBe(true);
        expect(window.tryConsume(start + 1)).toBe(true);
        expect(window.tryConsume(start + 2)).toBe(false);
        expect(window.tryConsume(start + TELEGRAM_THROTTLE_WINDOW_MS + 1)).toBe(
            true,
        );
    });
});

describe('toTelegramMarkdownText', () => {
    it('экранирует ровно открывающие Markdown-сущности, БЕЗ двойного прохода', () => {
        // Раньше два прохода давали `\\\_` — частокол слешей в чате.
        expect(toTelegramMarkdownText('snake_case *bold* `code` [link')).toBe(
            'snake\\_case \\*bold\\* \\`code\\` \\[link',
        );
    });

    it('стек-трейс фронта не мусорится слешами и доставляется', () => {
        const stack =
            'TypeError: x is not a function\n    at onSubmit (contact-form.tsx:42:11)';
        const clean = toTelegramMarkdownText(stack);
        // Точки, скобки, двоеточия v1-Markdown не ломают — не экранируем.
        expect(clean).toContain('at onSubmit (contact-form.tsx:42:11)');
        expect(clean).not.toContain('\\.');
        expect(clean).not.toContain('\\(');
    });

    it('длинный стек-трейс режется до лимита Telegram', () => {
        const clean = toTelegramMarkdownText('x'.repeat(100_000));
        expect(clean).toHaveLength(TELEGRAM_MAX_MESSAGE_LENGTH);
    });
});

describe('TelegramSendMessageDto — лимиты длины', () => {
    const validateDto = async (over: Partial<TelegramSendMessageDto>) =>
        validate(plainToInstance(TelegramSendMessageDto, dto(over)));

    it('валидный запрос фронта проходит', async () => {
        expect(await validateDto({})).toHaveLength(0);
    });

    it('text длиннее лимита → 400 (maxLength), а не молчаливое усечение', async () => {
        const errors = await validateDto({
            text: 'x'.repeat(TELEGRAM_TEXT_MAX_LENGTH + 1),
        });
        expect(errors.some(e => e.constraints?.maxLength)).toBe(true);
    });

    it('text ровно в лимит проходит', async () => {
        expect(
            await validateDto({ text: 'x'.repeat(TELEGRAM_TEXT_MAX_LENGTH) }),
        ).toHaveLength(0);
    });

    it.each(['app', 'domain', 'userId'] as const)(
        'поле %s длиннее лимита отклоняется',
        async field => {
            const errors = await validateDto({
                [field]: 'x'.repeat(TELEGRAM_FIELD_MAX_LENGTH + 1),
            });
            expect(errors.some(e => e.constraints?.maxLength)).toBe(true);
        },
    );
});
