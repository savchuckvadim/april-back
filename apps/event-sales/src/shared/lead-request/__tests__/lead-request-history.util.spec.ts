import {
    appendLeadRequestHistory,
    buildLeadRequestHistoryEntry,
    LEAD_REQUEST_HISTORY_MAX_ENTRIES,
} from '../lead-request-history.util';
import { ETimeZone } from '@lib/shared/lib/date';

const TZ = 'Europe/Moscow' as ETimeZone;

describe('lead-request-history.util', () => {
    it('запись с таймштампом и текстом', () => {
        const entry = buildLeadRequestHistoryEntry('ХО назначен: 447', TZ);
        expect(entry).toMatch(
            /^\d{2}\.\d{2}\.\d{4} \d{2}:\d{2} — ХО назначен: 447$/,
        );
    });

    it('append сохраняет прошлые записи (append-only)', () => {
        const history = appendLeadRequestHistory(
            ['01.08.2026 10:00 — Появилась'],
            buildLeadRequestHistoryEntry('ХО назначен: 447', TZ),
        );
        expect(history).toHaveLength(2);
        expect(history[0]).toBe('01.08.2026 10:00 — Появилась');
    });

    it('тот же текст подряд не дублируется (двойной клик)', () => {
        const first = appendLeadRequestHistory(
            [],
            buildLeadRequestHistoryEntry('ХО назначен: 447', TZ),
        );
        const second = appendLeadRequestHistory(
            first,
            buildLeadRequestHistoryEntry('ХО назначен: 447', TZ),
        );
        expect(second).toHaveLength(1);
    });

    it('null/мусор в текущем значении не ломают append', () => {
        const history = appendLeadRequestHistory(
            null,
            buildLeadRequestHistoryEntry('Отказ', TZ),
        );
        expect(history).toHaveLength(1);
    });

    it('история обрезается по максимуму, свежие записи сохраняются', () => {
        const long = Array.from(
            { length: LEAD_REQUEST_HISTORY_MAX_ENTRIES },
            (_, index) => `01.01.2026 00:00 — запись ${index}`,
        );
        const appended = appendLeadRequestHistory(
            long,
            buildLeadRequestHistoryEntry('новая', TZ),
        );
        expect(appended).toHaveLength(LEAD_REQUEST_HISTORY_MAX_ENTRIES);
        expect(appended[appended.length - 1]).toContain('новая');
        expect(appended[0]).toContain('запись 1');
    });
});
