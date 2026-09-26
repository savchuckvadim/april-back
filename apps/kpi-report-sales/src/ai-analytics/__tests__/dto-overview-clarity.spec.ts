import 'reflect-metadata';

import {
    AI_ANALYTICS_LEVEL_SOURCES,
    AI_ANALYTICS_SINCE_SOURCES,
} from '../constants/ai-overview.const';
import {
    AiManagerRowDto,
    AiManagerRowTenureDto,
} from '../dto/ai-manager-row.dto';
import { AiOverviewMetaDto } from '../dto/ai-overview.dto';
import { AiCallReportStatusDto } from '../dto/ai-settings-call-report.dto';
import { AiAnalyticsSettingsDto } from '../dto/ai-settings.dto';

/**
 * Контракт Swagger новых полей «что настроить, а что ждать»: источник
 * уровня passport, источник даты стажа, счётчик несопоставимых разборов и
 * статус конвейера разбора. Спек читает метаданные @nestjs/swagger у
 * реальных классов: enum берётся из runtime-констант, у каждого поля есть
 * русское описание и пример, новые поля необязательны (кэш обзора,
 * собранный раньше, их не содержит).
 */
const SWAGGER_PROPS = 'swagger/apiModelProperties';

interface PropMeta {
    readonly type?: unknown;
    readonly enum?: unknown;
    readonly example?: unknown;
    readonly description?: unknown;
    readonly required?: unknown;
    readonly nullable?: unknown;
    readonly isArray?: unknown;
}

function metaOf(dto: { prototype: object }, prop: string): PropMeta {
    return (Reflect.getMetadata(SWAGGER_PROPS, dto.prototype, prop) ??
        {}) as PropMeta;
}

const CYRILLIC = /[а-яё]/i;

function expectDocumented(meta: PropMeta): void {
    expect(typeof meta.description).toBe('string');
    expect(meta.description).toMatch(CYRILLIC);
    expect(meta.example).toBeDefined();
}

describe('AiManagerRowDto: уровень и стаж', () => {
    it('levelSource: enum из runtime-константы, в нём passport', () => {
        const meta = metaOf(AiManagerRowDto, 'levelSource');

        expect(meta.enum).toEqual([...AI_ANALYTICS_LEVEL_SOURCES]);
        expect(meta.enum).toContain('passport');
        expect(meta.example).toBe('passport');
        expectDocumented(meta);
    });

    it('since и sinceSource — необязательные поля базового класса строки', () => {
        const since = metaOf(AiManagerRowDto, 'since');
        const sinceSource = metaOf(AiManagerRowDto, 'sinceSource');

        expect(since.required).toBe(false);
        expect(since.type).toBe(String);
        expectDocumented(since);
        expect(sinceSource.required).toBe(false);
        expect(sinceSource.enum).toEqual([...AI_ANALYTICS_SINCE_SOURCES]);
        expect(AI_ANALYTICS_SINCE_SOURCES).toEqual([
            'manual',
            'employment',
            'register',
            'proxy',
        ]);
        expect(sinceSource.enum).toContain(sinceSource.example);
        expectDocumented(sinceSource);
        expect(new AiManagerRowDto()).toBeInstanceOf(AiManagerRowTenureDto);
    });
});

describe('AiOverviewMetaDto.excludedBeforeComparable', () => {
    it('необязательное число с описанием и примером', () => {
        const meta = metaOf(AiOverviewMetaDto, 'excludedBeforeComparable');

        expect(meta.required).toBe(false);
        expect(meta.type).toBe(Number);
        expect(typeof meta.example).toBe('number');
        expectDocumented(meta);
    });
});

describe('AiCallReportStatusDto (settings/get → callReport)', () => {
    it.each(['enabled', 'pilotUserIds', 'salesOnly', 'minDurationSec'])(
        '%s описан по-русски и с примером',
        prop => {
            expectDocumented(metaOf(AiCallReportStatusDto, prop));
        },
    );

    it('pilotUserIds — nullable массив строк; salesOnly и порог nullable', () => {
        const pilot = metaOf(AiCallReportStatusDto, 'pilotUserIds');

        expect(pilot.isArray).toBe(true);
        expect(pilot.nullable).toBe(true);
        expect(pilot.example).toEqual(['512']);
        expect(metaOf(AiCallReportStatusDto, 'salesOnly').nullable).toBe(true);
        expect(metaOf(AiCallReportStatusDto, 'minDurationSec').nullable).toBe(
            true,
        );
        expect(
            metaOf(AiCallReportStatusDto, 'enabled').nullable,
        ).toBeUndefined();
    });

    it('в AiAnalyticsSettingsDto блок необязателен (нет поля — статус не прочитан)', () => {
        const meta = metaOf(AiAnalyticsSettingsDto, 'callReport');

        expect(meta.required).toBe(false);
        expect(meta.type).toBe(AiCallReportStatusDto);
        expect(meta.description).toMatch(CYRILLIC);
    });
});
