import { normalizeReportPeriod, ReportPeriodError } from '../lib/date-util';

describe('normalizeReportPeriod', () => {
    it('канон YYYY-MM-DD: границы включительны, в Битрикс уходит DD.MM.YYYY (to+1 экскл.)', () => {
        expect(normalizeReportPeriod('2026-07-01', '2026-07-30')).toEqual({
            fromIso: '2026-07-01',
            toIsoInclusive: '2026-07-30',
            toIsoExclusive: '2026-07-31',
            legacyFormat: false,
            // В Битрикс — только исторически проверенный формат
            // (lists.element.get не понимает ISO: инцидент 2026-07-30)
            bitrixFrom: '01.07.2026',
            bitrixTo: '31.07.2026',
        });
    });

    it('ISO с временем — время отбрасывается', () => {
        const period = normalizeReportPeriod(
            '2026-07-01T00:00:00+03:00',
            '2026-07-30T23:59:59+03:00',
        );
        expect(period.fromIso).toBe('2026-07-01');
        expect(period.toIsoInclusive).toBe('2026-07-30');
    });

    it('легаси DD.MM.YYYY: dateTo уже эксклюзивна, в Битрикс уходят ИСХОДНЫЕ строки (как прод)', () => {
        expect(normalizeReportPeriod('01.07.2026', '31.07.2026')).toEqual({
            fromIso: '2026-07-01',
            toIsoInclusive: '2026-07-30',
            toIsoExclusive: '2026-07-31',
            legacyFormat: true,
            // Страховка обратной совместимости: фильтры Битрикса получают
            // те же строки, что шлёт старый фронт, — поведение не меняется.
            bitrixFrom: '01.07.2026',
            bitrixTo: '31.07.2026',
        });
    });

    it('один логический период в обоих форматах → одинаковые нормализованные границы', () => {
        const canonical = normalizeReportPeriod('2026-07-01', '2026-07-30');
        const legacy = normalizeReportPeriod('01.07.2026', '31.07.2026');
        expect(legacy.fromIso).toBe(canonical.fromIso);
        expect(legacy.toIsoInclusive).toBe(canonical.toIsoInclusive);
        expect(legacy.toIsoExclusive).toBe(canonical.toIsoExclusive);
    });

    it('легаси через границу месяца — без UTC-сдвига дня (регресс parseToISO)', () => {
        const period = normalizeReportPeriod('01.07.2026', '01.08.2026');
        expect(period.toIsoInclusive).toBe('2026-07-31');
        expect(period.toIsoExclusive).toBe('2026-08-01');
    });

    it('смешанные форматы → ReportPeriodError', () => {
        expect(() => normalizeReportPeriod('2026-07-01', '31.07.2026')).toThrow(
            ReportPeriodError,
        );
    });

    it('мусор вместо даты → ReportPeriodError с именем поля', () => {
        expect(() => normalizeReportPeriod('июль', '2026-07-30')).toThrow(
            /dateFrom/,
        );
    });

    it('несуществующая дата (31.02) → ReportPeriodError', () => {
        expect(() => normalizeReportPeriod('31.02.2026', '01.03.2026')).toThrow(
            ReportPeriodError,
        );
    });

    it('начало позже конца → ReportPeriodError', () => {
        expect(() => normalizeReportPeriod('2026-07-30', '2026-07-01')).toThrow(
            ReportPeriodError,
        );
    });
});
