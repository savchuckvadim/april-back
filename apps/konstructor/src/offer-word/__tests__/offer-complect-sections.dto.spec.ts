import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate, ValidationError } from 'class-validator';
import {
    ComplectDto,
    OfferComplectSectionDto,
    OfferComplectsModeEnum,
} from '@app/konstructor/document-generate';
import { DocumentVariantDto } from '@app/konstructor/document-generate/dto/document-variant/document-variant.dto';
import { OfferPdfGenerateDto } from '../../offer-pdf/dto/offer-pdf-generate.dto';
import { OfferWordByTemplateGenerateDto } from '../dto/offer-word-generate-request.dto';
import { OfferWordPdfPreviewRequestDto } from '../dto/offer-word-pdf-preview-request.dto';
import { OfferWordMultiGenerateDto } from '../multi/dto/offer-word-multi-generate.dto';

/**
 * Глобальный ValidationPipe работает с whitelist: поле без декораторов
 * срезается. Комплекты со своим наполнением и режим печати должны дойти до
 * сервиса в запросе Word, PDF, превью и в каждом варианте; запрос без них
 * остаётся допустимым.
 */
const flatten = (errors: ValidationError[], prefix = ''): string[] =>
    errors.flatMap(error => {
        const path = prefix ? `${prefix}.${error.property}` : error.property;
        return [
            ...(error.constraints ? [path] : []),
            ...flatten(error.children ?? [], path),
        ];
    });

type Constructor<T> = new () => T;
/** Класс DTO с прототипом: по нему читаются метаданные Swagger */
type DtoClass = Constructor<object> & { prototype: object };

/** Как в bootstrap-app: неявные преобразования и whitelist. */
const check = async <T extends object>(type: Constructor<T>, body: object) => {
    const dto = plainToInstance(type, body, {
        enableImplicitConversion: true,
    });
    const errors = await validate(dto, {
        whitelist: true,
        forbidUnknownValues: false,
    });
    return { dto, paths: flatten(errors) };
};

const sectionBody = {
    title: 'ГАРАНТ-Профессионал. Бухгалтерия',
    supplyName: 'Интернет 3 ОД',
    complect: [
        {
            groupsName: 'Нормативно-правовые акты',
            type: 'npa',
            value: [
                { name: 'Законодательство России', checked: true, weight: 1 },
            ],
        },
    ],
};

const inComplects = (path: string): boolean =>
    path.startsWith('complects') || path.startsWith('complectsMode');

const REQUESTS: Array<[string, Constructor<object>]> = [
    ['базовый запрос КП', OfferWordByTemplateGenerateDto],
    ['запрос PDF-КП', OfferPdfGenerateDto],
    ['запрос превью Word-КП', OfferWordPdfPreviewRequestDto],
    ['запрос КП v2', OfferWordMultiGenerateDto],
    ['вариант комплекта', DocumentVariantDto],
];

describe.each(REQUESTS)('%s: комплекты со своим наполнением', (_name, type) => {
    it('запрос без complects и complectsMode допустим: ошибок по этим полям нет', async () => {
        const { dto, paths } = await check(type, {});

        const typed: {
            complects?: OfferComplectSectionDto[];
            complectsMode?: OfferComplectsModeEnum;
        } = dto;

        expect(paths.filter(inComplects)).toEqual([]);
        expect(typed.complects).toBeUndefined();
        expect(typed.complectsMode).toBeUndefined();
    });

    it('complects и complectsMode не срезаются whitelist и приводятся к своим классам', async () => {
        const { dto } = await check(type, {
            complects: [sectionBody],
            complectsMode: 'separate',
            чужоеПоле: 'срезается',
        });
        const typed: {
            complects?: OfferComplectSectionDto[];
            complectsMode?: OfferComplectsModeEnum;
        } = dto;

        expect(typed.complects).toHaveLength(1);
        expect(typed.complects?.[0]).toBeInstanceOf(OfferComplectSectionDto);
        expect(typed.complects?.[0].title).toBe(
            'ГАРАНТ-Профессионал. Бухгалтерия',
        );
        expect(typed.complects?.[0].supplyName).toBe('Интернет 3 ОД');
        expect(typed.complects?.[0].complect[0]).toBeInstanceOf(ComplectDto);
        expect(typed.complectsMode).toBe(OfferComplectsModeEnum.SEPARATE);
        expect(dto).not.toHaveProperty('чужоеПоле');
    });

    it('верные поля проходят проверку, поставка необязательна', async () => {
        const { paths } = await check(type, {
            complects: [
                sectionBody,
                { title: 'Юрист', complect: sectionBody.complect },
            ],
            complectsMode: 'merged',
        });

        expect(paths.filter(inComplects)).toEqual([]);
    });

    it('неизвестный режим печати — ошибка с путём до поля', async () => {
        const { paths } = await check(type, { complectsMode: 'wrong' });
        expect(paths).toContain('complectsMode');
    });

    it('complects не список — ошибка', async () => {
        const { paths } = await check(type, { complects: 'не список' });
        expect(paths).toContain('complects');
    });

    it('у комплекта нет названия или наполнение не список — ошибка с путём до поля', async () => {
        const { paths } = await check(type, {
            complects: [
                sectionBody,
                { supplyName: 'Интернет 1 ОД', complect: [] },
                { title: 'Юрист', complect: 'нет' },
            ],
        });

        expect(paths).toContain('complects.1.title');
        expect(paths).toContain('complects.2.complect');
        expect(paths.filter(path => path.startsWith('complects.0'))).toEqual(
            [],
        );
    });

    it('группа наполнения комплекта проверяется как обычное наполнение', async () => {
        const { paths } = await check(type, {
            complects: [
                {
                    title: 'Бухгалтерия',
                    complect: [{ ...sectionBody.complect[0], type: 'wrong' }],
                },
            ],
        });

        expect(paths).toContain('complects.0.complect.0.type');
    });
});

describe('Swagger: поля описаны по-русски и необязательные', () => {
    const properties: Array<{
        name: string;
        type: DtoClass;
        property: string;
    }> = [
        {
            name: 'запрос КП',
            type: OfferWordByTemplateGenerateDto,
            property: 'complects',
        },
        {
            name: 'запрос КП',
            type: OfferWordByTemplateGenerateDto,
            property: 'complectsMode',
        },
        {
            name: 'вариант комплекта',
            type: DocumentVariantDto,
            property: 'complects',
        },
        {
            name: 'вариант комплекта',
            type: DocumentVariantDto,
            property: 'complectsMode',
        },
    ];

    it.each(properties)('$name: поле $property', ({ type, property }) => {
        const meta: unknown = Reflect.getMetadata(
            'swagger/apiModelProperties',
            type.prototype,
            property,
        );

        expect(meta).toMatchObject({ required: false });
        expect(JSON.stringify(meta)).toMatch(/"description":"[^"]*[а-яё]/i);
    });

    it('режим — перечисление merged и separate, по умолчанию merged', () => {
        const meta: unknown = Reflect.getMetadata(
            'swagger/apiModelProperties',
            OfferWordByTemplateGenerateDto.prototype,
            'complectsMode',
        );

        expect(meta).toMatchObject({
            enum: ['merged', 'separate'],
            default: 'merged',
        });
        expect(Object.values(OfferComplectsModeEnum)).toEqual([
            'merged',
            'separate',
        ]);
    });

    it('описание элемента комплекта: название и наполнение обязательны, поставка нет', () => {
        const meta = (property: string): unknown =>
            Reflect.getMetadata(
                'swagger/apiModelProperties',
                OfferComplectSectionDto.prototype,
                property,
            );

        // обязательное поле Swagger помечает по умолчанию: required не пишется
        expect(meta('title')).not.toMatchObject({ required: false });
        expect(meta('complect')).not.toMatchObject({ required: false });
        expect(meta('supplyName')).toMatchObject({ required: false });
        for (const property of ['title', 'supplyName', 'complect']) {
            expect(JSON.stringify(meta(property))).toMatch(
                /"description":"[^"]*[а-яё]/i,
            );
        }
    });
});
