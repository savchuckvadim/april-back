import type { Logger } from '@nestjs/common';
import type { YandexStorageService } from '@lib/call-lib/yandex/yandex-storage.service';
import { mp3ChannelCount } from '../lib/mp3-channels.util';
import {
    channelsRequiredByYandex,
    type StreamingTranscriptionService,
    type YandexChannelCount,
    type YandexTranscriptionDetailed,
} from '../services/streaming-transcription.service';

/** Что нужно Yandex-пути от звонка: запись, имя файла и домен (ключ S3). */
export interface YandexCallInput {
    buffer: Buffer;
    fileName: string;
    domain: string;
}

/**
 * Yandex-путь роутера: буфер → S3 → longRunningRecognize → поллинг.
 * Число каналов — по заголовку MP3: телефония части порталов отдаёт стерео,
 * а Яндекс отвергает запись при несовпадении со спецификацией («Audio has 2
 * channels, but 1 requested», gsr 29.10.2026 — падали все длинные звонки).
 * Если заголовок обманул — один повтор с числом каналов из ответа Яндекса.
 * Не Injectable: зависимости аргументами, роутер держит экземпляр.
 */
export class YandexCallRecognizer {
    constructor(
        private readonly storage: Pick<YandexStorageService, 'uploadFile'>,
        private readonly yandex: Pick<
            StreamingTranscriptionService,
            'transcribeAudio' | 'getTranscriptionDetailed'
        >,
        private readonly logger: Pick<Logger, 'warn'>,
    ) {}

    async recognize(
        input: YandexCallInput,
    ): Promise<YandexTranscriptionDetailed> {
        const s3Key = `transcription/audio/${input.domain}/call-report/${input.fileName}`;
        const fileUri = await this.storage.uploadFile(
            input.buffer,
            s3Key,
            'audio/mpeg',
        );
        const channels = mp3ChannelCount(input.buffer) ?? 1;
        try {
            return await this.run(fileUri, channels);
        } catch (error) {
            const actual = channelsRequiredByYandex(error);
            if (actual === null || actual === channels) throw error;
            this.logger.warn(
                `Яндекс насчитал в ${input.fileName} каналов: ${actual}, по заголовку MP3 — ${channels}; повтор с ${actual}`,
                { domain: input.domain },
            );
            return this.run(fileUri, actual);
        }
    }

    private async run(
        fileUri: string,
        channels: YandexChannelCount,
    ): Promise<YandexTranscriptionDetailed> {
        const operationId = await this.yandex.transcribeAudio(
            fileUri,
            channels,
        );
        return this.yandex.getTranscriptionDetailed(operationId);
    }
}
