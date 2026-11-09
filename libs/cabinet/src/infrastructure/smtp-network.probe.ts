import { promises as dns } from 'node:dns';
import { Socket } from 'node:net';
import { Injectable } from '@nestjs/common';

export const SMTP_PORT_STATES = [
    'open',
    'timeout',
    'refused',
    'error',
] as const;
export type SmtpPortState = (typeof SMTP_PORT_STATES)[number];

export interface SmtpPortProbe {
    port: number;
    state: SmtpPortState;
    /** Код ошибки сокета для state=error. */
    detail: string | null;
}

/** Сколько ждать соединения при пробе порта, мс. */
const PROBE_TIMEOUT_MS = 5_000;

/**
 * Сетевая диагностика почты с сервера April: во что резолвится SMTP-хост
 * и открыт ли порт. Только TCP-соединение, без SMTP-диалога и писем.
 */
@Injectable()
export class SmtpNetworkProbe {
    /** Адреса хоста (IPv4 и IPv6); пусто — DNS не ответил. */
    async resolve(host: string): Promise<string[]> {
        try {
            const records = await dns.lookup(host, { all: true });
            return records.map(record => record.address);
        } catch {
            return [];
        }
    }

    probePort(
        host: string,
        port: number,
        timeoutMs: number = PROBE_TIMEOUT_MS,
    ): Promise<SmtpPortProbe> {
        return new Promise(resolve => {
            const socket = new Socket();
            const done = (state: SmtpPortState, detail: string | null) => {
                socket.destroy();
                resolve({ port, state, detail });
            };
            socket.setTimeout(timeoutMs);
            socket.once('connect', () => done('open', null));
            socket.once('timeout', () => done('timeout', null));
            socket.once('error', (error: NodeJS.ErrnoException) =>
                error.code === 'ECONNREFUSED'
                    ? done('refused', null)
                    : done('error', error.code ?? error.message),
            );
            socket.connect(port, host);
        });
    }
}
