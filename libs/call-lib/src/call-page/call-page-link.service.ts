import { randomBytes } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from 'generated/prisma';
import { AiEntityDto } from '../ai/dto/ai-entity.dto';
import { AiService } from '../ai/services/ai.service';
import {
    buildCallPageToken,
    CALL_PAGE_LINK_TYPE,
    callPageMarkOf,
    callPageSecretOf,
    isCallPageTokenValid,
    parseCallPageToken,
    type CallPageLinkRecordView,
} from './call-page-link.util';

/** Звонок, на который ведёт проверенная ссылка, и его записи `ais`. */
export interface ResolvedCallPageLink {
    transcriptionId: string;
    records: AiEntityDto[];
}

/** Поля записи отзыва ссылки в `ais`. */
const CALL_PAGE_LINK_RECORD = {
    provider: 'april',
    app: 'call-page',
    status: 'done',
    result: 'Ссылка на страницу разбора звонка отозвана',
} as const;

/**
 * Ссылки-пропуска на страницу разбора звонка: выпуск, проверка и отзыв.
 *
 * Выпускает event-sales (ссылка в карточке разбора и в сделке), проверяет
 * kpi-report-sales (страница на сайте «Отчёта») — секрет у приложений общий,
 * из корневого окружения. Секрет не задан — ссылки не выпускаются и не
 * открываются, приложение при этом работает.
 */
@Injectable()
export class CallPageLinkService {
    private readonly logger = new Logger(CallPageLinkService.name);
    private warned = false;

    constructor(
        private readonly config: ConfigService,
        private readonly aiService: AiService,
    ) {}

    /** Ссылка-пропуск по уже прочитанным записям звонка; нет секрета — null. */
    tokenFor(
        transcriptionId: string,
        records: readonly CallPageLinkRecordView[],
    ): string | null {
        const secret = this.secret();
        if (secret === null) return null;
        return buildCallPageToken(
            secret,
            transcriptionId,
            callPageMarkOf(records),
        );
    }

    /** Ссылка-пропуск звонка с чтением его записей. */
    async issue(transcriptionId: string): Promise<string | null> {
        if (this.secret() === null) return null;
        const records = await this.aiService.findByTranscriptionIds([
            transcriptionId,
        ]);
        return this.tokenFor(transcriptionId, records);
    }

    /**
     * Проверка ссылки: чужой формат отсекается без запроса в базу, дальше
     * подпись сверяется с действующей меткой звонка. Не сошлась — null.
     */
    async resolve(token: string): Promise<ResolvedCallPageLink | null> {
        const secret = this.secret();
        const parts = parseCallPageToken(token);
        if (secret === null || parts === null) return null;
        const records = await this.aiService.findByTranscriptionIds([
            parts.transcriptionId,
        ]);
        return isCallPageTokenValid(secret, parts, callPageMarkOf(records))
            ? { transcriptionId: parts.transcriptionId, records }
            : null;
    }

    /**
     * Отзыв: у звонка появляется новая метка, прежние ссылки перестают
     * открываться. Возвращает новую ссылку (её нужно раздать заново).
     */
    async revoke(
        transcriptionId: string,
        domain: string,
    ): Promise<string | null> {
        const secret = this.secret();
        if (secret === null) return null;
        const mark = randomBytes(12).toString('base64url');
        await this.aiService.create({
            ...CALL_PAGE_LINK_RECORD,
            type: CALL_PAGE_LINK_TYPE,
            domain,
            transcription_id: transcriptionId,
            user_result: {
                mark,
                revokedAt: new Date().toISOString(),
            } satisfies Prisma.JsonObject,
        });
        return buildCallPageToken(secret, transcriptionId, mark);
    }

    private secret(): string | null {
        const secret = callPageSecretOf({
            AUTH_JWT_SECRET: this.config.get<string>('AUTH_JWT_SECRET'),
            APP_SECRET_KEY: this.config.get<string>('APP_SECRET_KEY'),
        });
        if (secret === null && !this.warned) {
            this.warned = true;
            this.logger.warn(
                'Ссылки на страницу разбора звонка не работают: в окружении нет AUTH_JWT_SECRET и APP_SECRET_KEY',
            );
        }
        return secret;
    }
}
