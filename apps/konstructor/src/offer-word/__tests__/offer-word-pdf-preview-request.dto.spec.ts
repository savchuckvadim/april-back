import { BadRequestException } from '@nestjs/common';
import { createGlobalValidationPipe } from '@lib/core/bootstrap/global-validation-pipe';
import { DocumentVariantDto } from '@app/konstructor/document-generate/dto/document-variant/document-variant.dto';
import { ClientTypeEnum } from '@app/konstructor/document-generate/type/client.type';
import { CONTRACT_LTYPE } from '@app/konstructor/document-generate/type/contract.type';
import { ComplectCompositionDto } from '@app/konstructor/modules/inner-deal/dto/complect-composition.dto';
import {
    ComplectModeEnum,
    ComplectOfferInfoblocksEnum,
} from '@app/konstructor/modules/inner-deal/type/complect-composition.type';
import { OfferWordPdfPreviewRequestDto } from '../dto/offer-word-pdf-preview-request.dto';

/**
 * Тело превью проходит тот же ValidationPipe, что и в проде: whitelist
 * срезает поля без декораторов, вложенные классы проверяются только через
 * @ValidateNested.
 */
const pipe = createGlobalValidationPipe();

type Body = Record<string, unknown>;

const parse = (body: Body): Promise<OfferWordPdfPreviewRequestDto> =>
    pipe.transform(body, {
        type: 'body',
        metatype: OfferWordPdfPreviewRequestDto,
    }) as Promise<OfferWordPdfPreviewRequestDto>;

const messagesOf = async (body: Body): Promise<string[]> => {
    try {
        await parse(body);
        return [];
    } catch (error) {
        expect(error).toBeInstanceOf(BadRequestException);
        const response = (error as BadRequestException).getResponse() as {
            message: string[];
        };
        return response.message;
    }
};

/** Верхние поля запроса — то, что фронт шлёт и без участников. */
const oldRequest = (): Body => ({
    templateId: '1',
    invoiceTemplateId: '2',
    domain: 'test.bitrix24.ru',
    companyId: '3',
    dealId: '4',
    providerId: 5,
    userId: 6,
    contractType: CONTRACT_LTYPE.LIC,
    complect: [],
    rows: [],
    clientType: ClientTypeEnum.ORG,
});

const variantBody = (title: string, contractType: string): Body => ({
    variantSmartId: 11,
    title,
    contractType,
    complect: [],
    rows: [],
    sets: { general: [], alternative: [] },
});

describe('OfferWordPdfPreviewRequestDto: тело превью через глобальный ValidationPipe', () => {
    it('запрос старого вида без variants и composition проходит', async () => {
        const dto = await parse(oldRequest());

        expect(dto).toBeInstanceOf(OfferWordPdfPreviewRequestDto);
        expect(dto.variants).toBeUndefined();
        expect(dto.composition).toBeUndefined();
        expect(dto.templateId).toBe('1');
        expect(dto.contractType).toBe(CONTRACT_LTYPE.LIC);
    });

    it('null вместо variants и composition — как отсутствие поля', async () => {
        const dto = await parse({
            ...oldRequest(),
            variants: null,
            composition: null,
        });

        expect(dto.variants ?? []).toEqual([]);
        expect(dto.composition ?? undefined).toBeUndefined();
    });

    it('пустой список вариантов проходит', async () => {
        const dto = await parse({ ...oldRequest(), variants: [] });

        expect(dto.variants).toEqual([]);
    });

    it('варианты и настройки сборки проходят и становятся экземплярами своих классов', async () => {
        const dto = await parse({
            ...oldRequest(),
            variants: [
                variantBody('Юрист', CONTRACT_LTYPE.ABON),
                variantBody('Бухгалтер', CONTRACT_LTYPE.LIC),
            ],
            composition: {
                mode: ComplectModeEnum.MULTI_CONTRACT,
                offer: {
                    infoblocks: ComplectOfferInfoblocksEnum.INDEPENDENT,
                    showAlternatives: true,
                    separateDocuments: true,
                },
                openVariantSmartId: 11,
            },
        });

        expect(dto.variants).toHaveLength(2);
        expect(dto.variants?.[0]).toBeInstanceOf(DocumentVariantDto);
        expect(dto.variants?.map(variant => variant.title)).toEqual([
            'Юрист',
            'Бухгалтер',
        ]);
        expect(dto.variants?.[1].contractType).toBe(CONTRACT_LTYPE.LIC);
        expect(dto.variants?.[0].variantSmartId).toBe(11);
        expect(dto.composition).toBeInstanceOf(ComplectCompositionDto);
        expect(dto.composition?.mode).toBe(ComplectModeEnum.MULTI_CONTRACT);
        expect(dto.composition?.offer.showAlternatives).toBe(true);
        expect(dto.composition?.offer.separateDocuments).toBe(true);
        expect(dto.composition?.openVariantSmartId).toBe(11);
    });

    it('участники и настройки переживают JSON: так они едут через очередь', async () => {
        const dto = await parse({
            ...oldRequest(),
            variants: [
                variantBody('Юрист', CONTRACT_LTYPE.ABON),
                variantBody('Бухгалтер', CONTRACT_LTYPE.LIC),
            ],
            composition: {
                mode: ComplectModeEnum.COMPARE,
                offer: {
                    infoblocks: ComplectOfferInfoblocksEnum.MERGED,
                    showAlternatives: false,
                },
                openVariantSmartId: null,
            },
        });

        expect(JSON.parse(JSON.stringify(dto))).toEqual(dto);
    });

    it('неизвестные поля запроса и варианта срезаются whitelist', async () => {
        const dto = await parse({
            ...oldRequest(),
            лишнее: 'поле',
            variants: [
                { ...variantBody('Юрист', CONTRACT_LTYPE.ABON), лишнее: 1 },
            ],
        });

        expect(dto).not.toHaveProperty('лишнее');
        expect(dto.variants?.[0]).not.toHaveProperty('лишнее');
        expect(dto.variants?.[0].title).toBe('Юрист');
    });

    it('variants не массив — 400', async () => {
        const messages = await messagesOf({
            ...oldRequest(),
            variants: 'не список',
        });

        expect(messages.join('; ')).toMatch(/variants must be an array/);
    });

    it('вариант с неизвестным типом договора — 400 с путём до поля', async () => {
        const messages = await messagesOf({
            ...oldRequest(),
            variants: [variantBody('Юрист', 'нет-такого')],
        });

        expect(messages.join('; ')).toMatch(/variants\.0\.contractType/);
    });

    it('вариант без названия — 400', async () => {
        const withoutTitle = variantBody('Юрист', CONTRACT_LTYPE.ABON);
        delete withoutTitle.title;

        const messages = await messagesOf({
            ...oldRequest(),
            variants: [withoutTitle],
        });

        expect(messages.join('; ')).toMatch(/variants\.0\.title/);
    });

    it('неизвестный режим сборки — 400', async () => {
        const messages = await messagesOf({
            ...oldRequest(),
            variants: [variantBody('Юрист', CONTRACT_LTYPE.ABON)],
            composition: {
                mode: 'вместе',
                offer: {
                    infoblocks: ComplectOfferInfoblocksEnum.INDEPENDENT,
                    showAlternatives: false,
                },
            },
        });

        expect(messages.join('; ')).toMatch(/composition\.mode/);
    });

    it('верхние поля запроса по-прежнему обязательны', async () => {
        const withoutTemplate = oldRequest();
        delete withoutTemplate.templateId;

        const messages = await messagesOf(withoutTemplate);

        expect(messages.join('; ')).toMatch(/templateId/);
    });
});
