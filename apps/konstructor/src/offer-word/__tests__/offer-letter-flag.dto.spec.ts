import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate, ValidationError } from 'class-validator';
import { OfferPdfGenerateDto } from '../../offer-pdf/dto/offer-pdf-generate.dto';
import { OfferWordByTemplateGenerateDto } from '../dto/offer-word-generate-request.dto';
import { OfferWordPdfPreviewRequestDto } from '../dto/offer-word-pdf-preview-request.dto';
import { OfferWordMultiGenerateDto } from '../multi/dto/offer-word-multi-generate.dto';

/**
 * Флаг сопроводительного письма в запросах: у Word-КП (одиночный запрос,
 * generate-multi, превью) — поле верхнего уровня `withLetter`, у PDF-КП —
 * `settings.withLetter`. Глобальный ValidationPipe работает с whitelist: поле
 * без декораторов срезалось бы молча.
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

const WORD_REQUESTS: [string, Constructor<object>][] = [
    ['одиночный запрос Word', OfferWordByTemplateGenerateDto],
    ['generate-multi', OfferWordMultiGenerateDto],
    ['превью Word в PDF', OfferWordPdfPreviewRequestDto],
];

describe('флаг сопроводительного письма в запросах Word-КП', () => {
    it.each(WORD_REQUESTS)(
        '%s: withLetter не срезается whitelist и по ошибкам не проходит',
        async (_title, type) => {
            for (const withLetter of [true, false]) {
                const { dto, paths } = await check(type, { withLetter });
                expect((dto as { withLetter?: boolean }).withLetter).toBe(
                    withLetter,
                );
                expect(paths).not.toContain('withLetter');
            }
        },
    );

    it.each(WORD_REQUESTS)(
        '%s: без поля запрос допустим, значение не задано',
        async (_title, type) => {
            const { dto, paths } = await check(type, {});
            expect(
                (dto as { withLetter?: boolean }).withLetter,
            ).toBeUndefined();
            expect(paths).not.toContain('withLetter');
        },
    );
});

describe('флаг сопроводительного письма в запросе PDF-КП', () => {
    it('settings.withLetter доходит до сервиса: whitelist его не срезает', async () => {
        const { dto, paths } = await check(OfferPdfGenerateDto, {
            settings: { withLetter: false },
        });
        expect(dto.settings?.withLetter).toBe(false);
        expect(paths).not.toContain('settings.withLetter');
    });

    it('верхнего поля withLetter у PDF-запроса нет: флаг лежит в settings', async () => {
        const { dto } = await check(OfferPdfGenerateDto, {
            withLetter: false,
        });
        expect(dto).not.toHaveProperty('withLetter');
    });

    it('в Swagger поле настроек необязательное и описано по-русски', () => {
        const meta: unknown = Reflect.getMetadata(
            'swagger/apiModelProperties',
            OfferPdfGenerateDto.prototype,
            'settings',
        );
        expect(meta).toMatchObject({ required: false });
    });
});

describe('Swagger Word-запроса', () => {
    it('withLetter необязательное и описано по-русски', () => {
        const meta: unknown = Reflect.getMetadata(
            'swagger/apiModelProperties',
            OfferWordByTemplateGenerateDto.prototype,
            'withLetter',
        );
        expect(meta).toMatchObject({ required: false, default: true });
        expect(JSON.stringify(meta)).toMatch(/"description":"[^"]*[а-яё]/i);
    });
});
