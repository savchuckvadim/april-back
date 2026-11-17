import {
    DIGEST_ANCHOR_METRIC,
    DIGEST_COMPARE_SCOPE,
    DIGEST_LIFECYCLE,
    DIGEST_POSITION,
    DIGEST_UNIT,
} from '../period-digest.codes';
import {
    DIGEST_SILENT_DAYS_TITLE,
    digestAnchorTitle,
    digestDroppedLine,
    digestLifecycleTitle,
    digestStandingTitle,
    formatAnchorValue,
    formatDigestValue,
} from '../period-digest.texts';

describe('подписи карточки периода', () => {
    it('числа в единицах метрики', () => {
        expect(formatDigestValue(DIGEST_UNIT.score, 4.25)).toBe('4,3 из 10');
        expect(formatDigestValue(DIGEST_UNIT.share, 0.414)).toBe('41 %');
        expect(formatDigestValue(DIGEST_UNIT.perCall, 1.3)).toBe('1,3');
        expect(
            formatAnchorValue(
                { metric: DIGEST_ANCHOR_METRIC.nextStepDatedShare },
                0.5,
            ),
        ).toBe('50 %');
    });

    it('положение в отделе словами; сравнения нет — пусто', () => {
        expect(
            digestStandingTitle({
                position: DIGEST_POSITION.below,
                scope: DIGEST_COMPARE_SCOPE.department,
                middle: 6,
            }),
        ).toBe('ниже середины отдела');
        expect(
            digestStandingTitle({
                position: DIGEST_POSITION.above,
                scope: DIGEST_COMPARE_SCOPE.structure,
                middle: 6,
            }),
        ).toBe('выше середины по отделам продаж');
        expect(digestStandingTitle(null)).toBe('');
    });

    it('состояние рекомендации, «закрепить — держать»', () => {
        expect(
            digestLifecycleTitle({
                lifecycle: DIGEST_LIFECYCLE.active,
                hold: false,
            }),
        ).toBe('в работе');
        expect(
            digestLifecycleTitle({
                lifecycle: DIGEST_LIFECYCLE.fixed,
                hold: true,
            }),
        ).toBe('закрепить — держать');
        expect(
            digestLifecycleTitle({
                lifecycle: DIGEST_LIFECYCLE.escalated,
                hold: false,
            }),
        ).toBe('обсудить с РОПом');
        expect(
            digestLifecycleTitle({
                lifecycle: DIGEST_LIFECYCLE.dropped,
                hold: false,
            }),
        ).toBe('снята: данных не было');
    });

    it('снятая рекомендация — одной строкой', () => {
        expect(
            digestDroppedLine({
                anchor: { metric: DIGEST_ANCHOR_METRIC.lowScoreShare },
            }),
        ).toBe('Доля звонков с низкой оценкой — снята: данных не было');
    });

    it('название якоря — названия раздела и типов звонков, без кодов', () => {
        expect(
            digestAnchorTitle({
                metric: DIGEST_ANCHOR_METRIC.sectionMean,
                section: 'NEEDS',
                callTypes: ['presentation'],
            }),
        ).toBe('«Выявление потребностей» на звонках «Презентация»');
        expect(
            digestAnchorTitle({ metric: DIGEST_ANCHOR_METRIC.lowScoreShare }),
        ).toBe('доля звонков с низкой оценкой');
    });

    it('«молчание» — дни без записанных звонков', () => {
        expect(DIGEST_SILENT_DAYS_TITLE).toBe('дней без записанных звонков');
    });
});
