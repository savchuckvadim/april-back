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

describe('DealSendDto: ключ повтора и метка сборки', () => {
    it('requestKey и clientBuild доходят до use-case (whitelist не режет)', async () => {
        const dto = await transform({
            ...body('Гарант-Юрист'),
            requestKey: 'a1b2c3d4-0000-4000-8000-000000000001',
            clientBuild: '2026-11-11T13:03 caece3a2',
        });

        expect(dto.requestKey).toBe('a1b2c3d4-0000-4000-8000-000000000001');
        expect(dto.clientBuild).toBe('2026-11-11T13:03 caece3a2');
    });

    it('слишком длинный requestKey — 400', async () => {
        await expect(
            transform({ ...body('Гарант-Юрист'), requestKey: 'x'.repeat(101) }),
        ).rejects.toBeInstanceOf(BadRequestException);
    });
});
