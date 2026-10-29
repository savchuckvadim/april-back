import { cloudWhisperModelOf } from '@lib/ai-presets';
import type { PortalAiSettingsRecord } from '@lib/portal-lib/store/ai-settings/portal-ai-settings.types';
import type { WhisperEndpoint } from '../services/whisper-compatible-transcription.service';
import {
    isTranscriptionRouterMode,
    type TranscriptionRouterMode,
} from './transcription-provider.types';

/** Откуда взято значение: настройки портала или общий env приложения. */
export type TranscriptionPrefSource = 'portal' | 'env';

/** Что действует для портала: режим и Whisper-совместимый endpoint с источниками. */
export interface TranscriptionPrefs {
    mode: TranscriptionRouterMode;
    modeSource: TranscriptionPrefSource;
    whisper: WhisperEndpoint | null;
    /** null — endpoint'а нет ни у портала, ни в env. */
    whisperSource: TranscriptionPrefSource | null;
}

/** Общие значения приложения, поверх которых ложатся настройки портала. */
export interface TranscriptionEnvPrefs {
    mode: TranscriptionRouterMode;
    whisper: WhisperEndpoint | null;
    /** Модель для портала, задавшего только адрес. */
    defaultWhisperModel: string;
}

/** Поля настроек AI портала, которые читает маршрутизация. */
export type PortalTranscriptionRecord = Pick<
    PortalAiSettingsRecord,
    'transcriptionMode' | 'whisperBaseUrl' | 'whisperModel' | 'whisperApiKey'
>;

/**
 * Настройки портала поверх env: режим — только известный код, адрес Whisper —
 * без хвостового слэша, модель — своя, иначе модель облака по хосту адреса
 * (Groq, OpenAI — @lib/ai-presets), иначе общая. Одна функция на роутер и
 * чек-лист админки, чтобы «что действует» считалось одинаково.
 */
export function resolveTranscriptionPrefs(
    record: PortalTranscriptionRecord | null,
    env: TranscriptionEnvPrefs,
): TranscriptionPrefs {
    const portalMode = isTranscriptionRouterMode(record?.transcriptionMode)
        ? record.transcriptionMode
        : null;
    const baseUrl = (record?.whisperBaseUrl ?? '').trim().replace(/\/+$/, '');
    const portalWhisper: WhisperEndpoint | null = baseUrl
        ? {
              baseUrl,
              apiKey: record?.whisperApiKey ?? null,
              model:
                  record?.whisperModel?.trim() ||
                  cloudWhisperModelOf(baseUrl) ||
                  env.defaultWhisperModel,
          }
        : null;
    const whisper = portalWhisper ?? env.whisper;
    return {
        mode: portalMode ?? env.mode,
        modeSource: portalMode ? 'portal' : 'env',
        whisper,
        whisperSource: portalWhisper ? 'portal' : whisper ? 'env' : null,
    };
}
