import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CallPageLinkService } from './call-page-link.service';
import { callPageSecretOf, parseCallPageToken } from './call-page-link.util';
import {
    buildCallPageLeadToken,
    callPageLeadPayloadOf,
    callPageLeadUrl,
    verifyCallPageLeadToken,
    type CallPageLeadCheck,
    type CallPageLeadRole,
} from './call-page-lead.util';

/** Чей личный ключ выпускается: пользователь портала и его роль. */
export interface CallPageLeadViewer {
    userId: string;
    role: CallPageLeadRole;
}

/**
 * Личные ссылки руководителя на страницу разбора: выпуск списком (раздел
 * «Разборы звонков» отчёта KPI) и проверка пары «ключ звонка + личный
 * ключ» без обращения к базе.
 *
 * Секрет тот же, что у ссылок звонка (`callPageSecretOf`), назначение
 * подписи — своё. Отзыв ссылки звонка проверяет вызывающий: личная
 * страница открывается, только если ключ звонка тоже действует.
 */
@Injectable()
export class CallPageLeadService {
    constructor(
        private readonly config: ConfigService,
        private readonly links: CallPageLinkService,
    ) {}

    /**
     * Личные адреса `/call/<ключ звонка>/lead/<личный ключ>` для звонков
     * одного портала. Нет секрета, адреса сайта или ссылки звонка — звонок
     * остаётся без личного адреса.
     */
    async urlsFor(
        domain: string,
        transcriptionIds: readonly string[],
        viewer: CallPageLeadViewer,
        nowMs: number = Date.now(),
    ): Promise<Map<string, string>> {
        const urls = new Map<string, string>();
        const secret = this.secret();
        if (secret === null || transcriptionIds.length === 0) return urls;
        const site = await this.links.siteUrl();
        if (site === null) return urls;
        const tokens = await this.links.tokensFor(domain, transcriptionIds);
        const nowSec = Math.floor(nowMs / 1000);
        for (const [transcriptionId, callToken] of tokens) {
            const leadToken = buildCallPageLeadToken(
                secret,
                callPageLeadPayloadOf(
                    { domain, ...viewer, transcriptionId },
                    nowSec,
                ),
            );
            urls.set(
                transcriptionId,
                callPageLeadUrl(site, callToken, leadToken),
            );
        }
        return urls;
    }

    /**
     * Проверка личного ключа к ссылке звонка: подпись, срок и тот же звонок.
     * Ключ звонка здесь только разбирается (номер расшифровки); действует ли
     * он — проверяет вызывающий через `CallPageLinkService.resolve`.
     * Ключ выпущен к другому звонку — «недействителен».
     */
    verify(
        callToken: string,
        leadToken: string,
        nowMs: number = Date.now(),
    ): CallPageLeadCheck {
        const secret = this.secret();
        const call = parseCallPageToken(callToken);
        if (secret === null || call === null) return { status: 'invalid' };
        const check = verifyCallPageLeadToken(
            secret,
            leadToken,
            Math.floor(nowMs / 1000),
        );
        if (check.status === 'invalid') return check;
        return check.payload.t === call.transcriptionId
            ? check
            : { status: 'invalid' };
    }

    private secret(): string | null {
        return callPageSecretOf({
            AUTH_JWT_SECRET: this.config.get<string>('AUTH_JWT_SECRET'),
            APP_SECRET_KEY: this.config.get<string>('APP_SECRET_KEY'),
        });
    }
}
