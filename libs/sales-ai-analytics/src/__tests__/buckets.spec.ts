import { AI_ANALYTICS_BUCKETS } from '@lib/portal-lib/pbx/pbx-aicall-smart/type/ai-analytics-event-map.const';
import { CALL_REPORT_CALL_TYPE_CODES } from '@lib/portal-lib/pbx/pbx-aicall-smart/type/pbx-aicall-smart.type';
import {
    aggregateBucketScores,
    bucketOfCallType,
    callTypesOfBucket,
    compareCallTypes,
    isCallTypeCode,
} from '../model/buckets';

describe('bucketOfCallType', () => {
    it('карта §2.2: контакт / презентация / закрытие, other и irrelevant — null', () => {
        expect(bucketOfCallType('cold')).toBe('contact');
        expect(bucketOfCallType('site_lead')).toBe('contact');
        expect(bucketOfCallType('call')).toBe('contact');
        expect(bucketOfCallType('presentation')).toBe('presentation');
        expect(bucketOfCallType('refine')).toBe('closing');
        expect(bucketOfCallType('decision')).toBe('closing');
        expect(bucketOfCallType('payment')).toBe('closing');
        expect(bucketOfCallType('other')).toBeNull();
        expect(bucketOfCallType('irrelevant')).toBeNull();
    });

    it('неизвестный тип, null и undefined → null', () => {
        expect(bucketOfCallType('unknown-type')).toBeNull();
        expect(bucketOfCallType(null)).toBeNull();
        expect(bucketOfCallType(undefined)).toBeNull();
        expect(isCallTypeCode('cold')).toBe(true);
        expect(isCallTypeCode('x')).toBe(false);
    });

    it('каждый тип справочника либо в одной корзине, либо без корзины', () => {
        const covered = AI_ANALYTICS_BUCKETS.flatMap(callTypesOfBucket);
        expect(new Set(covered).size).toBe(covered.length);
        for (const code of CALL_REPORT_CALL_TYPE_CODES) {
            const bucket = bucketOfCallType(code);
            expect(
                bucket === null || callTypesOfBucket(bucket).includes(code),
            ).toBe(true);
        }
    });
});

describe('compareCallTypes', () => {
    it('известные — по справочнику, неизвестные — после по алфавиту', () => {
        const sorted = [
            'zeta',
            'payment',
            'alpha',
            'cold',
            'presentation',
        ].sort(compareCallTypes);
        expect(sorted).toEqual([
            'cold',
            'presentation',
            'payment',
            'alpha',
            'zeta',
        ]);
    });
});

describe('aggregateBucketScores', () => {
    it('всегда три корзины в порядке справочника; n < 8 → none', () => {
        const entries = [
            ...Array.from({ length: 8 }, (_, i) => ({
                callType: i % 2 ? 'cold' : 'call',
                score: 6 + i * 0.1,
            })),
            { callType: 'presentation', score: 9 },
            { callType: 'other', score: 1 },
            { callType: null, score: 1 },
            { callType: 'bogus', score: 1 },
        ];
        const result = aggregateBucketScores(entries);
        expect(result.map(item => item.bucket)).toEqual([
            ...AI_ANALYTICS_BUCKETS,
        ]);
        const [contact, presentation, closing] = result;
        expect(contact.n).toBe(8);
        expect(contact.score.value).toBeCloseTo(6.35, 9);
        expect(contact.score.confidence.level).toBe('low');
        expect(presentation.n).toBe(1);
        expect(presentation.score.value).toBeNull();
        expect(closing.n).toBe(0);
        expect(closing.score.confidence.level).toBe('none');
    });

    it('порядок входа не влияет', () => {
        const entries = Array.from({ length: 20 }, (_, i) => ({
            callType: ['cold', 'presentation', 'payment'][i % 3],
            score: (i % 10) + 1,
        }));
        expect(aggregateBucketScores([...entries].reverse())).toEqual(
            aggregateBucketScores(entries),
        );
    });
});
