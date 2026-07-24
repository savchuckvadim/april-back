import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ClosedSalesRequestDto } from '../dto/closed-sales-request.dto';
import { HotClientsRequestDto } from '../dto/hot-clients-request.dto';
import { SalesFinanceCacheResetRequestDto } from '../dto/cache-reset.dto';

async function validateDto<T extends object>(
    cls: new () => T,
    plain: object,
): Promise<string[]> {
    const instance = plainToInstance(cls, plain);
    const errors = await validate(instance, { whitelist: true });
    return errors.flatMap(error => [
        error.property,
        ...(error.children ?? []).map(child => child.property),
    ]);
}

const validClosed = {
    domain: 'april.bitrix24.ru',
    filters: {
        assignedIds: [1, 2],
        dateFrom: '2026-01-01',
        dateTo: '2026-06-30',
    },
};

describe('DTO валидация sales-finance', () => {
    it('валидный запрос закрытых продаж проходит', async () => {
        expect(await validateDto(ClosedSalesRequestDto, validClosed)).toEqual(
            [],
        );
    });

    it('пустой assignedIds отклоняется', async () => {
        const failed = await validateDto(ClosedSalesRequestDto, {
            ...validClosed,
            filters: { ...validClosed.filters, assignedIds: [] },
        });
        expect(failed).toContain('assignedIds');
    });

    it('невалидная ISO-дата отклоняется', async () => {
        const failed = await validateDto(ClosedSalesRequestDto, {
            ...validClosed,
            filters: { ...validClosed.filters, dateFrom: 'не дата' },
        });
        expect(failed).toContain('dateFrom');
    });

    it('невалидный threshold отклоняется, валидный проходит', async () => {
        expect(
            await validateDto(HotClientsRequestDto, {
                domain: 'd.ru',
                threshold: 'wrong',
            }),
        ).toContain('threshold');
        expect(
            await validateDto(HotClientsRequestDto, {
                domain: 'd.ru',
                threshold: 'presentation',
            }),
        ).toEqual([]);
    });

    it('невалидный scope сброса кэша отклоняется', async () => {
        expect(
            await validateDto(SalesFinanceCacheResetRequestDto, {
                domain: 'd.ru',
                scope: 'everything',
            }),
        ).toContain('scope');
        expect(
            await validateDto(SalesFinanceCacheResetRequestDto, {
                domain: 'd.ru',
            }),
        ).toEqual([]);
    });
});
