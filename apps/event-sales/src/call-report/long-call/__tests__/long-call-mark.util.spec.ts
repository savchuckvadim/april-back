import { longCallInput } from '../../__tests__/call-long-input.fake';
import {
    LONG_CALL_MARK_KEY,
    buildLongCallMark,
    readLongCallMark,
    withLongCallMark,
} from '../long-call-mark.util';

const MARK = {
    parts: 7,
    partsWithoutDigest: 1,
    hasSummary: true,
    transcriptChars: 58_400,
};

describe('метка «разбор шёл по частям»', () => {
    it('собирается из сведений о резке и длины расшифровки', () => {
        expect(buildLongCallMark(longCallInput())).toEqual(MARK);
        expect(
            buildLongCallMark(
                longCallInput({
                    transcriptChars: 30_000,
                    report: {
                        ...longCallInput().report,
                        partsCount: 4,
                        partsWithoutDigest: 0,
                        hasSummary: false,
                    },
                }),
            ),
        ).toEqual({
            parts: 4,
            partsWithoutDigest: 0,
            hasSummary: false,
            transcriptChars: 30_000,
        });
    });

    it('кладётся в extra под ключом longCall, соседние ключи не затираются', () => {
        const extra = withLongCallMark(
            { focusPasses: { promptVersion: 'v' }, other: 1 },
            longCallInput(),
        );

        expect(LONG_CALL_MARK_KEY).toBe('longCall');
        expect(extra).toEqual({
            focusPasses: { promptVersion: 'v' },
            other: 1,
            longCall: MARK,
        });
    });

    it('extra не было — остаётся одна метка; исходный объект не меняется', () => {
        expect(withLongCallMark(undefined, longCallInput())).toEqual({
            longCall: MARK,
        });
        const source = { other: 1 };
        withLongCallMark(source, longCallInput());
        expect(source).toEqual({ other: 1 });
    });

    it('читается из extra; чужая форма или отсутствие — null', () => {
        expect(readLongCallMark({ longCall: MARK })).toEqual(MARK);
        expect(readLongCallMark({ longCall: { ...MARK, extra: 1 } })).toEqual(
            MARK,
        );
        expect(readLongCallMark(undefined)).toBeNull();
        expect(readLongCallMark(null)).toBeNull();
        expect(readLongCallMark([])).toBeNull();
        expect(readLongCallMark({})).toBeNull();
        expect(readLongCallMark({ longCall: 'да' })).toBeNull();
        expect(
            readLongCallMark({ longCall: { ...MARK, parts: -1 } }),
        ).toBeNull();
        expect(
            readLongCallMark({ longCall: { ...MARK, parts: 2.5 } }),
        ).toBeNull();
        expect(
            readLongCallMark({ longCall: { ...MARK, hasSummary: 'yes' } }),
        ).toBeNull();
        expect(
            readLongCallMark({ longCall: { parts: 3, hasSummary: true } }),
        ).toBeNull();
    });
});
