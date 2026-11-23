import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate, ValidationError } from 'class-validator';
import { DocumentVariantDto } from '@app/konstructor/document-generate/dto/document-variant/document-variant.dto';
import { ComplectCompositionDto } from '@app/konstructor/modules/inner-deal/dto/complect-composition.dto';
import { OfferPdfGenerateDto } from '../dto/offer-pdf-generate.dto';

/**
 * Глобальный ValidationPipe работает с whitelist: поле без декораторов
 * срезается. variants и composition должны пройти валидацию и дойти до
 * сервиса; запрос без них остаётся допустимым.
 */
const flatten = (errors: ValidationError[], prefix = ''): string[] =>
    errors.flatMap(error => {
        const path = prefix ? `${prefix}.${error.property}` : error.property;
        return [
            ...(error.constraints ? [path] : []),
            ...flatten(error.children ?? [], path),
        ];
    });

/** Как в bootstrap-app: неявные преобразования и whitelist. */
const check = async (body: object) => {
    const dto = plainToInstance(OfferPdfGenerateDto, body, {
        enableImplicitConversion: true,
    });
    const errors = await validate(dto, {
        whitelist: true,
        forbidUnknownValues: false,
    });
    return { dto, paths: flatten(errors) };
};

const variantBody = {
    variantSmartId: 11,
    title: 'Юрист',
    contractType: 'abon',
    complect: [],
    rows: [],
};

const compositionBody = {
    mode: 'multi_contract',
    offer: {
        infoblocks: 'independent',
        showAlternatives: false,
        separateDocuments: true,
    },
    openVariantSmartId: null,
};

const inVariantsOrComposition = (path: string): boolean =>
    path.startsWith('variants') || path.startsWith('composition');

describe('OfferPdfGenerateDto: варианты комплекта', () => {
    it('запрос без variants и composition допустим: ошибок по этим полям нет', async () => {
        const { dto, paths } = await check({});

        expect(paths.filter(inVariantsOrComposition)).toEqual([]);
        expect(dto.variants).toBeUndefined();
        expect(dto.composition).toBeUndefined();
    });

    it('variants и composition не срезаются whitelist и приводятся к своим классам', async () => {
        const { dto } = await check({
            variants: [variantBody],
            composition: compositionBody,
            чужоеПоле: 'срезается',
        });

        expect(dto.variants).toHaveLength(1);
        expect(dto.variants?.[0]).toBeInstanceOf(DocumentVariantDto);
        expect(dto.variants?.[0].title).toBe('Юрист');
        expect(dto.variants?.[0].variantSmartId).toBe(11);
        expect(dto.composition).toBeInstanceOf(ComplectCompositionDto);
        expect(dto.composition?.mode).toBe('multi_contract');
        expect(dto.composition?.offer.separateDocuments).toBe(true);
        // whitelist работает: поле без декораторов срезано
        expect(dto).not.toHaveProperty('чужоеПоле');
    });

    it('верные поля варианта и настройки сборки проходят проверку', async () => {
        const { paths } = await check({
            variants: [variantBody],
            composition: compositionBody,
        });

        expect(paths).not.toContain('composition');
        expect(paths.filter(path => path.startsWith('composition'))).toEqual(
            [],
        );
        for (const field of [
            'variantSmartId',
            'title',
            'contractType',
            'complect',
            'rows',
        ]) {
            expect(paths).not.toContain(`variants.0.${field}`);
        }
    });

    it('variants не список — ошибка', async () => {
        const { paths } = await check({ variants: 'не список' });
        expect(paths).toContain('variants');
    });

    it('неизвестный тип договора у варианта — ошибка с путём до поля', async () => {
        const { paths } = await check({
            variants: [variantBody, { ...variantBody, contractType: 'wrong' }],
        });

        expect(paths).toContain('variants.1.contractType');
        expect(paths).not.toContain('variants.0.contractType');
    });

    it('неизвестный режим сборки — ошибка с путём до поля', async () => {
        const { paths } = await check({
            composition: { ...compositionBody, mode: 'wrong' },
        });
        expect(paths).toContain('composition.mode');
    });

    it('в Swagger поля необязательные и описаны по-русски', () => {
        for (const property of ['variants', 'composition']) {
            const meta: unknown = Reflect.getMetadata(
                'swagger/apiModelProperties',
                OfferPdfGenerateDto.prototype,
                property,
            );

            expect(meta).toMatchObject({ required: false });
            // описание задано и написано по-русски
            expect(JSON.stringify(meta)).toMatch(/"description":"[^"]*[а-яё]/i);
        }
    });
});
