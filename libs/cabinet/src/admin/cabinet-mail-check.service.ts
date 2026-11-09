import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CabinetMailer } from '../infrastructure/cabinet-mailer.port';
import { cabinetMailFrom } from '../infrastructure/cabinet-mailer.service';
import {
    classifySmtpError,
    explainSmtpFailure,
    SmtpFailureKind,
} from '../infrastructure/smtp-error.explain';
import {
    SmtpNetworkProbe,
    SmtpPortProbe,
    SmtpPortState,
} from '../infrastructure/smtp-network.probe';
import type { ChannelCheckResult } from './cabinet-channel-check.service';

/** SMTP приложения глазами админки — без пароля. */
export interface MailTransportStatus {
    configured: boolean;
    host: string | null;
    port: number | null;
    /** 465 — SSL сразу; иначе STARTTLS, если сервер предлагает. */
    secure: boolean;
    login: string | null;
    passwordSet: boolean;
    from: string;
    /** Что в настройке почты не так — по-русски. */
    warnings: string[];
}

/** Итог тестового письма; details — сетевая диагностика при обрыве. */
export interface MailCheckResult extends ChannelCheckResult {
    details: string[];
}

/** Порты исходящего SMTP: 465 — SSL, 587 — STARTTLS. */
const SMTP_PORTS = [465, 587] as const;

const PORT_STATE_TEXT: Record<SmtpPortState, string> = {
    open: 'открыт',
    timeout: 'нет ответа (закрыт или режется по пути)',
    refused: 'отклонён',
    error: 'ошибка соединения',
};

/** Сеть виновата — стоит проверить DNS и порты. */
const NETWORK_KINDS: ReadonlySet<SmtpFailureKind> = new Set(['connect', 'dns']);

const env = (config: ConfigService, key: string): string =>
    (config.get<string>(key) ?? '').trim();

/**
 * Проверка почты из админки: что настроено в окружении (MAIL_*, SMTP_FROM)
 * и тестовое письмо тем же транспортом, что ссылки на пароль. Отказ —
 * с причиной по-русски, в журнал (warn) и, если не удалось соединиться, с
 * пробой DNS и портов 465/587 с этого сервера.
 */
@Injectable()
export class CabinetMailCheckService {
    private readonly logger = new Logger(CabinetMailCheckService.name);

    constructor(
        private readonly config: ConfigService,
        private readonly mailer: CabinetMailer,
        private readonly probe: SmtpNetworkProbe,
    ) {}

    status(): MailTransportStatus {
        const host = env(this.config, 'MAIL_HOST') || null;
        const portRaw = Number(env(this.config, 'MAIL_PORT'));
        const port = Number.isInteger(portRaw) && portRaw > 0 ? portRaw : null;
        const login = env(this.config, 'MAIL_LOGIN') || null;
        const passwordSet = Boolean(env(this.config, 'MAIL_PASSWORD'));
        const from = cabinetMailFrom(this.config);
        const warnings: string[] = [];
        if (!host) {
            warnings.push(
                'MAIL_HOST не задан — письма не уходят, ссылки на пароль админка показывает для ручной передачи.',
            );
        } else {
            if (!port)
                warnings.push(
                    'MAIL_PORT не задан — укажите 465 (SSL) или 587 (STARTTLS).',
                );
            if (!login)
                warnings.push(
                    'MAIL_LOGIN не задан — нужен полный адрес ящика.',
                );
            if (!passwordSet) warnings.push('MAIL_PASSWORD не задан.');
            if (login && from.toLowerCase() !== login.toLowerCase()) {
                warnings.push(
                    `Отправитель ${from} не совпадает с ящиком ${login} — mail.ru и Яндекс не отправляют от чужого адреса; задайте SMTP_FROM=${login}.`,
                );
            }
        }
        return {
            configured: Boolean(host),
            host,
            port,
            secure: port === 465,
            login,
            passwordSet,
            from,
            warnings,
        };
    }

    async test(email: string): Promise<MailCheckResult> {
        const to = email.trim();
        const status = this.status();
        if (!status.configured || !status.host || !status.port) {
            return {
                ok: false,
                message: `Почта не настроена: ${status.warnings.join(' ')}`,
                details: [],
            };
        }
        const result = await this.mailer.sendTest(to);
        if (result.ok) {
            return {
                ok: true,
                message: `Письмо отправлено на ${to} — проверьте ящик (и папку «Спам»).`,
                details: [],
            };
        }
        const target = { host: status.host, port: status.port };
        const kind = result.smtp ? classifySmtpError(result.smtp) : 'other';
        const details = NETWORK_KINDS.has(kind)
            ? await this.networkDetails(target)
            : [];
        const answer = result.error ?? 'неизвестная ошибка';
        this.logger.warn(
            `Почта: тестовое письмо на ${to} не ушло через ${target.host}:${target.port} ` +
                `(${kind}, ${result.smtp?.code ?? 'без кода'}): ${answer}` +
                (details.length ? `\n${details.join('\n')}` : ''),
        );
        return {
            ok: false,
            message: `Письмо не ушло: ${explainSmtpFailure(kind, target)} Ответ: ${answer}`,
            details,
        };
    }

    /** DNS и порты 465/587 с этого сервера + что поменять. */
    private async networkDetails(target: {
        host: string;
        port: number;
    }): Promise<string[]> {
        const ports = [...new Set<number>([target.port, ...SMTP_PORTS])];
        const [addresses, probes] = await Promise.all([
            this.probe.resolve(target.host),
            Promise.all(
                ports.map(port => this.probe.probePort(target.host, port)),
            ),
        ]);
        return [
            addresses.length
                ? `${target.host} → ${addresses.join(', ')}`
                : `${target.host} не находится в DNS с этого сервера`,
            ...probes.map(
                item =>
                    `порт ${item.port}: ${PORT_STATE_TEXT[item.state]}${item.detail ? ` (${item.detail})` : ''}`,
            ),
            portAdvice(target.port, probes),
        ];
    }
}

/** Совет по итогам проб портов. */
function portAdvice(current: number, probes: readonly SmtpPortProbe[]): string {
    const open = probes.filter(item => item.state === 'open');
    if (open.some(item => item.port === current)) {
        return `Порт ${current} открыт — соединение могло сорваться разово; повторите проверку.`;
    }
    const other = open[0];
    if (other) {
        return (
            `Порт ${other.port} открыт — поставьте MAIL_PORT=${other.port} ` +
            '(465 — SSL, 587 — STARTTLS) в корневом .env и пересоздайте admin и pbx.'
        );
    }
    return (
        'Ни один почтовый порт не открыт с этого сервера — попросите хостинг ' +
        'открыть исходящие 465/587 или отправляйте письма через почтовый ' +
        'сервис с HTTP-API.'
    );
}
