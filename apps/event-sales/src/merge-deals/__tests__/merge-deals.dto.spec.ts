import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { MergeDealsRequestDto } from '../dto/merge-deals.dto';

describe('MergeDealsRequestDto', () => {
    const validateDto = async (plain: Record<string, unknown>) => {
        const dto = plainToInstance(MergeDealsRequestDto, plain);

        return validate(dto);
    };

    const validPlain = {
        domain: 'example.bitrix24.ru',
        targetDealId: 1024,
        sourceDealIds: [1025, 1026],
    };

    it('валидный запрос проходит валидацию', async () => {
        const errors = await validateDto(validPlain);

        expect(errors).toHaveLength(0);
    });

    it('dryRun опционален и принимает boolean', async () => {
        const errors = await validateDto({ ...validPlain, dryRun: true });

        expect(errors).toHaveLength(0);
    });

    it('пустой domain отклоняется', async () => {
        const errors = await validateDto({ ...validPlain, domain: '' });

        expect(errors.length).toBeGreaterThan(0);
    });

    it('нецелый targetDealId отклоняется', async () => {
        const errors = await validateDto({ ...validPlain, targetDealId: 1.5 });

        expect(errors.length).toBeGreaterThan(0);
    });

    it('targetDealId меньше 1 отклоняется', async () => {
        const errors = await validateDto({ ...validPlain, targetDealId: 0 });

        expect(errors.length).toBeGreaterThan(0);
    });

    it('пустой список sourceDealIds отклоняется', async () => {
        const errors = await validateDto({ ...validPlain, sourceDealIds: [] });

        expect(errors.length).toBeGreaterThan(0);
    });

    it('нечисловой элемент sourceDealIds отклоняется', async () => {
        const errors = await validateDto({
            ...validPlain,
            sourceDealIds: [1025, 'abc'],
        });

        expect(errors.length).toBeGreaterThan(0);
    });
});
