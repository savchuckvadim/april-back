import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CallReportAnalyticsQueryDto } from '../dto/call-report-analytics-query.dto';

const BASE = {
    domain: 'test.bitrix24.ru',
    from: '2026-08-01T00:00:00.000Z',
    to: '2026-08-31T00:00:00.000Z',
};

/** Валидация plain-объекта как в ValidationPipe; возвращает поля с ошибками. */
const validateQuery = async (plain: Record<string, unknown>) => {
    const dto = plainToInstance(CallReportAnalyticsQueryDto, plain);
    const errors = await validate(dto);
    return { dto, invalid: errors.map(error => error.property) };
};

describe('CallReportAnalyticsQueryDto (managerIds)', () => {
    it('без managerIds запрос валиден — поле опционально', async () => {
        const { dto, invalid } = await validateQuery(BASE);
        expect(invalid).toEqual([]);
        expect(dto.managerIds).toBeUndefined();
    });

    it('массив строк проходит и сохраняется как есть', async () => {
        const { dto, invalid } = await validateQuery({
            ...BASE,
            managerIds: ['7', '12'],
        });
        expect(invalid).toEqual([]);
        expect(dto.managerIds).toEqual(['7', '12']);
    });

    it('пустой массив валиден (фильтр «никто»)', async () => {
        const { dto, invalid } = await validateQuery({
            ...BASE,
            managerIds: [],
        });
        expect(invalid).toEqual([]);
        expect(dto.managerIds).toEqual([]);
    });

    it('managerId и managerIds можно передать вместе', async () => {
        const { invalid } = await validateQuery({
            ...BASE,
            managerId: '7',
            managerIds: ['12'],
        });
        expect(invalid).toEqual([]);
    });

    it('строка вместо массива — ошибка managerIds', async () => {
        const { invalid } = await validateQuery({
            ...BASE,
            managerIds: '7,12',
        });
        expect(invalid).toEqual(['managerIds']);
    });

    it('числа в массиве — ошибка managerIds', async () => {
        const { invalid } = await validateQuery({
            ...BASE,
            managerIds: [7, 12],
        });
        expect(invalid).toEqual(['managerIds']);
    });

    it('обязательные поля периода по-прежнему проверяются', async () => {
        const { invalid } = await validateQuery({ managerIds: ['7'] });
        expect(invalid).toEqual(
            expect.arrayContaining(['domain', 'from', 'to']),
        );
        expect(invalid).not.toContain('managerIds');
    });
});
