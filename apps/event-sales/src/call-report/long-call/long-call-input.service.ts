import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '@lib/core/redis/redis.service';
import { StructuredLlmGateway } from '@lib/llm-gateway';
import {
    CALL_LONG_SETTING_KEYS,
    VENDOR_SETTINGS_READER,
    envOnlyReader,
    type VendorSettingsReader,
} from '@lib/vendor-settings';
import { LongCallDigestCache } from './long-call-digest.cache';
import { formatLongCallLog } from './long-call-log.util';
import { buildLongCallInputs } from './long-call-input.util';
import type {
    LongCallInput,
    LongCallPrepareOptions,
} from './long-call-input.service.types';
import { LongCallRun } from './long-call-run';
import {
    LONG_CALL_LOG_SECONDS_DIGITS,
    LONG_CALL_MAX_MISSING_SHARE,
    LONG_CALL_MIN_PARTS,
    MS_IN_SECOND,
} from './long-call-service.const';
import {
    longCallSettingsOf,
    overlapCharsFor,
    type LongCallSettings,
} from './long-call-settings.util';
import { isLongTranscript, splitTranscript } from './long-call-split.util';
import type { DigestedPart } from './long-call.types';

/**
 * Подготовка длинного разговора к разбору (этап 4в): расшифровку режет на
 * части, по каждой просит у модели конспект, затем сводку разговора и
 * собирает проходам их тексты вместо полной расшифровки (сборка — 4б).
 *
 * Один метод — prepare. `null` значит «длинный путь не применяется»:
 * вызывающий работает как раньше, с полной расшифровкой.
 *
 * Тревога о сбое модели — одна на разговор и только когда длинный путь
 * брошен (без конспекта больше половины частей). Не удались отдельные части
 * или сводка, а путь состоялся — тревоги нет, только предупреждения в журнале.
 *
 * Состояния на звонок здесь нет: всё, что копится за разговор (ответы,
 * счётчики, очередь запросов), живёт в LongCallRun, который создаётся на
 * каждый вызов prepare. Bitrix сервису не нужен.
 *
 * Подключение к разбору звонков — следующее задание; пока сервис только
 * зарегистрирован в CallReportModule.
 */
@Injectable()
export class LongCallInputService {
    private readonly logger = new Logger(LongCallInputService.name);
    private readonly settings: VendorSettingsReader;
    private readonly cache: LongCallDigestCache;

    constructor(
        private readonly llm: StructuredLlmGateway,
        configService: ConfigService,
        @Optional()
        @Inject(VENDOR_SETTINGS_READER)
        settings?: VendorSettingsReader,
        @Optional() redis?: RedisService,
    ) {
        this.settings =
            settings ?? envOnlyReader(key => configService.get<string>(key));
        this.cache = new LongCallDigestCache(redis);
    }

    /**
     * Длинная расшифровка → тексты для проходов; `null` — путь не применяется:
     * режим выключен (и нет `force`), расшифровка короче порога или уложилась
     * в одну часть, либо длинный путь не удался (без конспекта больше
     * половины частей, любой сбой).
     */
    async prepare(
        domain: string,
        transcript: string,
        options: LongCallPrepareOptions = {},
    ): Promise<LongCallInput | null> {
        const settings = await this.readSettings();
        if (settings.mode === 'off' && !options.force) return null;
        if (!isLongTranscript(transcript, settings.thresholdChars)) return null;
        try {
            return await this.prepareLong(
                domain,
                transcript,
                settings,
                options,
            );
        } catch (error) {
            this.logger.warn(
                `Длинный разговор (${domain}): подготовка не удалась, разбор пойдёт по полной расшифровке: ${(error as Error).message}`,
            );

            return null;
        }
    }

    /** Три настройки одним обращением; сбой чтения — значения по умолчанию. */
    private async readSettings(): Promise<LongCallSettings> {
        try {
            return longCallSettingsOf(
                await this.settings.getMany(CALL_LONG_SETTING_KEYS),
            );
        } catch (error) {
            this.logger.warn(
                `Настройки длинных разговоров не прочитаны (${(error as Error).message}) — действуют значения по умолчанию`,
            );

            return longCallSettingsOf({});
        }
    }

    private async prepareLong(
        domain: string,
        transcript: string,
        settings: LongCallSettings,
        options: LongCallPrepareOptions,
    ): Promise<LongCallInput | null> {
        const startedAt = Date.now();
        const { partChars } = settings;
        const parts = splitTranscript(transcript, {
            partChars,
            overlapChars: overlapCharsFor(partChars),
        });
        if (parts.length < LONG_CALL_MIN_PARTS) {
            this.logger.log(
                `Длинный разговор (${domain}): расшифровка уложилась в одну часть — разбор пойдёт по полной расшифровке`,
            );

            return null;
        }
        const run = new LongCallRun(
            this.llm,
            this.cache,
            this.logger,
            domain,
            options.model,
        );
        const digests = await run.digestAll(parts, partChars);
        const digested: DigestedPart[] = parts.map((part, index) => ({
            part,
            digest: digests[index],
        }));
        const missing = digests.filter(digest => digest === null).length;
        if (missing > parts.length * LONG_CALL_MAX_MISSING_SHARE) {
            this.logger.warn(
                `Длинный разговор (${domain}): без конспекта ${missing} частей из ${parts.length} — разбор пойдёт по полной расшифровке`,
            );
            await run.alertAbandoned();

            return null;
        }
        const summary = await run.summarize(digested);
        const inputs = buildLongCallInputs(
            transcript,
            digested,
            summary,
            partChars,
        );
        const transcriptChars = transcript.trim().length;
        this.logger.log(
            formatLongCallLog({
                domain,
                transcriptChars,
                report: inputs.report,
                requests: run.requestsSent,
                cacheHits: run.cacheHits,
                seconds: ((Date.now() - startedAt) / MS_IN_SECOND).toFixed(
                    LONG_CALL_LOG_SECONDS_DIGITS,
                ),
            }),
        );

        return {
            ...inputs,
            transcriptChars,
            partChars,
            completions: run.completions,
        };
    }
}
