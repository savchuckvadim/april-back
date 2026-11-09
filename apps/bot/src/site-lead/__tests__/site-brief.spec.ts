import { ServiceUnavailableException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SupportTelegramNotifier } from '@lib/support';
import { TELEGRAM_MAX_TEXT } from '@lib/telegram';
import { formatSiteBriefMessages } from '../domain/site-brief.message';
import {
    SITE_BRIEF_MAX_PARTS,
    type SiteBrief,
} from '../domain/site-brief.types';
import { splitEscaped } from '../domain/telegram-html';
import { SiteBriefDto } from '../dto/site-brief.dto';
import { SiteLeadController } from '../site-lead.controller';
import { SiteLeadService } from '../site-lead.service';

const BRIEF: SiteBrief = {
    kind: 'calibration',
    company: 'ООО «Ромашка»',
    respondent: 'Иванова',
    domain: 'romashka.bitrix24.ru',
    protocol: '1. Сколько менеджеров?\nОтвет: 6',
    page: '/ai/briefs',
};

/** Длинный протокол: строки по 100 символов. */
const longProtocol = (lines: number): string =>
    Array.from({ length: lines }, (_, i) => `${i + 1}. ${'а'.repeat(95)}`).join(
        '\n',
    );

/** Пауза между частями в тестах — мгновенная. */
class InstantSiteLeadService extends SiteLeadService {
    readonly pauses: number[] = [];
    /** Сдвиг часов на каждую часть — чтобы проверить срок брифа. */
    clockStepMs = 0;
    private clock = 1_000_000;

    protected override pause(ms: number): Promise<void> {
        this.pauses.push(ms);
        this.clock += this.clockStepMs;
        return Promise.resolve();
    }

    protected override now(): number {
        return this.clock;
    }
}

const serviceWith = (results: boolean[]) => {
    const send = jest.fn();
    results.forEach(result => send.mockResolvedValueOnce(result));
    send.mockResolvedValue(true);
    const service = new InstantSiteLeadService({
        send,
    } as unknown as SupportTelegramNotifier);
    return { service, send };
};

describe('splitEscaped', () => {
    it('короткий текст — одной частью, экранированный', () => {
        expect(splitEscaped('a < b\nc', 100)).toEqual(['a &lt; b\nc']);
    });

    it('режет по строкам, каждая часть в бюджете', () => {
        const parts = splitEscaped('aaaa\nbbbb\ncccc', 9);
        expect(parts).toEqual(['aaaa\nbbbb', 'cccc']);
    });

    it('строку длиннее бюджета режет по символам, не разрывая сущности', () => {
        const parts = splitEscaped('&&&&&&', 11);
        expect(parts.every(part => part.length <= 11)).toBe(true);
        expect(parts.join('')).toBe('&amp;'.repeat(6));
    });

    it('пустой текст — одна пустая часть', () => {
        expect(splitEscaped('', 10)).toEqual(['']);
    });
});

describe('formatSiteBriefMessages', () => {
    it('короткий бриф — одно сообщение с темой и тем, кто заполнил', () => {
        const [message, ...rest] = formatSiteBriefMessages(BRIEF);
        expect(rest).toEqual([]);
        expect(message).toContain(
            '<b>Бриф калибровки: ООО «Ромашка» / romashka.bitrix24.ru</b>',
        );
        expect(message).toContain('Заполнил: Иванова');
        expect(message).toContain('1. Сколько менеджеров?\nОтвет: 6');
    });

    it('длинный — частями с номерами, каждая в лимите Telegram, «Заполнил» только в первой', () => {
        const messages = formatSiteBriefMessages({
            ...BRIEF,
            kind: 'call-review',
            protocol: longProtocol(120),
        });
        expect(messages.length).toBeGreaterThan(1);
        messages.forEach((message, index) => {
            expect(message.length).toBeLessThanOrEqual(TELEGRAM_MAX_TEXT);
            expect(message).toContain(
                `(часть ${index + 1} из ${messages.length})`,
            );
            expect(message.includes('Заполнил')).toBe(index === 0);
        });
        expect(messages[0]).toContain('Бриф оценки звонка');
    });

    it('без реквизитов тема честно говорит, что их нет', () => {
        const [message] = formatSiteBriefMessages({
            kind: 'calibration',
            protocol: 'текст',
        });
        expect(message).toContain('Бриф калибровки: реквизиты не указаны');
    });

    it('худшая шапка: длинные реквизиты из кавычек — каждая часть в лимите Telegram', () => {
        const fill = '"'.repeat(200);
        const messages = formatSiteBriefMessages({
            kind: 'call-review',
            company: fill,
            domain: fill,
            respondent: fill,
            protocol: '&'.repeat(60_000),
        });
        expect(messages).toHaveLength(SITE_BRIEF_MAX_PARTS);
        messages.forEach(message =>
            expect(message.length).toBeLessThanOrEqual(TELEGRAM_MAX_TEXT),
        );
    });

    it('сверх потолка частей — последняя говорит, что остаток не отправлен', () => {
        const messages = formatSiteBriefMessages({
            ...BRIEF,
            protocol: longProtocol(1000),
        });
        expect(messages).toHaveLength(SITE_BRIEF_MAX_PARTS);
        expect(messages.at(-1)).toContain('остаток не отправлен');
    });
});

describe('SiteLeadService.submitBrief', () => {
    it('все части приняты — «доставлено», с паузой между частями', async () => {
        const { service, send } = serviceWith([]);
        const brief = { ...BRIEF, protocol: longProtocol(120) };
        const total = formatSiteBriefMessages(brief).length;

        await expect(service.submitBrief(brief)).resolves.toEqual({
            status: 'delivered',
            parts: total,
        });
        expect(send).toHaveBeenCalledTimes(total);
        expect(service.pauses).toHaveLength(total - 1);
    });

    it('часть не принята — «не доставлено», остальные не шлём', async () => {
        const { service, send } = serviceWith([true, false]);
        await expect(
            service.submitBrief({ ...BRIEF, protocol: longProtocol(120) }),
        ).resolves.toEqual({ status: 'failed', parts: 1 });
        expect(send).toHaveBeenCalledTimes(2);
    });

    it('окно считает сообщения: второй длинный бриф в ту же минуту — отказ без единой отправки', async () => {
        const { service, send } = serviceWith([]);
        const brief = { ...BRIEF, protocol: longProtocol(1000) };
        const parts = formatSiteBriefMessages(brief).length;

        await expect(service.submitBrief(brief)).resolves.toEqual({
            status: 'delivered',
            parts,
        });
        await expect(service.submitBrief(brief)).resolves.toEqual({
            status: 'throttled',
            parts: 0,
        });
        expect(send).toHaveBeenCalledTimes(parts);
    });

    it('не уложился в срок — новые части не начинает', async () => {
        const { service, send } = serviceWith([]);
        service.clockStepMs = 20_000;
        const result = await service.submitBrief({
            ...BRIEF,
            protocol: longProtocol(1000),
        });
        expect(result.status).toBe('failed');
        expect(result.parts).toBeLessThan(SITE_BRIEF_MAX_PARTS);
        expect(send).toHaveBeenCalledTimes(result.parts);
    });
});

describe('SiteLeadController.submitBrief', () => {
    const dto = plainToInstance(SiteBriefDto, BRIEF);

    it('доставлено — число частей', async () => {
        const controller = new SiteLeadController({
            submitBrief: jest
                .fn()
                .mockResolvedValue({ status: 'delivered', parts: 3 }),
        } as unknown as SiteLeadService);
        await expect(controller.submitBrief(dto)).resolves.toEqual({
            delivered: true,
            parts: 3,
        });
    });

    it('не доставлено — 503', async () => {
        const controller = new SiteLeadController({
            submitBrief: jest
                .fn()
                .mockResolvedValue({ status: 'failed', parts: 1 }),
        } as unknown as SiteLeadService);
        await expect(controller.submitBrief(dto)).rejects.toThrow(
            ServiceUnavailableException,
        );
    });
});

describe('SiteBriefDto', () => {
    const errorsOf = async (input: Record<string, unknown>) =>
        (await validate(plainToInstance(SiteBriefDto, input))).map(
            error => error.property,
        );

    it('бриф с протоколом проходит, пустые реквизиты — тоже', async () => {
        await expect(errorsOf({ ...BRIEF })).resolves.toEqual([]);
        await expect(
            errorsOf({ kind: 'call-review', protocol: 'текст', company: '' }),
        ).resolves.toEqual([]);
    });

    it('без протокола и с чужим видом — отказ', async () => {
        await expect(
            errorsOf({ kind: 'spam', protocol: '   ' }),
        ).resolves.toEqual(['kind', 'protocol']);
    });
});
