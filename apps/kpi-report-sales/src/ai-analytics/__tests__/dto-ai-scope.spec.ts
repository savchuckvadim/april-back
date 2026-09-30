import 'reflect-metadata';

import { AiByTypeCoverageDto } from '../dto/ai-by-type-coverage.dto';
import { AiByTypeDto } from '../dto/ai-by-type.dto';
import { AiOverviewMetaDto, AiOverviewScopeDto } from '../dto/ai-overview.dto';

/**
 * Контракт Swagger периметра вкладки AI (решение владельца 30.09.2026):
 * meta.scope обзора, счётчики исключений матрицы и покрытие среза by-type.
 * Спек читает метаданные @nestjs/swagger у реальных классов: у каждого поля
 * русское описание, пример нужного типа, поля обязательны (форма пришла с
 * версией ключа обзора v5 — записей старой формы кэш не отдаёт).
 */
const SWAGGER_PROPS = 'swagger/apiModelProperties';

interface PropMeta {
    readonly type?: unknown;
    readonly example?: unknown;
    readonly description?: unknown;
    readonly required?: unknown;
}

function metaOf(dto: { prototype: object }, prop: string): PropMeta {
    return (Reflect.getMetadata(SWAGGER_PROPS, dto.prototype, prop) ??
        {}) as PropMeta;
}

const CYRILLIC = /[а-яё]/i;

function expectDocumentedNumber(meta: PropMeta): void {
    expect(meta.type).toBe(Number);
    expect(typeof meta.example).toBe('number');
    expect(meta.description).toMatch(CYRILLIC);
    expect(meta.required).not.toBe(false);
}

describe('AiOverviewScopeDto (meta.scope обзора)', () => {
    it('pilotActive — обязательный флаг с описанием и примером', () => {
        const meta = metaOf(AiOverviewScopeDto, 'pilotActive');

        expect(meta.type).toBe(Boolean);
        expect(typeof meta.example).toBe('boolean');
        expect(meta.description).toMatch(CYRILLIC);
        expect(meta.required).not.toBe(false);
    });

    it.each(['shownManagers', 'hiddenByPilot'])(
        '%s — обязательное число с описанием и примером',
        prop => expectDocumentedNumber(metaOf(AiOverviewScopeDto, prop)),
    );

    it('в AiOverviewMetaDto блок scope типизирован AiOverviewScopeDto', () => {
        const meta = metaOf(AiOverviewMetaDto, 'scope');

        expect(meta.type).toBe(AiOverviewScopeDto);
        expect(meta.description).toMatch(CYRILLIC);
        expect(meta.required).not.toBe(false);
    });
});

describe('AiOverviewMetaDto: счётчики исключений и честные описания объёмов', () => {
    it.each(['excludedShort', 'excludedNoType', 'excludedNoAnalysis'])(
        '%s — обязательное число с описанием и примером',
        prop => expectDocumentedNumber(metaOf(AiOverviewMetaDto, prop)),
    );

    it('totalCalls — звонки AI-конвейера, не телефонии; skippedNoManager — без сохранённого сотрудника', () => {
        expect(metaOf(AiOverviewMetaDto, 'totalCalls').description).toMatch(
            /обработанных AI-конвейером.*не звонки телефонии/,
        );
        expect(
            metaOf(AiOverviewMetaDto, 'skippedNoManager').description,
        ).toMatch(/не сохранён сотрудник/);
    });
});

describe('AiByTypeCoverageDto (coverage среза by-type)', () => {
    it('comparableFrom — строка-дата с примером', () => {
        const meta = metaOf(AiByTypeCoverageDto, 'comparableFrom');

        expect(meta.type).toBe(String);
        expect(meta.example).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(meta.description).toMatch(CYRILLIC);
    });

    it.each([
        'analyzedCalls',
        'excludedBeforeComparable',
        'excludedShort',
        'excludedNoType',
    ])('%s — обязательное число с описанием и примером', prop =>
        expectDocumentedNumber(metaOf(AiByTypeCoverageDto, prop)),
    );

    it('в AiByTypeDto поле coverage типизировано AiByTypeCoverageDto', () => {
        const meta = metaOf(AiByTypeDto, 'coverage');

        expect(meta.type).toBe(AiByTypeCoverageDto);
        expect(meta.description).toMatch(CYRILLIC);
    });
});
