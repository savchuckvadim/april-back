import type { ChunkInfo } from '../chunking/chunked-transcription.types';
import type { TranscriptionProvider } from './transcription-provider.types';
import {
    transcriptionProviderOfStepName,
    type TranscriptionStep,
} from './transcription-route.util';

/**
 * Правила резки длинного звонка в маршрутизаторе — чистые функции: кто
 * распознаёт кусок, под каким ключом кусок идёт к стражу Яндекса и кого
 * записать распознавателем звонка.
 */

const YANDEX: TranscriptionProvider = 'yandex';
const WHISPER: TranscriptionProvider = 'local-whisper';

/**
 * Попытки на кусок: бесплатные и свои распознаватели — в порядке плана,
 * Яндекс — один раз и последним, даже если по плану длинных он основной
 * (резка нужна, чтобы не платить Яндексу за весь звонок). Свой Whisper без
 * адреса выпадает: на каждом куске он дал бы только ошибку. Бесплатных нет —
 * пусто: резать незачем, звонок идёт целиком прежним путём.
 */
export function chunkAttemptSteps(
    steps: readonly TranscriptionStep[],
    whisperConfigured: boolean,
): TranscriptionStep[] {
    const free = steps.filter(
        step =>
            step.provider !== YANDEX &&
            (step.provider !== WHISPER || whisperConfigured),
    );
    if (free.length === 0) return [];
    const yandex = steps.find(step => step.provider === YANDEX);
    return yandex ? [...free, yandex] : free;
}

const pad2 = (value: number): string => String(value).padStart(2, '0');

/**
 * Ключ куска для стража Яндекса: замок, лимит отправок и номер операции —
 * свои у каждого куска, упавший кусок не перезапускает в Яндексе весь звонок.
 */
export const chunkCallKey = (
    callKey: string,
    info: Pick<ChunkInfo, 'index' | 'count'>,
): string => `${callKey}:part${pad2(info.index + 1)}of${pad2(info.count)}`;

/**
 * Распознаватель звонка для строки расшифровки — тот, кто распознал больше
 * всего секунд записи. При равенстве — раньше стоящий в попытках (бесплатный).
 * Имена, которых нет в списке попыток (кусок из прошлого запуска при другом
 * маршруте), узнаются по названию; совсем чужие не считаются.
 */
export function dominantChunkProvider(
    providerSeconds: Readonly<Record<string, number>>,
    attempts: readonly TranscriptionStep[],
): TranscriptionProvider {
    const seconds = new Map<TranscriptionProvider, number>();
    for (const [name, value] of Object.entries(providerSeconds)) {
        const provider = transcriptionProviderOfStepName(name);
        if (provider) {
            seconds.set(provider, (seconds.get(provider) ?? 0) + value);
        }
    }
    const order = [
        ...new Set([...attempts.map(step => step.provider), ...seconds.keys()]),
    ];
    let best = order[0];
    for (const provider of order) {
        if ((seconds.get(provider) ?? 0) > (seconds.get(best) ?? 0)) {
            best = provider;
        }
    }
    return best;
}

/** «Vibecode 11, Yandex 1» — сколько кусков распознал каждый. */
export const chunkProvidersLine = (
    providers: Readonly<Record<string, number>>,
): string =>
    Object.entries(providers)
        .map(([name, count]) => `${name} ${count}`)
        .join(', ');
