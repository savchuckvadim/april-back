import {
    AUDIT_ARG_DEFAULTS,
    parseAuditArgs,
} from '../audit/ai-analytics-audit.cli';

describe('parseAuditArgs', () => {
    it('подставляет значения по умолчанию', () => {
        expect(parseAuditArgs(['--domain', 'Example.Bitrix24.ru'])).toEqual({
            domain: 'example.bitrix24.ru',
            months: AUDIT_ARG_DEFAULTS.months,
            timeZone: AUDIT_ARG_DEFAULTS.timeZone,
            out: null,
        });
    });

    it('понимает формы --key value и --key=value', () => {
        expect(
            parseAuditArgs([
                '--domain=x.ru',
                '--months',
                '3',
                '--tz=UTC',
                '--out',
                'tmp/report.md',
            ]),
        ).toEqual({
            domain: 'x.ru',
            months: 3,
            timeZone: 'UTC',
            out: 'tmp/report.md',
        });
    });

    it('без --domain — ошибка с подсказкой', () => {
        expect(() => parseAuditArgs([])).toThrow('Не задан --domain');
        expect(() => parseAuditArgs(['--domain', ' '])).toThrow(
            'Не задан --domain',
        );
    });

    it('невалидные months и tz — ошибка', () => {
        expect(() =>
            parseAuditArgs(['--domain', 'x', '--months', '0']),
        ).toThrow('--months');
        expect(() =>
            parseAuditArgs(['--domain', 'x', '--months', '1.5']),
        ).toThrow('--months');
        expect(() =>
            parseAuditArgs(['--domain', 'x', '--tz', 'Mars/Olympus']),
        ).toThrow('часовой пояс');
    });

    it('лишний позиционный аргумент и флаг без значения — ошибка', () => {
        expect(() => parseAuditArgs(['x'])).toThrow('Неожиданный аргумент');
        expect(() => parseAuditArgs(['--domain'])).toThrow('Нет значения');
        expect(() => parseAuditArgs(['--domain', '--months', '3'])).toThrow(
            'Нет значения',
        );
    });
});
