import type { Readable } from 'node:stream';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import axios from 'axios';
import { PBXService } from '@/modules/pbx';
import {
    CALL_PAGE_AUDIO_URL_TTL_SEC,
    CALL_PAGE_MESSAGES,
} from './call-page.const';
import {
    ByteWindow,
    parseRangeHeader,
    planAudioResponse,
    rangeHeaderOf,
    type AudioResponsePlan,
} from './call-page-audio.util';
import { CallPageCallResolver } from './call-page-call.resolver';

/** Ответ с записью: статус, заголовки и поток байт. */
export interface CallPageAudio {
    status: AudioResponsePlan['status'];
    headers: Record<string, string>;
    /** null — тела нет (запрошен кусок за концом файла). */
    body: Readable | null;
}

interface CachedUrl {
    url: string;
    until: number;
}

const headerNumber = (value: unknown): number | null => {
    const number = Number(value);
    return typeof value === 'string' && Number.isFinite(number) && number >= 0
        ? number
        : null;
};

const headerText = (value: unknown): string | null =>
    typeof value === 'string' && value !== '' ? value : null;

/**
 * Запись разговора для страницы звонка: поток через наш сервер, адрес файла
 * в Битриксе браузеру не отдаётся. Адрес файла помним 10 минут — перемотка
 * шлёт запрос на каждый скачок, и ходить за адресом в портал каждый раз
 * незачем.
 *
 * Инстанс Битрикса берётся на запрос и в сервисе не хранится; пакетные
 * команды не используются — у инстанса общий на портал буфер команд.
 */
@Injectable()
export class CallPageAudioService {
    private readonly logger = new Logger(CallPageAudioService.name);
    private readonly urls = new Map<string, CachedUrl>();

    constructor(
        private readonly calls: CallPageCallResolver,
        private readonly pbx: PBXService,
    ) {}

    async open(
        token: string,
        rangeHeader: string | undefined,
    ): Promise<CallPageAudio> {
        const call = await this.calls.resolve(token);
        const url = await this.fileUrl(
            call.row.id,
            call.domain,
            call.row.activityId,
        );
        const range = parseRangeHeader(rangeHeader);
        const response = await axios.get<Readable>(url, {
            responseType: 'stream',
            headers: range ? { Range: rangeHeaderOf(range) } : {},
            validateStatus: () => true,
        });
        if (response.status >= 400) {
            response.data.destroy();
            this.urls.delete(call.row.id);
            this.logger.warn(
                `Запись звонка ${call.row.id} (${call.domain}) не отдана порталом: статус ${response.status}`,
            );
            throw new NotFoundException(CALL_PAGE_MESSAGES.noAudio);
        }
        const plan = planAudioResponse(
            {
                status: response.status,
                contentLength: headerNumber(response.headers['content-length']),
                contentRange: headerText(response.headers['content-range']),
                contentType: headerText(response.headers['content-type']),
            },
            range,
        );
        return {
            status: plan.status,
            headers: plan.headers,
            body: this.bodyOf(response.data, plan),
        };
    }

    /** Тело ответа: источник как есть либо вырезанный из него кусок. */
    private bodyOf(source: Readable, plan: AudioResponsePlan): Readable | null {
        if (plan.status === 416) {
            source.destroy();
            return null;
        }
        if (plan.skip === 0 && plan.take === null) return source;
        const window = new ByteWindow(plan.skip, plan.take);
        // Кусок отдан или браузер ушёл — остаток файла из портала не качаем.
        window.on('close', () => source.destroy());
        window.on('end', () => source.destroy());
        source.on('error', error => window.destroy(error));
        return source.pipe(window);
    }

    private async fileUrl(
        transcriptionId: string,
        domain: string,
        activityId: string | null,
    ): Promise<string> {
        const cached = this.urls.get(transcriptionId);
        if (cached && cached.until > Date.now()) return cached.url;
        const url = await this.loadFileUrl(domain, Number(activityId)).catch(
            (error: Error) => {
                this.logger.warn(
                    `Адрес записи звонка ${transcriptionId} (${domain}) не получен: ${error.message}`,
                );
                return null;
            },
        );
        if (url === null)
            throw new NotFoundException(CALL_PAGE_MESSAGES.noAudio);
        this.forgetExpired();
        this.urls.set(transcriptionId, {
            url,
            until: Date.now() + CALL_PAGE_AUDIO_URL_TTL_SEC * 1000,
        });
        return url;
    }

    /** Адрес первого файла дела-звонка; файла или дела нет — null. */
    private async loadFileUrl(
        domain: string,
        activityId: number,
    ): Promise<string | null> {
        if (!Number.isInteger(activityId) || activityId <= 0) return null;
        const { bitrix } = await this.pbx.init(domain);
        const found = await bitrix.activity.getAllFresh(
            { ID: activityId },
            undefined,
            1,
        );
        const fileId = Number(found.activities[0]?.FILES?.[0]?.id);
        if (!Number.isInteger(fileId) || fileId <= 0) return null;
        const file = await bitrix.file.get(fileId);
        return headerText(file.result?.DOWNLOAD_URL);
    }

    private forgetExpired(now: number = Date.now()): void {
        for (const [key, cached] of this.urls) {
            if (cached.until <= now) this.urls.delete(key);
        }
    }
}
