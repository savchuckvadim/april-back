import * as fs from 'node:fs';
import * as path from 'node:path';
import {
    detectSkapFileKind,
    formatSkapPeriodCode,
    parseSkapPeriod,
    parseSkapTimedeltaToMs,
} from '../skap-decode.util';
import { SkapFileParseService } from '../skap-file-parse.service';
import { SkapFormatError } from '../skap-format.types';

const EXAMPLE_DIR = path.join(
    process.cwd(),
    'apps/event-service/src/skap/example',
    'статистка Ростов 2024 год/статистка Ростов 2024 год/август 2024/61-40762',
);

const readExample = (name: string): Buffer =>
    fs.readFileSync(path.join(EXAMPLE_DIR, name));

describe('SkapFileParseService — реальные фикстуры (август 2024, 61-40762)', () => {
    const service = new SkapFileParseService();

    it('Online.csv: header-map, типизированные строки', () => {
        const parsed = service.parseCsvBuffer(
            readExample('2024.09.03.Online.csv'),
            '2024.09.03.Online.csv',
        );
        expect(parsed.kind).toBe('online');
        expect(parsed.formatVersion).toBe('online_v1');
        expect(parsed.rows.length).toBeGreaterThan(2000);
        if (parsed.kind !== 'online') throw new Error('unreachable');
        const first = parsed.rows[0];
        expect(first.regList).toBe('61-40762');
        expect(first.clientCard).toBe('61-40762-000004');
        expect(first.complectArmId).toBe('361');
        expect(first.login).toBe('kazakovalv@oaorsm.ru');
        expect(first.sessionCount).toBe(7);
        // 20:19:49.705 → мс
        expect(first.timeMs).toBe(((20 * 60 + 19) * 60 + 49) * 1000 + 705);
        expect(parsed.warnings).toEqual([]);
    });

    it('Online_detail.csv: сессии с датами захода/выхода', () => {
        const parsed = service.parseCsvBuffer(
            readExample('2024.09.03.Online_detail.csv'),
            '2024.09.03.Online_detail.csv',
        );
        expect(parsed.kind).toBe('online_detail');
        if (parsed.kind !== 'online_detail') throw new Error('unreachable');
        expect(parsed.rows.length).toBeGreaterThan(10_000);
        const first = parsed.rows[0];
        expect(first.login).toBe('kazakovalv@oaorsm.ru');
        expect(first.startedAt).toEqual(new Date(2024, 7, 13, 12, 43));
        expect(first.endedAt).toEqual(new Date(2024, 7, 13, 15, 18));
        expect(first.ip).toBe('213.27.39.28');
        expect(first.durationMs).toBeGreaterThan(2 * 60 * 60 * 1000);
    });

    it('Prime_lent.csv: комплекты и рассылки', () => {
        const parsed = service.parseCsvBuffer(
            readExample('2024.09.03.Prime_lent.csv'),
            '2024.09.03.Prime_lent.csv',
        );
        expect(parsed.kind).toBe('prime_lent');
        if (parsed.kind !== 'prime_lent') throw new Error('unreachable');
        expect(parsed.rows.length).toBeGreaterThan(500);
        const first = parsed.rows[0];
        expect(first.clientCard).toBe('61-40762-000004');
        expect(first.complectName).toBe('ГАРАНТ-Главный Бухгалтер');
        expect(first.city).toBe('Ростов-на-Дону');
        expect(first.isActive).toBe(true);
    });
});

describe('защита от смены формата', () => {
    const service = new SkapFileParseService();

    it('перестановка и добавление колонок — работаем + ворнинг', () => {
        const csv = [
            'Логин;Номер карточки РП;Номер карточки Клиента;ID Комплекта;Общее количество заходов;Общее количество проведенного времени;Новая колонка',
            'user@x.ru;61-1;61-1-000001;5;3;0:10:00;мусор',
        ].join('\n');
        const parsed = service.parseRows('online', [
            csv.split('\n')[0].split(';'),
            csv.split('\n')[1].split(';'),
        ]);
        if (parsed.kind !== 'online') throw new Error('unreachable');
        expect(parsed.rows).toHaveLength(1);
        expect(parsed.rows[0].login).toBe('user@x.ru');
        expect(parsed.rows[0].clientCard).toBe('61-1-000001');
        expect(parsed.rows[0].sessionCount).toBe(3);
        const codes = parsed.warnings.map(warning => warning.code);
        expect(codes).toContain('format_extra_columns');
    });

    it('пропала обязательная колонка — SkapFormatError', () => {
        const header =
            'Номер карточки РП;Название РП;Общее количество заходов'.split(';');
        expect(() =>
            service.parseRows('online', [header, ['61-1', 'РП', '3']]),
        ).toThrow(SkapFormatError);
    });

    it('файл без заголовка — позиционный fallback + ворнинг', () => {
        const row =
            '61-40762;ИП Чураков А.В.;61-40762-000004;Ростовский литейный завод;361;Коммерческая;ГАРАНТ-Главный Бухгалтер;10-ОД;27.11.2019;user@x.ru;7;1;1.2.3.4;0:20:00'.split(
                ';',
            );
        const parsed = service.parseRows('online', [row]);
        if (parsed.kind !== 'online') throw new Error('unreachable');
        expect(parsed.rows).toHaveLength(1);
        expect(parsed.rows[0].login).toBe('user@x.ru');
        expect(parsed.warnings.map(warning => warning.code)).toContain(
            'format_no_header',
        );
    });
});

describe('утилиты декодирования', () => {
    it('detectSkapFileKind различает три вида и отбрасывает чужое', () => {
        expect(detectSkapFileKind('2024.09.03.Online.csv')).toBe('online');
        expect(detectSkapFileKind('2024.09.03.ONLINE_DETAIL.csv')).toBe(
            'online_detail',
        );
        expect(detectSkapFileKind('x.Prime_lent.csv')).toBe('prime_lent');
        expect(detectSkapFileKind('readme.txt')).toBeNull();
    });

    it('parseSkapPeriod: папка месяца, ISO-имя, отказ на дате выгрузки', () => {
        expect(parseSkapPeriod('август 2024')).toEqual(new Date(2024, 7, 1));
        expect(parseSkapPeriod('СКАП 2024-08.xlsx')).toEqual(
            new Date(2024, 7, 1),
        );
        // дата выгрузки в имени файла — НЕ отчётный месяц
        expect(parseSkapPeriod('2024.09.03.Online.csv')).toBeNull();
        expect(parseSkapPeriod('просто папка')).toBeNull();
    });

    it('formatSkapPeriodCode / parseSkapTimedeltaToMs', () => {
        expect(formatSkapPeriodCode(new Date(2024, 7, 1))).toBe('2024-08');
        expect(parseSkapTimedeltaToMs('2 days 01:00:00')).toBe(
            (2 * 24 + 1) * 60 * 60 * 1000,
        );
        expect(parseSkapTimedeltaToMs('0:00:05.5')).toBe(5500);
    });
});
