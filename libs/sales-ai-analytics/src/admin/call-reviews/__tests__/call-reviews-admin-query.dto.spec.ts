import { BadRequestException } from '@nestjs/common';
import { createGlobalValidationPipe } from '@lib/core/bootstrap/global-validation-pipe';
import { CallReviewsAdminQueryDto } from '../dto/call-reviews-admin-query.dto';

/** Запрос списка — через тот же ValidationPipe, что в bootstrapApp. */
const pipe = createGlobalValidationPipe();

const parse = async (
    value: Record<string, unknown>,
): Promise<CallReviewsAdminQueryDto> =>
    (await pipe.transform(value, {
        type: 'query',
        metatype: CallReviewsAdminQueryDto,
    })) as CallReviewsAdminQueryDto;

const BASE = {
    domain: ' GSR.bitrix24.ru ',
    from: '2026-11-01',
    to: '2026-11-19',
};

describe('CallReviewsAdminQueryDto', () => {
    it('строки запроса → числа страницы, домен в нижнем регистре без пробелов', async () => {
        const dto = await parse({
            ...BASE,
            page: '2',
            pageSize: '20',
            agree: 'no',
            itemKind: 'methodology',
        });

        expect(dto).toMatchObject({
            domain: 'gsr.bitrix24.ru',
            page: 2,
            pageSize: 20,
            agree: 'no',
            itemKind: 'methodology',
        });
    });

    it.each([
        ['без домена', { ...BASE, domain: '' }],
        ['кривая дата', { ...BASE, from: '01.11.2026' }],
        ['страница больше 200', { ...BASE, pageSize: '201' }],
        ['чужое значение согласия', { ...BASE, agree: 'maybe' }],
        ['чужой вид «не так»', { ...BASE, itemKind: 'manager' }],
    ])('%s — 400', async (_name, value) => {
        await expect(parse(value)).rejects.toBeInstanceOf(BadRequestException);
    });
});
