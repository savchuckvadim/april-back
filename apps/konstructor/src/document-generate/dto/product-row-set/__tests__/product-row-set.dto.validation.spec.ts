import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { ProductRowSetDto } from '../product-row-set.dto';

/** Те же настройки, что в libs/core bootstrap-app: whitelist режет свойства без валидаторов. */
const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: false,
    forbidUnknownValues: false,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
});

const transform = (body: unknown): Promise<ProductRowSetDto> =>
    pipe.transform(body, { type: 'body', metatype: ProductRowSetDto });

const set = (rows: Record<string, unknown[]>) => ({
    id: 0,
    show: false,
    rows,
    total: [],
});

/**
 * Счёт строит таблицу из sets[].rows, а итог — из sets[].total. Если ключ
 * продукта не объявлен в DTO, whitelist его молча срезает, и в счёте
 * «Итого» больше суммы строк (инцидент: Академия включена, строки нет).
 * Пустые массивы достаточны: whitelist режет необъявленный ключ
 * независимо от содержимого, а строки внутри валидируются как у garant.
 */
describe('ProductRowSetDto: ключи продуктов в rows', () => {
    it('academy и lt_other доходят до сервиса счёта', async () => {
        const dto = await transform(
            set({
                garant: [],
                lt: [],
                lt_other: [],
                consalting: [],
                star: [],
                academy: [],
            }),
        );
        expect(Object.keys(dto.rows).sort()).toEqual(
            [
                'academy',
                'consalting',
                'garant',
                'lt',
                'lt_other',
                'star',
            ].sort(),
        );
    });

    it('без academy и lt_other (старый фронт) — проходит', async () => {
        const dto = await transform(
            set({ garant: [], lt: [], consalting: [], star: [] }),
        );
        expect(dto.rows.academy).toBeUndefined();
        expect(dto.rows.lt_other).toBeUndefined();
    });

    // В сете может не быть консалтинга, LT, СТАР и т.д. — отсутствующий тип
    // не должен ронять всю генерацию КП/счёта ответом 400.
    it.each([
        ['только garant', { garant: [] }],
        ['пустой rows', {}],
        ['без консалтинга и СТАР', { garant: [], lt: [], academy: [] }],
    ])('%s — проходит', async (_label, rows) => {
        await expect(transform(set(rows))).resolves.toBeDefined();
    });

    it('null вместо массива у типа — проходит (тип пуст)', async () => {
        const dto = await transform({
            ...set({ garant: [] }),
            rows: { garant: [], consalting: null },
        });
        expect(dto.rows.consalting).toBeNull();
    });

    it('не массив у типа — 400', async () => {
        await expect(
            transform({ ...set({}), rows: { consalting: 'нет' } }),
        ).rejects.toBeInstanceOf(BadRequestException);
    });
});
