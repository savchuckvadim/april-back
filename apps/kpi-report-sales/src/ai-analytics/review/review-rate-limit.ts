import { Injectable } from '@nestjs/common';
import { AI_REVIEW_RATE_LIMIT } from '../constants/ai-review.const';

/**
 * Скользящее окно отправок отзыва с одного адреса (в памяти процесса):
 * ручка открытая, и без потолка бот или зацикленный клиент завалил бы
 * таблицу ais и чат. Ключ — адрес клиента; записи старше окна забываются,
 * пустые ключи удаляются, чтобы карта не росла бесконечно.
 */
@Injectable()
export class AiReviewRateLimiter {
    private readonly hits = new Map<string, number[]>();

    /** true — отправка разрешена и учтена; false — лимит окна исчерпан. */
    tryConsume(key: string, now: number = Date.now()): boolean {
        const fresh = (this.hits.get(key) ?? []).filter(
            ts => now - ts < AI_REVIEW_RATE_LIMIT.windowMs,
        );
        if (fresh.length >= AI_REVIEW_RATE_LIMIT.max) {
            this.hits.set(key, fresh);
            return false;
        }
        fresh.push(now);
        this.hits.set(key, fresh);
        this.forget(now);
        return true;
    }

    /** Убирает ключи без свежих отметок. */
    private forget(now: number): void {
        for (const [key, stamps] of this.hits) {
            if (stamps.every(ts => now - ts >= AI_REVIEW_RATE_LIMIT.windowMs)) {
                this.hits.delete(key);
            }
        }
    }
}
