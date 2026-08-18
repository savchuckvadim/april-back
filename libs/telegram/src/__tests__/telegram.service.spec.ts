import { of, throwError } from 'rxjs';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { TelegramService } from '../telegram.service';
import { TelegramOriginalService } from '../telegram-original.service';
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
 * Публичная ручка /telegram и внутренние отправители — общий канал тревог
 * всего монорепо. Здесь закрепляем три обещания:
 *  - ошибка Telegram API не роняет вызвавший поток (тревога — не бизнес);
 *  - зацикленный клиент упирается в окно 20/мин, а не в лимиты Bot API;
 *  - маркер приложения (`app`) доезжает как есть, а Markdown-экранирование
 *    не ломает доставку и не мусорит стек-трейсы слешами.
 */
type Cfg = Record<string, string | undefined>;

const DIRECT_CFG: Cfg = {
    WITH_TELEGRAM: 'true',
    TELEGRAM_BOT_TOKEN: 'test-token',
    TELEGRAM_ADMIN_CHAT_ID: '-100',
    APP_NAME: 'event-sales',
};

const FORWARD_CFG: Cfg = {
    WITH_TELEGRAM: 'false',
    APP_NAME: 'event-sales',
};

const makeService = (cfg: Cfg, postImpl?: jest.Mock) => {
    const post = postImpl ?? jest.fn().mockReturnValue(of({ data: {} }));
    const configService = { get: jest.fn((key: string) => cfg[key]) };
    const service = new TelegramService(
        { post } as never,
        configService as never,
    );
    return { service, post };
};

const dto = (over: Partial<TelegramSendMessageDto> = {}) =>
    ({
        app: 'event-sales-front',
        text: 'crm.contact.add failed',
        domain: 'example.bitrix24.ru',
        userId: '447',
        ...over,
    }) as TelegramSendMessageDto;

describe('TelegramService', () => {
    it('прямой режим: шлёт в Bot API с chat_id и Markdown', async () => {
        const { service, post } = makeService(DIRECT_CFG);

        await service.sendPublicMessage(dto());

        const postCalls = post.mock.calls as unknown as [
            string,
            Record<string, unknown>,
        ][];
        const [url, payload] = postCalls[0];
        expect(url).toContain('api.telegram.org');
        expect(payload.chat_id).toBe('-100');
        expect(payload.parse_mode).toBe('Markdown');
        expect(String(payload.text)).toContain('event-sales-front');
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
        const { service } = makeService(DIRECT_CFG, failingPost);

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

    /*
     * Раньше пересылка перезаписывала app на 'nest api prod' — маркер
     * приложения терялся, и на прод-бэке было не понять, кто прислал.
     */
    it('пересылка (дев): app уходит как есть, маркер не теряется', async () => {
        const { service, post } = makeService(FORWARD_CFG);

        await service.sendPublicMessage(dto());

        const postCalls = post.mock.calls as unknown as [
            string,
            Record<string, unknown>,
        ][];
        const [url, payload] = postCalls[0];
        expect(url).toBe('https://back.april-dev.ru/api/telegram');
        expect(payload.app).toBe('event-sales-front');
        expect(payload.domain).toBe('example.bitrix24.ru');
        expect(payload.userId).toBe('447');
    });

    it('троттлинг: 21-я отправка в минуту пропускается, все методы делят окно', async () => {
        const { service, post } = makeService(DIRECT_CFG);
        const warnSpy = jest
            .spyOn(service['logger'], 'warn')
            .mockImplementation(() => undefined);

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
        expect(warnSpy).toHaveBeenCalled();
    });
});

describe('TelegramOriginalService', () => {
    it('тот же троттлинг и та же защита от падений', async () => {
        const consoleSpy = jest
            .spyOn(console, 'error')
            .mockImplementation(() => undefined);
        const post = jest
            .fn()
            .mockReturnValue(throwError(() => new Error('network')));
        const configService = {
            get: jest.fn((key: string) => DIRECT_CFG[key]),
        };
        const service = new TelegramOriginalService(
            { post } as never,
            configService as never,
        );
        const warnSpy = jest
            .spyOn(service['logger'], 'warn')
            .mockImplementation(() => undefined);

        for (let i = 0; i < TELEGRAM_MAX_MESSAGES_PER_MINUTE + 5; i += 1) {
            await expect(service.sendMessage(`m${i}`)).resolves.toBeUndefined();
        }
        expect(post).toHaveBeenCalledTimes(TELEGRAM_MAX_MESSAGES_PER_MINUTE);
        expect(warnSpy).toHaveBeenCalledTimes(5);
        consoleSpy.mockRestore();
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
