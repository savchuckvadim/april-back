import { BadRequestException } from '@nestjs/common';
import { createGlobalValidationPipe } from '@lib/core/bootstrap/global-validation-pipe';
import { CreateOfferLetterDto } from '../dto/create-offer-letter.dto';
import { OfferLettersQueryDto } from '../dto/offer-letters-query.dto';
import { UpdateOfferLetterDto } from '../dto/update-offer-letter.dto';

/** Тела писем через тот же ValidationPipe, что и в проде */
const pipe = createGlobalValidationPipe();

const parse = <T>(
    metatype: new () => T,
    value: Record<string, unknown>,
    type: 'body' | 'query' = 'body',
): Promise<T> => pipe.transform(value, { type, metatype }) as Promise<T>;

const rejected = async (
    metatype: new () => object,
    value: Record<string, unknown>,
): Promise<boolean> => {
    try {
        await parse(metatype, value);
        return false;
    } catch (error) {
        return error instanceof BadRequestException;
    }
};

const VALID = { portalId: 12, name: 'Письмо', text: 'Добрый день!' };

describe('DTO писем КП через ValidationPipe', () => {
    it('письмо портала: менеджер не указан или null', async () => {
        const omitted = await parse(CreateOfferLetterDto, VALID);
        const explicit = await parse(CreateOfferLetterDto, {
            ...VALID,
            bxUserId: null,
        });
        expect(omitted.bxUserId).toBeUndefined();
        expect(explicit.bxUserId).toBeNull();
    });

    it('личное письмо менеджера принимает положительное целое', async () => {
        const dto = await parse(CreateOfferLetterDto, {
            ...VALID,
            bxUserId: 1480,
        });
        expect(dto.bxUserId).toBe(1480);
        expect(
            await rejected(CreateOfferLetterDto, { ...VALID, bxUserId: 0 }),
        ).toBe(true);
        expect(
            await rejected(CreateOfferLetterDto, { ...VALID, bxUserId: 1.5 }),
        ).toBe(true);
    });

    it('обязательные поля: портал, название, текст', async () => {
        expect(
            await rejected(CreateOfferLetterDto, { name: 'x', text: 'y' }),
        ).toBe(true);
        expect(
            await rejected(CreateOfferLetterDto, { ...VALID, name: '' }),
        ).toBe(true);
        expect(
            await rejected(CreateOfferLetterDto, { ...VALID, text: '' }),
        ).toBe(true);
    });

    it('длина названия и текста ограничена', async () => {
        expect(
            await rejected(CreateOfferLetterDto, {
                ...VALID,
                name: 'я'.repeat(256),
            }),
        ).toBe(true);
        expect(
            await rejected(CreateOfferLetterDto, {
                ...VALID,
                text: 'я'.repeat(5001),
            }),
        ).toBe(true);
    });

    it('порядок — неотрицательное целое в пределах', async () => {
        expect(
            await rejected(CreateOfferLetterDto, { ...VALID, sort: -1 }),
        ).toBe(true);
        expect(
            await rejected(CreateOfferLetterDto, { ...VALID, sort: 100001 }),
        ).toBe(true);
        const dto = await parse(CreateOfferLetterDto, { ...VALID, sort: 10 });
        expect(dto.sort).toBe(10);
    });

    it('правка: все поля необязательны, лишние (в том числе портал и менеджер) срезаются', async () => {
        const dto = await parse(UpdateOfferLetterDto, {
            name: 'Новое',
            portalId: 99,
            bxUserId: 5,
            isDefault: true,
        });
        expect(dto).toEqual({ name: 'Новое' });
    });

    it('правка: пустое название и текст отклоняются', async () => {
        expect(await rejected(UpdateOfferLetterDto, { name: '' })).toBe(true);
        expect(await rejected(UpdateOfferLetterDto, { text: '' })).toBe(true);
    });

    it('список: портал обязателен и приходит строкой из query', async () => {
        const dto = await parse(
            OfferLettersQueryDto,
            { portalId: '12' },
            'query',
        );
        expect(dto.portalId).toBe(12);
        expect(await rejected(OfferLettersQueryDto, {})).toBe(true);
        expect(await rejected(OfferLettersQueryDto, { portalId: '0' })).toBe(
            true,
        );
    });
});
