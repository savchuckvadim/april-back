import { Injectable } from '@nestjs/common';
import { EgressProxyService } from '@lib/egress-proxy';
import type { AiEndpointProbe } from '../ai-providers.types';

/** Таймаут живой проверки: админ ждёт ответа на экране, не минутами. */
const PROBE_TIMEOUT_MS = 8_000;

/** Подсказка к коду ответа — что чинить. */
export function probeStatusHint(status: number): string {
    if (status === 401 || status === 403) return ' — ключ не принят';
    if (status === 404) {
        return ' — нет /models: проверьте адрес (обычно оканчивается на /v1)';
    }
    if (status === 429) return ' — лимит запросов провайдера';
    if (status >= 500) return ' — сервис недоступен';
    return '';
}

/**
 * Живая проверка OpenAI-совместимого endpoint'а (LLM или Whisper):
 * GET {baseUrl}/models с ключом. Ходит через исходящий прокси, как и
 * боевые вызовы, — проверяется тот же путь. Ошибки не бросает: итог —
 * строка для чек-листа.
 */
@Injectable()
export class AiEndpointProbeService {
    constructor(private readonly egress: EgressProxyService) {}

    async models(
        baseUrl: string,
        apiKey: string | null,
    ): Promise<AiEndpointProbe> {
        const started = Date.now();
        const done = (ok: boolean, message: string): AiEndpointProbe => ({
            ok,
            message,
            durationMs: Date.now() - started,
        });
        try {
            const response = await this.egress.fetch(`${baseUrl}/models`, {
                method: 'GET',
                headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
                signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
            });
            return response.ok
                ? done(true, 'отвечает')
                : done(
                      false,
                      `HTTP ${response.status}${probeStatusHint(response.status)}`,
                  );
        } catch (error) {
            return done(false, `нет связи: ${(error as Error).message}`);
        }
    }
}
