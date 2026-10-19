import {
    activeAnalysisByTranscription,
    isSupersededRecord,
    pickActiveAnalysis,
    pickActiveRecord,
} from '../lib/ai-active-record.util';

/**
 * Выбор активной записи ais после переразбора: старая запись
 * `superseded`, новая активная — берётся новая; при нескольких активных —
 * с наибольшим числовым id; замещённые без преемника не отдаются.
 */
const record = (
    id: string,
    status: string,
    type = 'agent-analysis',
    transcriptionId = 't-1',
) => ({ id, status, type, transcription_id: transcriptionId });

describe('pickActiveAnalysis', () => {
    it('старая superseded + новая активная → берётся новая', () => {
        const old = record('100', 'superseded');
        const fresh = record('250', 'done');
        expect(pickActiveAnalysis([old, fresh])).toBe(fresh);
        expect(pickActiveAnalysis([fresh, old])).toBe(fresh);
    });

    it('несколько активных → с наибольшим числовым id, а не по порядку выборки', () => {
        const a = record('9', 'done');
        const b = record('10', 'done');
        // Строковое сравнение дало бы '9' > '10' — проверяем числовое.
        expect(pickActiveAnalysis([a, b])).toBe(b);
        expect(pickActiveAnalysis([b, a])).toBe(b);
    });

    it('только замещённые записи → null; чужие типы не учитываются', () => {
        expect(pickActiveAnalysis([record('1', 'superseded')])).toBeNull();
        expect(
            pickActiveAnalysis([record('5', 'done', 'call-classify')]),
        ).toBeNull();
        expect(pickActiveAnalysis([])).toBeNull();
    });

    it('тип можно задать явно; пустой статус — активная', () => {
        const retest = record('3', '', 'agent-analysis-retest');
        expect(pickActiveAnalysis([retest], 'agent-analysis-retest')).toBe(
            retest,
        );
        expect(isSupersededRecord(retest)).toBe(false);
        expect(isSupersededRecord(record('4', 'superseded'))).toBe(true);
    });
});

describe('pickActiveRecord / activeAnalysisByTranscription', () => {
    it('pickActiveRecord не смотрит на тип — только статус и id', () => {
        const a = record('1', 'done', 'x');
        const b = record('2', 'superseded', 'y');
        expect(pickActiveRecord([a, b])).toBe(a);
    });

    it('раскладывает активные разборы по транскрипциям, пропуская записи без транскрипции', () => {
        const oldT1 = record('1', 'superseded', 'agent-analysis', 't-1');
        const newT1 = record('7', 'done', 'agent-analysis', 't-1');
        const t2 = record('3', 'done', 'agent-analysis', 't-2');
        const noTranscription = {
            id: '8',
            status: 'done',
            type: 'agent-analysis',
            transcription_id: null,
        };
        const onlySuperseded = record(
            '4',
            'superseded',
            'agent-analysis',
            't-3',
        );
        const map = activeAnalysisByTranscription([
            oldT1,
            newT1,
            t2,
            noTranscription,
            onlySuperseded,
            record('5', 'done', 'call-classify', 't-2'),
        ]);
        expect([...map.keys()].sort()).toEqual(['t-1', 't-2']);
        expect(map.get('t-1')).toBe(newT1);
        expect(map.get('t-2')).toBe(t2);
    });
});
