import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import { formatRu } from '../format-ru';

dayjs.extend(utc);
dayjs.extend(timezone);

/**
 * Счёт конструктора печатал «1 October 2026 г.»: русскую локаль dayjs
 * ставил глобально чужой сервис, и после распила монорепы её не стало.
 * formatRu не зависит от глобальной локали.
 */
describe('formatRu — дата по-русски независимо от глобальной локали dayjs', () => {
    afterEach(() => {
        dayjs.locale('en');
    });

    it('месяц по-русски, даже если глобально стоит английская локаль', () => {
        dayjs.locale('en');
        expect(formatRu('2026-10-01T12:00:00Z', 'D MMMM YYYY [г.]')).toBe(
            '1 октября 2026 г.',
        );
    });

    it('часовой пояс сохраняется: полночь по Москве — уже следующий день', () => {
        const moscow = dayjs('2026-09-30T21:30:00Z').tz('Europe/Moscow');
        expect(formatRu(moscow, 'D MMMM HH:mm')).toBe('1 октября 00:30');
    });

    it('глобальную локаль не трогает', () => {
        dayjs.locale('en');
        formatRu('2026-10-01', 'MMMM');
        expect(dayjs('2026-10-01').format('MMMM')).toBe('October');
    });
});
