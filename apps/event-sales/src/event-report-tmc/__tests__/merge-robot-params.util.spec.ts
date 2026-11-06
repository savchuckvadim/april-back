import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { TmcPresentationApprovedDto } from '../dto/tmc-presentation-approved.dto';
import { mergeRobotParams } from '../lib/merge-robot-params.util';
import { normalizeApprovedPresentation } from '../lib/approved-presentation-flow-dto.builder';

/**
 * Регресс gsr 05–06.11.2026: робот слал `tmcDealId=216795` в адресе и
 * `auth[domain]` в теле, а ручка отвечала «Не передана ТМЦ-сделка» —
 * DTO тела после ValidationPipe несёт все поля как `undefined`, и spread
 * «тело поверх строки» затирал адрес. Воспроизводим ровно тем же пайпом.
 */
const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: false,
    forbidUnknownValues: false,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
});

const through = (value: Record<string, unknown>, type: 'body' | 'query') =>
    pipe.transform(value, {
        type,
        metatype: TmcPresentationApprovedDto,
    }) as Promise<TmcPresentationApprovedDto>;

describe('mergeRobotParams', () => {
    it('значения из адреса робота переживают пустые поля DTO тела; что есть в теле — побеждает', async () => {
        const query = await through(
            {
                commentOwner: '123',
                deadline: '06.11.2026 08:51:00',
                name: 'Заявка test демонстрация',
                ownerId: 'user_1',
                managerId: 'user_187',
                tmcId: 'user_187',
                tmcDealId: '216795',
                companyId: '117677',
                contactId: '',
            },
            'query',
        );
        const body = await through(
            { auth: { domain: 'gsr.bitrix24.ru' }, commentOwner: 'из тела' },
            'body',
        );
        // Именно так ломалось: у DTO тела поле есть, но пустое.
        expect(Object.keys(body)).toContain('tmcDealId');
        expect(body.tmcDealId).toBeUndefined();

        const merged = mergeRobotParams(query, body);

        expect(merged.tmcDealId).toBe(216795);
        expect(merged.companyId).toBe(117677);
        expect(merged.auth?.domain).toBe('gsr.bitrix24.ru');
        expect(merged.commentOwner).toBe('из тела');
        expect(normalizeApprovedPresentation(merged)).toMatchObject({
            domain: 'gsr.bitrix24.ru',
            tmcDealId: 216795,
            companyId: 117677,
            managerId: 187,
        });
    });

    it('простые объекты: undefined в теле не затирает, значение — затирает', () => {
        expect(
            mergeRobotParams(
                { a: 1, b: 2 } as Record<string, unknown>,
                {
                    a: undefined,
                    b: 3,
                } as Record<string, unknown>,
            ),
        ).toEqual({ a: 1, b: 3 });
    });
});
