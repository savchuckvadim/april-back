import { AgendaCallRow, AgendaSection } from '../model/agenda';
import {
    DIGEST_MAX_ALTERNATIVES,
    buildMorningDigest,
} from '../model/morning-digest';

const section = (
    name: string,
    score: number | null,
    alternatives: string[],
    relevance = 1,
): AgendaSection => ({
    section: name,
    relevance,
    score,
    asWas: `как было: ${name}`,
    alternatives,
});

const call = (
    transcriptionId: string,
    managerId: string,
    sections: AgendaSection[],
    startedAt = '2026-09-08T09:00:00+03:00',
): AgendaCallRow => ({
    transcriptionId,
    managerId,
    callType: 'call',
    callStartedAt: new Date(startedAt),
    score: 5,
    sections,
    objections: [],
    riskFlags: [],
    text: null,
});

// R1: худший по оценке раздел без relevance — игнорируется; берётся s1 с 4 фразами
const r1 = call('R1', 'm1', [
    section('s1', 5, ['a1', 'a2', 'a3', 'a4']),
    section('s2', 1, ['x'], 0),
]);
// R2: худший раздел без alternatives — берётся следующий с фразами
const r2 = call('R2', 'm1', [section('s1', 2, []), section('s3', 4, ['b1'])]);
// R3: только пустые фразы → звонок не берётся
const r3 = call('R3', 'm1', [section('s1', 3, ['', '  '])]);
// R4: score null → не берётся
const r4 = call('R4', 'm1', [section('s1', null, ['c'])]);
// R5: чужой менеджер
const r5 = call('R5', 'm2', [section('s1', 1, ['z'])]);

const rows = [r5, r4, r3, r1, r2];

describe('buildMorningDigest', () => {
    it('берёт только звонки менеджера с оценёнными разделами и непустыми alternatives', () => {
        const items = buildMorningDigest(rows, 'm1');
        expect(items.map(item => item.transcriptionId)).toEqual(['R2', 'R1']);
        expect(items[0]).toEqual({
            transcriptionId: 'R2',
            callStartedAt: r2.callStartedAt,
            section: 's3',
            asWas: 'как было: s3',
            alternatives: ['b1'],
        });
    });

    it('не берёт разделы без relevance и режет фразы до трёх', () => {
        const [, r1Item] = buildMorningDigest(rows, 'm1');
        expect(r1Item.section).toBe('s1');
        expect(r1Item.alternatives).toEqual(['a1', 'a2', 'a3']);
        expect(DIGEST_MAX_ALTERNATIVES).toBe(3);
    });

    it('limit по умолчанию 3, опция ограничивает', () => {
        const many = Array.from({ length: 5 }, (_, i) =>
            call(`M${i}`, 'm1', [section('s1', 9 - i, ['f'])]),
        );
        expect(buildMorningDigest(many, 'm1')).toHaveLength(3);
        expect(
            buildMorningDigest(many, 'm1', { limit: 1 }).map(
                item => item.transcriptionId,
            ),
        ).toEqual(['M4']);
        expect(buildMorningDigest(many, 'm1', { limit: 0 })).toEqual([]);
    });

    it('чужой менеджер и пустой вход → пусто', () => {
        expect(buildMorningDigest(rows, 'm9')).toEqual([]);
        expect(buildMorningDigest([], 'm1')).toEqual([]);
        expect(buildMorningDigest([r3, r4], 'm1')).toEqual([]);
    });

    it('при равных оценках — по времени звонка, детерминированно', () => {
        const early = call(
            'E',
            'm1',
            [section('s1', 3, ['e'])],
            '2026-09-08T08:00:00+03:00',
        );
        const late = call(
            'L',
            'm1',
            [section('s1', 3, ['l'])],
            '2026-09-08T10:00:00+03:00',
        );
        const items = buildMorningDigest([late, early], 'm1');
        expect(items.map(item => item.transcriptionId)).toEqual(['E', 'L']);
        expect(buildMorningDigest([early, late], 'm1')).toEqual(items);
    });
});
