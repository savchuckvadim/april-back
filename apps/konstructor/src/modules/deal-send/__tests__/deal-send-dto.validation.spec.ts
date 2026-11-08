import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { DealSendDto } from '../dto/deal-send.dto';
import { isDealFieldValue } from '../dto/is-deal-field-value.validator';

/** Те же настройки, что в libs/core bootstrap-app: whitelist режет свойства без валидаторов. */
const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: false,
    forbidUnknownValues: false,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
});

const transform = (body: unknown): Promise<DealSendDto> =>
    pipe.transform(body, { type: 'body', metatype: DealSendDto });

const body = (value: unknown) => ({
    domain: 'april-garant.bitrix24.ru',
    dealId: 35018,
    fields: [{ code: 'complect_name', appType: 'product', value }],
});

describe('DealSendDto: значения полей сделки', () => {
    it.each([
        ['строка', 'Гарант-Юрист'],
        ['число', 12],
        ['флаг', true],
        ['массив строк', ['Блок 1', 'Блок 2']],
    ])('%s доходит до use-case', async (_label, value) => {
        const dto = await transform(body(value));
        expect(dto.fields[0].value).toEqual(value);
    });

    it.each([
        ['объект', { a: 1 }],
        ['массив с числом', ['Блок', 1]],
        ['null', null],
        ['без значения', undefined],
    ])('%s — 400', async (_label, value) => {
        await expect(transform(body(value))).rejects.toBeInstanceOf(
            BadRequestException,
        );
    });

    it('isDealFieldValue отбрасывает NaN', () => {
        expect(isDealFieldValue(Number.NaN)).toBe(false);
    });
});
