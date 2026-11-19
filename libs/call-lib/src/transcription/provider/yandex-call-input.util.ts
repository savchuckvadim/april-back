import { createHash } from 'node:crypto';
import type { YandexStorageService } from '@lib/call-lib/yandex/yandex-storage.service';
import { mp3ChannelCount } from '../lib/mp3-channels.util';
import type { YandexCallInput } from './yandex-call-recognizer';

/** Звонок конвейера с записью в памяти (вход роутера). */
export interface YandexBufferCall {
    buffer: Buffer;
    fileName: string;
    domain: string;
    durationSec?: number;
    /** Ключ звонка для стража (dedupKey); нет — по хэшу записи. */
    callKey?: string;
}

/** Ключ записи звонка конвейера в Object Storage. */
export const callReportObjectKey = (domain: string, fileName: string): string =>
    `transcription/audio/${domain}/call-report/${fileName}`;

/**
 * Ключ звонка: dedupKey конвейера, а без него — хэш записи (тот же звонок —
 * та же запись, значит тот же хэш): замок и лимит стража, прогресс кусков
 * длинного звонка работают и для такого вызова.
 */
export const transcriptionCallKey = (
    call: Pick<YandexBufferCall, 'callKey' | 'domain' | 'buffer'>,
): string =>
    call.callKey ??
    `${call.domain}:file:${createHash('sha1').update(call.buffer).digest('hex')}`;

/** Вход Яндекс-пути для записи в памяти: загрузка в Object Storage — по требованию. */
export function yandexBufferInput(
    call: YandexBufferCall,
    storage: Pick<YandexStorageService, 'uploadFile'>,
): YandexCallInput {
    const key = transcriptionCallKey(call);
    const objectKey = callReportObjectKey(call.domain, call.fileName);
    return {
        call: {
            key,
            domain: call.domain,
            label: `${key} (${call.fileName})`,
            durationSec: call.durationSec,
        },
        channels: mp3ChannelCount(call.buffer),
        upload: async () => ({
            objectKey,
            uri: await storage.uploadFile(call.buffer, objectKey, 'audio/mpeg'),
        }),
    };
}
