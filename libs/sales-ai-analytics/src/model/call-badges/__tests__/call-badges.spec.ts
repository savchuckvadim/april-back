import { CALL_REPORT_SECTION_CODES } from '@lib/portal-lib/pbx/pbx-aicall-smart';
import {
    CALL_BADGE_FAMILIES,
    CALL_BADGE_IDS,
    CALL_BADGE_OUTCOMES,
    CALL_BADGE_TONES,
    CALL_BADGE_WEAK_SECTIONS,
    CALL_BADGES,
    callBadgeDef,
    isCallBadgeId,
} from '../call-badges.catalog';
import { callBadgesOf, callBadgeState } from '../call-badges.evaluate';
import {
    liteRow,
    methodologyFacts,
    objectionOf,
    reportFacts,
    styleMarks,
} from './call-badges.fixtures';

const EXPECTED_IDS = [
    'step_missing',
    'step_no_date',
    'objection_unhandled',
    'signal',
    'outcome_advanced',
    'outcome_callback',
    'outcome_postponed',
    'outcome_refused',
    'outcome_no_contact',
    'progress_low',
    'capped',
    'price_named',
    'upsell_tried',
    'not_lpr',
    'no_self_intro',
    'issue',
    'needs_missing',
    'weak_greeting',
    'weak_needs',
    'weak_presentation',
    'weak_objections',
    'weak_price',
    'weak_closing',
    'weak_refusal',
];

const TITLE_MAX_LENGTH = 28;

describe('справочник бейджей звонков', () => {
    it('состав и порядок кодов — как в постановке, коды уникальны', () => {
        expect(CALL_BADGES.map(badge => badge.id)).toEqual(EXPECTED_IDS);
        expect([...CALL_BADGE_IDS]).toEqual(EXPECTED_IDS);
        expect(new Set(CALL_BADGE_IDS).size).toBe(CALL_BADGE_IDS.length);
    });

    it('у каждого бейджа есть подпись не длиннее 28 знаков', () => {
        for (const badge of CALL_BADGES) {
            expect(badge.title.trim()).not.toBe('');
            expect(badge.title.length).toBeLessThanOrEqual(TITLE_MAX_LENGTH);
        }
    });

    it('у каждого бейджа есть подсказка', () => {
        for (const badge of CALL_BADGES) {
            expect(badge.hint.trim()).not.toBe('');
        }
    });

    it('тон каждого бейджа — из допустимых', () => {
        for (const badge of CALL_BADGES) {
            expect(CALL_BADGE_TONES).toContain(badge.tone);
        }
    });

    it('существует одно семейство — итог разговора, в нём пять бейджей', () => {
        expect(CALL_BADGE_FAMILIES).toEqual(['outcome']);
        const members = CALL_BADGES.filter(badge => badge.family !== null);
        expect(members.map(badge => badge.family)).toEqual(
            Array<string>(5).fill('outcome'),
        );
        expect(members.map(badge => badge.id)).toEqual([
            'outcome_advanced',
            'outcome_callback',
            'outcome_postponed',
            'outcome_refused',
            'outcome_no_contact',
        ]);
    });

    it('в строке фильтров видны пять главных бейджей', () => {
        expect(
            CALL_BADGES.filter(badge => badge.main).map(badge => badge.id),
        ).toEqual([
            'step_missing',
            'objection_unhandled',
            'signal',
            'outcome_refused',
            'progress_low',
        ]);
    });

    it('слабые разделы покрывают все разделы разговора ровно по разу', () => {
        expect(Object.values(CALL_BADGE_WEAK_SECTIONS).sort()).toEqual(
            [...CALL_REPORT_SECTION_CODES].sort(),
        );
    });

    it('бейджи итога покрывают все пять кодов итога разговора', () => {
        expect(Object.values(CALL_BADGE_OUTCOMES).sort()).toEqual([
            'advanced',
            'callback_dated',
            'no_contact',
            'postponed',
            'refused',
        ]);
    });

    it('isCallBadgeId и callBadgeDef работают по справочнику', () => {
        expect(isCallBadgeId('signal')).toBe(true);
        expect(isCallBadgeId('нет_такого')).toBe(false);
        expect(callBadgeDef('step_no_date').title).toBe('Шаг без даты');
    });
});

describe('callBadgeState — общие правила', () => {
    it('разбора нет — каждый бейдж «неизвестно», даже если данные лежат в строке', () => {
        const row = liteRow({
            analysisPresent: false,
            nextStep: { set: false, date: null },
            objections: [objectionOf({ handled: false })],
            report: reportFacts({ outcome: 'refused' }),
            style: styleMarks({ needsFound: false }),
            methodology: methodologyFacts({ dealProgress: 1, capsApplied: 2 }),
        });
        for (const id of CALL_BADGE_IDS) {
            expect(callBadgeState(id, row)).toBe('unknown');
        }
        expect(callBadgesOf(row)).toEqual([]);
    });

    it('callBadgesOf отдаёт только «да» в порядке справочника', () => {
        const row = liteRow({
            nextStep: { set: false, date: null },
            objections: [objectionOf({ handled: false })],
            report: reportFacts({
                outcome: 'refused',
                selfIntro: {
                    introduced: false,
                    companyNamed: null,
                    offerQuestion: null,
                },
            }),
            methodology: methodologyFacts({ dealProgress: 1 }),
        });
        expect(callBadgesOf(row)).toEqual([
            'step_missing',
            'objection_unhandled',
            'outcome_refused',
            'progress_low',
            'no_self_intro',
        ]);
    });

    it('у звонка без признаков список бейджей пуст', () => {
        expect(callBadgesOf(liteRow())).toEqual([]);
    });
});
