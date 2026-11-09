import {
    BadRequestException,
    ExecutionContext,
    HttpException,
    ServiceUnavailableException,
    UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { findMissingModuleDependencies } from '@lib/core/testing/module-di';
import { SupportTelegramNotifier } from '@lib/support';
import { TELEGRAM_MAX_TEXT } from '@lib/telegram';
import { formatSiteLeadMessage } from '../domain/site-lead.message';
import {
    SITE_LEAD_LIMITS,
    SITE_LEAD_MAX_PER_MINUTE,
    type SiteLead,
} from '../domain/site-lead.types';
import { clipEscaped } from '../domain/telegram-html';
import { SiteLeadDto } from '../dto/site-lead.dto';
import {
    SITE_LEAD_KEY_HEADER,
    SiteLeadKeyGuard,
} from '../guards/site-lead-key.guard';
import { SiteLeadController } from '../site-lead.controller';
import { SiteLeadModule } from '../site-lead.module';
import { SiteLeadService } from '../site-lead.service';

const LEAD: SiteLead = {
    kind: 'demo',
    name: 'Ирина',
    phone: '+7 (900) 123-45-67',
    company: 'ООО «Пример», Воронеж',
    comment: 'Интересует AI-разбор звонков',
    page: '/platform/ai',
};

const notifierSending = (delivered: boolean) => {
    const send = jest.fn().mockResolvedValue(delivered);
    return { notifier: { send } as unknown as SupportTelegramNotifier, send };
};

/** Сущности HTML не разрезаны: каждый «&» открывает целую сущность. */
const hasBrokenEntity = (html: string): boolean =>
    /&(?!(?:amp|lt|gt|quot);)/.test(html);

describe('clipEscaped', () => {
    it('экранирует разметку', () => {
        expect(clipEscaped('<b>"A & B"</b>', 100)).toBe(
            '&lt;b&gt;&quot;A &amp; B&quot;&lt;/b&gt;',
        );
    });

    it('обрезает по бюджету и не режет сущность пополам', () => {
        const clipped = clipEscaped('"'.repeat(100), 20);
        expect(clipped.length).toBeLessThanOrEqual(20);
        expect(clipped.endsWith('…')).toBe(true);
        expect(hasBrokenEntity(clipped)).toBe(false);
    });

    it('не разрезает эмодзи из двух половин', () => {
        const clipped = clipEscaped('😀'.repeat(10), 6);
        expect(clipped).toBe('😀😀…');
    });
});

describe('formatSiteLeadMessage', () => {
    it('заголовок по виду, страница, имя, телефон, компания и комментарий', () => {
        const html = formatSiteLeadMessage(LEAD);
        expect(html).toContain('<b>Заявка на демо</b>');
        expect(html).toContain('Страница: /platform/ai');
        expect(html).toContain('Имя: Ирина');
        expect(html).toContain('Телефон: +7 (900) 123-45-67');
        expect(html).toContain('Компания: ООО «Пример», Воронеж');
        expect(html).toContain('<i>Интересует AI-разбор звонков</i>');
    });

    it('КП на почту: только почта, пустые поля не печатаются', () => {
        const html = formatSiteLeadMessage({
            kind: 'offer',
            email: 'client@example.ru',
            page: '/home',
        });
        expect(html).toContain('<b>Просят КП на почту</b>');
        expect(html).toContain('Почта: client@example.ru');
        expect(html).not.toContain('Имя');
        expect(html).not.toContain('Телефон');
        expect(html).not.toContain('<i>');
    });

    it('сомнительный контакт уходит с пометкой — менеджер видит, что ввёл человек', () => {
        const html = formatSiteLeadMessage({
            ...LEAD,
            phone: '234-56-78',
            email: 'ivan.@mail.ru',
        });
        expect(html).toContain(
            'Телефон: 234-56-78 (меньше 10 цифр — уточнить)',
        );
        expect(html).toContain('Почта: ivan.@mail.ru (адрес с ошибкой)');
        expect(formatSiteLeadMessage(LEAD)).not.toContain('уточнить');
    });

    it('чужая разметка не проходит в сообщение', () => {
        const html = formatSiteLeadMessage({
            ...LEAD,
            name: '<a href="https://spam">клик</a>',
        });
        expect(html).not.toContain('<a href');
        expect(html).toContain('&lt;a href=&quot;https://spam&quot;&gt;');
    });

    it('худший случай: все поля максимальной длины из кавычек — в лимите Telegram и без разрезанных сущностей', () => {
        const fill = (length: number) => '"'.repeat(length);
        const html = formatSiteLeadMessage({
            kind: 'callback',
            name: fill(SITE_LEAD_LIMITS.name),
            phone: fill(SITE_LEAD_LIMITS.phone),
            email: fill(SITE_LEAD_LIMITS.email),
            company: fill(SITE_LEAD_LIMITS.company),
            comment: fill(SITE_LEAD_LIMITS.comment),
            page: `/${fill(SITE_LEAD_LIMITS.page - 1)}`,
        });
        expect(html.length).toBeLessThanOrEqual(TELEGRAM_MAX_TEXT);
        expect(hasBrokenEntity(html)).toBe(false);
        expect(html.endsWith('</i>')).toBe(true);
    });
});

describe('SiteLeadService.submit', () => {
    it('Telegram принял — «доставлено»', async () => {
        const { notifier, send } = notifierSending(true);
        await expect(new SiteLeadService(notifier).submit(LEAD)).resolves.toBe(
            'delivered',
        );
        expect(send).toHaveBeenCalledWith(formatSiteLeadMessage(LEAD));
    });

    it('Telegram не принял или бот не настроен — «не доставлено»', async () => {
        const { notifier } = notifierSending(false);
        await expect(new SiteLeadService(notifier).submit(LEAD)).resolves.toBe(
            'failed',
        );
    });

    it('сверх потолка в минуту — отказ без отправки', async () => {
        const { notifier, send } = notifierSending(true);
        const service = new SiteLeadService(notifier);
        for (let i = 0; i < SITE_LEAD_MAX_PER_MINUTE; i += 1) {
            await expect(service.submit(LEAD)).resolves.toBe('delivered');
        }
        await expect(service.submit(LEAD)).resolves.toBe('throttled');
        expect(send).toHaveBeenCalledTimes(SITE_LEAD_MAX_PER_MINUTE);
    });
});

describe('SiteLeadController.submit', () => {
    const controllerWith = (result: 'delivered' | 'throttled' | 'failed') =>
        new SiteLeadController({
            submit: jest.fn().mockResolvedValue(result),
        } as unknown as SiteLeadService);

    const dto = plainToInstance(SiteLeadDto, LEAD);

    it('доставлено — 200 и delivered: true', async () => {
        await expect(controllerWith('delivered').submit(dto)).resolves.toEqual({
            delivered: true,
        });
    });

    it('не доставлено — 503, чтобы сайт показал телефон', async () => {
        await expect(controllerWith('failed').submit(dto)).rejects.toThrow(
            ServiceUnavailableException,
        );
    });

    it('сверх потолка — 429', async () => {
        const error = await controllerWith('throttled')
            .submit(dto)
            .catch((caught: unknown) => caught);
        expect(error).toBeInstanceOf(HttpException);
        expect((error as HttpException).getStatus()).toBe(429);
    });

    it('ни телефона из 10 цифр, ни корректной почты — 400 без отправки', async () => {
        const leads = { submit: jest.fn() };
        const controller = new SiteLeadController(
            leads as unknown as SiteLeadService,
        );
        for (const input of [
            { kind: 'callback', name: 'Ирина', page: '/home' },
            {
                kind: 'callback',
                phone: '234-56-78',
                email: 'ivan.@mail.ru',
                page: '/home',
            },
            { kind: 'offer', email: 'ivan@mail.ru.', page: '/home' },
        ]) {
            await expect(
                controller.submit(plainToInstance(SiteLeadDto, input)),
            ).rejects.toThrow(BadRequestException);
        }
        expect(leads.submit).not.toHaveBeenCalled();
    });

    it('один хороший контакт — заявка принимается, сомнительный второй не мешает', async () => {
        for (const input of [
            { ...LEAD, phone: '234-56-78', email: 'irina@mail.ru' },
            { ...LEAD, email: 'ivan.@mail.ru' },
        ]) {
            await expect(
                controllerWith('delivered').submit(
                    plainToInstance(SiteLeadDto, input),
                ),
            ).resolves.toEqual({ delivered: true });
        }
    });
});

describe('SiteLeadDto', () => {
    const errorsOf = async (input: Record<string, unknown>) =>
        (await validate(plainToInstance(SiteLeadDto, input))).map(
            error => error.property,
        );

    it('заполненная форма проходит, пустые необязательные поля — тоже', async () => {
        await expect(errorsOf({ ...LEAD })).resolves.toEqual([]);
        await expect(
            errorsOf({ ...LEAD, company: '', comment: '  ', email: '' }),
        ).resolves.toEqual([]);
    });

    it('КП на почту — достаточно одной почты', async () => {
        await expect(
            errorsOf({
                kind: 'offer',
                email: 'client@example.ru',
                page: '/home',
            }),
        ).resolves.toEqual([]);
    });

    it('формат контактов DTO не проверяет — это делает контроллер, не теряя заявку из-за второго контакта', async () => {
        await expect(
            errorsOf({ ...LEAD, phone: '12-34-56', email: 'не почта' }),
        ).resolves.toEqual([]);
    });

    it('слишком длинный контакт — отказ', async () => {
        await expect(
            errorsOf({
                ...LEAD,
                phone: '1'.repeat(SITE_LEAD_LIMITS.phone + 1),
            }),
        ).resolves.toEqual(['phone']);
    });

    it('чужой вид заявки и страница не с сайта не проходят', async () => {
        await expect(
            errorsOf({ ...LEAD, kind: 'spam', page: 'https://evil.example' }),
        ).resolves.toEqual(['kind', 'page']);
    });

    it('длинная строка без цифр в телефоне проверяется быстро', async () => {
        const started = Date.now();
        await errorsOf({ ...LEAD, phone: 'x'.repeat(200_000) });
        expect(Date.now() - started).toBeLessThan(500);
    });
});

describe('SiteLeadKeyGuard', () => {
    const KEY = 'site-key-123';

    const guardWith = (env: Record<string, string | undefined>) =>
        new SiteLeadKeyGuard({
            get: (key: string) => env[key],
        } as unknown as ConfigService);

    const contextWith = (headers: Record<string, string | string[]>) =>
        ({
            switchToHttp: () => ({ getRequest: () => ({ headers }) }),
        }) as unknown as ExecutionContext;

    it('верный ключ сайта — пропуск', () => {
        expect(
            guardWith({ SITE_LEAD_API_KEY: KEY }).canActivate(
                contextWith({ [SITE_LEAD_KEY_HEADER]: KEY }),
            ),
        ).toBe(true);
    });

    it('без ключа или с чужим — 401', () => {
        const guard = guardWith({ SITE_LEAD_API_KEY: KEY });
        expect(() => guard.canActivate(contextWith({}))).toThrow(
            UnauthorizedException,
        );
        expect(() =>
            guard.canActivate(contextWith({ [SITE_LEAD_KEY_HEADER]: 'nope' })),
        ).toThrow(UnauthorizedException);
    });

    it('ключ на сервере не задан — 503, ручка закрыта', () => {
        expect(() =>
            guardWith({ SITE_LEAD_API_KEY: '  ' }).canActivate(
                contextWith({ [SITE_LEAD_KEY_HEADER]: '' }),
            ),
        ).toThrow(ServiceUnavailableException);
    });

    it('зеркало заявки не принимает даже с верным ключом', () => {
        expect(() =>
            guardWith({
                SITE_LEAD_API_KEY: KEY,
                APP_ROLE: 'standby',
            }).canActivate(contextWith({ [SITE_LEAD_KEY_HEADER]: KEY })),
        ).toThrow(ServiceUnavailableException);
    });
});

describe('SiteLeadModule', () => {
    it('все зависимости модуля доступны', () => {
        expect(
            findMissingModuleDependencies(SiteLeadModule, [ConfigService]),
        ).toEqual([]);
    });
});
