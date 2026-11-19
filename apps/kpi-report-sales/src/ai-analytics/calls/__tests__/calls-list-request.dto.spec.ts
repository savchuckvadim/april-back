import 'reflect-metadata';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { isPeriodWithinDays, periodDays } from '../dto/calls-period.validator';
import { CallsListRequestDto } from '../dto/calls-list-request.dto';

const pipe = new ValidationPipe({ whitelist: true, transform: true });
const base = {
    domain: 'gsr.bitrix24.ru',
    requesterUserId: '447',
    from: '2026-11-01',
    to: '2026-11-19',
};

const validate = (
    body: Record<string, unknown>,
): Promise<CallsListRequestDto> =>
    pipe.transform(
        { ...base, ...body },
        { type: 'body', metatype: CallsListRequestDto },
    ) as Promise<CallsListRequestDto>;

describe('CallsListRequestDto', () => {
    it('минимальный запрос проходит, необязательные поля пустые', async () => {
        const dto = await validate({});
        expect(dto.page).toBeUndefined();
        expect(dto.review).toBeUndefined();
    });

    it('период: не длиннее 92 дней и начало не позже конца', async () => {
        expect(periodDays('2026-11-01', '2026-11-01')).toBe(1);
        expect(isPeriodWithinDays('2026-09-01', '2026-12-01')).toBe(true);
        expect(isPeriodWithinDays('2026-09-01', '2026-12-02')).toBe(false);
        await expect(
            validate({ from: '2026-11-20', to: '2026-11-19' }),
        ).rejects.toBeInstanceOf(BadRequestException);
        await expect(
            validate({ from: '2026-01-01', to: '2026-11-19' }),
        ).rejects.toBeInstanceOf(BadRequestException);
        await expect(validate({ from: '01.11.2026' })).rejects.toBeInstanceOf(
            BadRequestException,
        );
    });

    it('страница с 1, размер не больше 100', async () => {
        await expect(validate({ page: 0 })).rejects.toBeInstanceOf(
            BadRequestException,
        );
        await expect(validate({ pageSize: 101 })).rejects.toBeInstanceOf(
            BadRequestException,
        );
        const dto = await validate({ page: 3, pageSize: 100 });
        expect(dto.page).toBe(3);
    });

    it('оценка 1–10, фильтры и порядок — только из справочников', async () => {
        await expect(validate({ scoreMin: 0 })).rejects.toBeInstanceOf(
            BadRequestException,
        );
        await expect(validate({ scoreMax: 11 })).rejects.toBeInstanceOf(
            BadRequestException,
        );
        await expect(validate({ review: 'mine' })).rejects.toBeInstanceOf(
            BadRequestException,
        );
        await expect(validate({ sort: 'name' })).rejects.toBeInstanceOf(
            BadRequestException,
        );
        await expect(validate({ managerIds: ['abc'] })).rejects.toBeInstanceOf(
            BadRequestException,
        );
        const dto = await validate({
            scoreMin: 2.5,
            scoreMax: 7,
            review: 'disagreed',
            sort: 'score_asc',
            managerIds: ['447'],
            callTypes: ['cold'],
        });
        expect(dto).toMatchObject({ scoreMin: 2.5, sort: 'score_asc' });
    });
});
