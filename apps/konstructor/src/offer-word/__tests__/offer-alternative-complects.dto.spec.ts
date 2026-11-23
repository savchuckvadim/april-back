import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate, ValidationError } from 'class-validator';
import {
    ComplectDto,
    OfferAlternativeSetComplectsDto,
    OfferComplectSectionDto,
} from '@app/konstructor/document-generate';
import { DocumentVariantDto } from '@app/konstructor/document-generate/dto/document-variant/document-variant.dto';
import { OfferPdfGenerateDto } from '../../offer-pdf/dto/offer-pdf-generate.dto';
import { OfferWordByTemplateGenerateDto } from '../dto/offer-word-generate-request.dto';
import { OfferWordPdfPreviewRequestDto } from '../dto/offer-word-pdf-preview-request.dto';
import { OfferWordMultiGenerateDto } from '../multi/dto/offer-word-multi-generate.dto';

/**
 * Глобальный ValidationPipe работает с whitelist: поле без декораторов
 * срезается. Наполнение наборов для сравнения должно дойти до сервиса в запросе
 * Word, PDF, превью и в каждом варианте; запрос без него остаётся допустимым.
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

const complectBody = {
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

const setBody = (setNumber: number) => ({
    setNumber,
    title: `Набор ${setNumber}`,
    complects: [complectBody],
});

const inAlternatives = (path: string): boolean =>
    path.startsWith('alternativeComplects');

const REQUESTS: Array<[string, Constructor<object>]> = [
    ['базовый запрос КП', OfferWordByTemplateGenerateDto],
    ['запрос PDF-КП', OfferPdfGenerateDto],
    ['запрос превью Word-КП', OfferWordPdfPreviewRequestDto],
    ['запрос КП v2', OfferWordMultiGenerateDto],
    ['вариант комплекта', DocumentVariantDto],
];

describe.each(REQUESTS)(
    '%s: наполнение наборов для сравнения',
    (_name, type) => {
        it('запрос без alternativeComplects допустим: ошибок по полю нет', async () => {
            const { dto, paths } = await check(type, {});

            const typed: {
                alternativeComplects?: OfferAlternativeSetComplectsDto[];
            } = dto;

            expect(paths.filter(inAlternatives)).toEqual([]);
            expect(typed.alternativeComplects).toBeUndefined();
        });

        it('пустой список допустим: КП печатается как раньше', async () => {
            const { dto, paths } = await check(type, {
                alternativeComplects: [],
            });

            const typed: {
                alternativeComplects?: OfferAlternativeSetComplectsDto[];
            } = dto;

            expect(paths.filter(inAlternatives)).toEqual([]);
            expect(typed.alternativeComplects).toEqual([]);
        });

        it('alternativeComplects не срезается whitelist и приводится к своим классам', async () => {
            const { dto } = await check(type, {
                alternativeComplects: [setBody(1), setBody(2)],
                чужоеПоле: 'срезается',
            });
            const typed: {
                alternativeComplects?: OfferAlternativeSetComplectsDto[];
            } = dto;

            expect(typed.alternativeComplects).toHaveLength(2);
            const [first, second] = typed.alternativeComplects ?? [];
            expect(first).toBeInstanceOf(OfferAlternativeSetComplectsDto);
            expect(first.setNumber).toBe(1);
            expect(first.title).toBe('Набор 1');
            expect(first.complects[0]).toBeInstanceOf(OfferComplectSectionDto);
            expect(first.complects[0].title).toBe(
                'ГАРАНТ-Профессионал. Бухгалтерия',
            );
            expect(first.complects[0].supplyName).toBe('Интернет 3 ОД');
            expect(first.complects[0].complect[0]).toBeInstanceOf(ComplectDto);
            expect(second.setNumber).toBe(2);
            expect(dto).not.toHaveProperty('чужоеПоле');
        });

        it('верные поля проходят проверку: у набора может быть несколько комплектов, у комплекта поставка необязательна', async () => {
            const { paths } = await check(type, {
                alternativeComplects: [
                    setBody(1),
                    {
                        setNumber: 2,
                        title: 'Набор 2',
                        complects: [
                            complectBody,
                            { title: 'Юрист', complect: complectBody.complect },
                        ],
                    },
                ],
            });

            expect(paths.filter(inAlternatives)).toEqual([]);
        });

        it('alternativeComplects не список — ошибка', async () => {
            const { paths } = await check(type, {
                alternativeComplects: 'не список',
            });
            expect(paths).toContain('alternativeComplects');
        });

        it('у набора нет номера, заголовка или комплектов — ошибка с путём до поля', async () => {
            const { paths } = await check(type, {
                alternativeComplects: [
                    setBody(1),
                    { title: 'Набор 2', complects: [] },
                    { setNumber: 3, complects: [] },
                    { setNumber: 4, title: 'Набор 4' },
                ],
            });

            expect(paths).toContain('alternativeComplects.1.setNumber');
            expect(paths).toContain('alternativeComplects.2.title');
            expect(paths).toContain('alternativeComplects.3.complects');
            expect(
                paths.filter(path => path.startsWith('alternativeComplects.0')),
            ).toEqual([]);
        });

        it('номер набора — целое от 1: ноль, дробь и текст не проходят', async () => {
            const { paths } = await check(type, {
                alternativeComplects: [
                    { ...setBody(1), setNumber: 0 },
                    { ...setBody(1), setNumber: 1.5 },
                    { ...setBody(1), setNumber: 'первый' },
                    { ...setBody(1), setNumber: -2 },
                ],
            });

            for (const index of [0, 1, 2, 3]) {
                expect(paths).toContain(
                    `alternativeComplects.${index}.setNumber`,
                );
            }
        });

        it('комплект набора проверяется как комплект общего набора: названия нет, наполнение не список', async () => {
            const { paths } = await check(type, {
                alternativeComplects: [
                    {
                        setNumber: 1,
                        title: 'Набор 1',
                        complects: [
                            complectBody,
                            { supplyName: 'Интернет 1 ОД', complect: [] },
                            { title: 'Юрист', complect: 'нет' },
                        ],
                    },
                ],
            });

            expect(paths).toContain('alternativeComplects.0.complects.1.title');
            expect(paths).toContain(
                'alternativeComplects.0.complects.2.complect',
            );
        });

        it('группа наполнения комплекта набора проверяется как обычное наполнение', async () => {
            const { paths } = await check(type, {
                alternativeComplects: [
                    {
                        setNumber: 1,
                        title: 'Набор 1',
                        complects: [
                            {
                                title: 'Бухгалтерия',
                                complect: [
                                    { ...complectBody.complect[0], type: 'x' },
                                ],
                            },
                        ],
                    },
                ],
            });

            expect(paths).toContain(
                'alternativeComplects.0.complects.0.complect.0.type',
            );
        });

        it('complects и complectsMode общего набора работают рядом, не мешая друг другу', async () => {
            const { dto, paths } = await check(type, {
                complects: [complectBody],
                complectsMode: 'separate',
                alternativeComplects: [setBody(1)],
            });
            const typed: {
                complects?: OfferComplectSectionDto[];
                alternativeComplects?: OfferAlternativeSetComplectsDto[];
            } = dto;

            expect(paths.filter(inAlternatives)).toEqual([]);
            expect(typed.complects).toHaveLength(1);
            expect(typed.alternativeComplects).toHaveLength(1);
        });
    },
);

describe('Swagger: поле и элемент описаны по-русски', () => {
    const properties: Array<{
        name: string;
        type: DtoClass;
        property: string;
    }> = [
        {
            name: 'запрос КП',
            type: OfferWordByTemplateGenerateDto,
            property: 'alternativeComplects',
        },
        {
            name: 'вариант комплекта',
            type: DocumentVariantDto,
            property: 'alternativeComplects',
        },
    ];

    it.each(properties)(
        '$name: поле $property необязательное, описание на русском',
        ({ type, property }) => {
            const meta: unknown = Reflect.getMetadata(
                'swagger/apiModelProperties',
                type.prototype,
                property,
            );

            expect(meta).toMatchObject({ required: false });
            expect(JSON.stringify(meta)).toMatch(/"description":"[^"]*[а-яё]/i);
        },
    );

    it('элемент: номер, заголовок и комплекты обязательны, у каждого описание', () => {
        const meta = (property: string): unknown =>
            Reflect.getMetadata(
                'swagger/apiModelProperties',
                OfferAlternativeSetComplectsDto.prototype,
                property,
            );

        // обязательное поле Swagger помечает по умолчанию: required не пишется
        for (const property of ['setNumber', 'title', 'complects']) {
            expect(meta(property)).not.toMatchObject({ required: false });
            expect(JSON.stringify(meta(property))).toMatch(
                /"description":"[^"]*[а-яё]/i,
            );
        }
        expect(meta('setNumber')).toMatchObject({ minimum: 1 });
    });
});
