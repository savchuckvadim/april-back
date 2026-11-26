import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate, ValidationError } from 'class-validator';
import { OfferPdfGenerateDto } from '@app/konstructor/offer-pdf/dto/offer-pdf-generate.dto';
import { OfferWordMultiGenerateDto } from '@app/konstructor/offer-word/multi/dto/offer-word-multi-generate.dto';
import { ContractGenerateDto } from '@app/konstructor/contract/generate/dto/contract-generate.dto';
import { InitSupplyDto } from '@app/konstructor/supply/init-supply/dto/init-supply.dto';
import { SalesDocumentPresentationDto } from '../dto/sales-flow-fields';

/**
 * Проверка в тех же условиях, что в проде (global-validation-pipe): неявное
 * приведение типов и whitelist, который срезает поля без декораторов. Тело
 * неполное, поэтому смотрим только ошибки по полям потока продаж.
 */
type Ctor<T> = new () => T;

interface SalesFields {
    salesFlow?: unknown;
    presentation?: unknown;
}

const flatten = (errors: ValidationError[], prefix = ''): string[] =>
    errors.flatMap(error => {
        const path = prefix ? `${prefix}.${error.property}` : error.property;
        return [
            ...(error.constraints ? [path] : []),
            ...flatten(error.children ?? [], path),
        ];
    });

const check = async <T extends SalesFields>(
    metatype: Ctor<T>,
    body: Record<string, unknown>,
): Promise<{ dto: T; paths: string[] }> => {
    const dto = plainToInstance(metatype, body, {
        enableImplicitConversion: true,
    });
    const errors = await validate(dto, {
        whitelist: true,
        forbidUnknownValues: false,
    });
    const paths = flatten(errors).filter(
        path => path.startsWith('salesFlow') || path.startsWith('presentation'),
    );
    return { dto, paths };
};

const documents: Array<[string, Ctor<SalesFields>]> = [
    ['КП Word v2 (generate-multi)', OfferWordMultiGenerateDto],
    ['КП PDF (offer-pdf/generate)', OfferPdfGenerateDto],
    ['договор (contract/generate)', ContractGenerateDto],
    ['запуск поставки (konstructor/init-supply)', InitSupplyDto],
];

describe.each(documents)('%s: признак salesFlow', (_title, metatype) => {
    it('true доходит до сервиса и проходит проверку', async () => {
        const { dto, paths } = await check(metatype, { salesFlow: true });

        expect(paths).toEqual([]);
        expect(dto.salesFlow).toBe(true);
    });

    it('false проходит проверку', async () => {
        const { dto, paths } = await check(metatype, { salesFlow: false });

        expect(paths).toEqual([]);
        expect(dto.salesFlow).toBe(false);
    });

    it('без поля ошибок нет: старые клиенты работают как раньше', async () => {
        const { dto, paths } = await check(metatype, {});

        expect(paths).toEqual([]);
        expect(dto.salesFlow).toBeUndefined();
    });

    it('строка «false» не превращается в true и отклоняется', async () => {
        const { paths } = await check(metatype, { salesFlow: 'false' });

        expect(paths).toEqual(['salesFlow']);
    });

    it('число отклоняется', async () => {
        const { paths } = await check(metatype, { salesFlow: 1 });

        expect(paths).toEqual(['salesFlow']);
    });
});

describe.each([
    ['КП Word v2 (generate-multi)', OfferWordMultiGenerateDto],
    ['КП PDF (offer-pdf/generate)', OfferPdfGenerateDto],
] as Array<[string, Ctor<SalesFields>]>)(
    '%s: блок presentation',
    (_title, metatype) => {
        it('пустой объект проходит и остаётся пустым блоком', async () => {
            const { dto, paths } = await check(metatype, { presentation: {} });

            expect(paths).toEqual([]);
            expect(dto.presentation).toBeInstanceOf(
                SalesDocumentPresentationDto,
            );
            expect(dto.presentation).toEqual({});
        });

        it('dealId доходит до сервиса числом', async () => {
            const { dto, paths } = await check(metatype, {
                presentation: { dealId: 1234 },
            });

            expect(paths).toEqual([]);
            expect(dto.presentation).toEqual({ dealId: 1234 });
        });

        it('dealId строкой приводится к числу', async () => {
            const { dto, paths } = await check(metatype, {
                presentation: { dealId: '1234' },
            });

            expect(paths).toEqual([]);
            expect(dto.presentation).toEqual({ dealId: 1234 });
        });

        it('без блока поле остаётся пустым', async () => {
            const { dto } = await check(metatype, {});

            expect(dto.presentation).toBeUndefined();
        });

        it.each([[0], [-5], [1.5], ['abc']])(
            'dealId %p отклоняется',
            async dealId => {
                const { paths } = await check(metatype, {
                    presentation: { dealId },
                });

                expect(paths).toEqual(['presentation.dealId']);
            },
        );
    },
);
