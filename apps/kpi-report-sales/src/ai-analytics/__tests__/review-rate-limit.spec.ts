import { AI_REVIEW_RATE_LIMIT } from '../constants/ai-review.const';
import { AiReviewRateLimiter } from '../review/review-rate-limit';

describe('AiReviewRateLimiter', () => {
    it('в окне разрешает max отправок, следующую отклоняет, после окна снова разрешает', () => {
        const limiter = new AiReviewRateLimiter();
        const start = 1_700_000_000_000;

        for (let i = 0; i < AI_REVIEW_RATE_LIMIT.max; i += 1) {
            expect(limiter.tryConsume('1.2.3.4', start + i)).toBe(true);
        }
        expect(
            limiter.tryConsume('1.2.3.4', start + AI_REVIEW_RATE_LIMIT.max),
        ).toBe(false);
        expect(
            limiter.tryConsume(
                '1.2.3.4',
                start + AI_REVIEW_RATE_LIMIT.windowMs + 1,
            ),
        ).toBe(true);
    });

    it('адреса считаются независимо', () => {
        const limiter = new AiReviewRateLimiter();
        const now = 1_700_000_000_000;
        for (let i = 0; i < AI_REVIEW_RATE_LIMIT.max; i += 1) {
            limiter.tryConsume('a', now);
        }
        expect(limiter.tryConsume('a', now)).toBe(false);
        expect(limiter.tryConsume('b', now)).toBe(true);
    });
});
