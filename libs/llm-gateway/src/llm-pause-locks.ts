import type Redis from 'ioredis';
import type { LlmProviderCode } from './structured-llm.types';

/** Префикс ключей предохранителя LLM в Redis. */
export const LLM_CIRCUIT_KEY_PREFIX = 'llm-gateway:circuit';

/** Снять замок, только если он наш: сравнить и удалить одним шагом. */
const RELEASE_IF_OWNER = `if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end`;

const probeKey = (provider: LlmProviderCode): string =>
    `${LLM_CIRCUIT_KEY_PREFIX}:${provider}:probe`;

const pausedAlertKey = (provider: LlmProviderCode): string =>
    `${LLM_CIRCUIT_KEY_PREFIX}:${provider}:paused-alert`;

/**
 * Замки на время паузы поставщика (11.11.2026), общие для всех реплик через
 * Redis; без Redis или при его ошибке — в памяти процесса.
 * - Проба: один пробный вызов к поставщику на паузе за раз. У замка есть
 *   маркер владельца — снимает только тот, кто ставил (чужую пробу,
 *   начатую после истечения срока, не сбросить), — и срок не дольше ответа
 *   поставщика: замок берётся уже у отправки, после очереди.
 * - Тревога: одно сообщение «отказали все» за паузу основного поставщика,
 *   остальные такие отказы — в журнал (иначе Telegram глушит и сообщение
 *   «снова отвечает»).
 * Вынесено из LlmCircuitBreakerService по лимиту файла.
 */
export class LlmPauseLocks {
    /** Проба без Redis: поставщик → маркер владельца. */
    private readonly probes = new Map<LlmProviderCode, string>();
    /** Тревога без Redis: поставщик → до какого момента молчим. */
    private readonly alertUntil = new Map<LlmProviderCode, number>();

    constructor(
        private readonly client: () => Redis | null,
        private readonly onRedisError: (error: unknown) => void,
    ) {}

    /** Занять пробу: true — она наша, снять — endProbe с тем же маркером. */
    async tryStartProbe(
        provider: LlmProviderCode,
        token: string,
        ttlSec: number,
    ): Promise<boolean> {
        const redis = this.client();
        if (redis) {
            try {
                const set = await redis.set(
                    probeKey(provider),
                    token,
                    'EX',
                    ttlSec,
                    'NX',
                );
                return set !== null;
            } catch (error) {
                this.onRedisError(error);
            }
        }
        if (this.probes.has(provider)) return false;
        this.probes.set(provider, token);
        return true;
    }

    /** Снять пробу, только если замок наш (маркер совпал). */
    async endProbe(provider: LlmProviderCode, token: string): Promise<void> {
        if (this.probes.get(provider) === token) this.probes.delete(provider);
        const redis = this.client();
        if (!redis) return;
        try {
            await redis.eval(RELEASE_IF_OWNER, 1, probeKey(provider), token);
        } catch (error) {
            this.onRedisError(error);
        }
    }

    /** Право на тревогу «отказали все» в эту паузу: true — у первого вызова. */
    async claimPausedAlert(
        provider: LlmProviderCode,
        ttlSec: number,
        now: number = Date.now(),
    ): Promise<boolean> {
        const redis = this.client();
        if (redis) {
            try {
                const set = await redis.set(
                    pausedAlertKey(provider),
                    String(now),
                    'EX',
                    ttlSec,
                    'NX',
                );
                return set !== null;
            } catch (error) {
                this.onRedisError(error);
            }
        }
        if ((this.alertUntil.get(provider) ?? 0) > now) return false;
        this.alertUntil.set(provider, now + ttlSec * 1000);
        return true;
    }
}
