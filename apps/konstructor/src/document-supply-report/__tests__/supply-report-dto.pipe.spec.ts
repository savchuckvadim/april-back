import { readFileSync } from 'fs';
import { join } from 'path';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import {
    createGlobalValidationPipe,
    GLOBAL_VALIDATION_PIPE_OPTIONS,
} from '@lib/core/bootstrap/global-validation-pipe';
import { DocumentSupplyInitFormDto } from '../dto/document-supply-init-form.dto';
import { DocumentSupplyReportGenerateDto } from '../dto/document-supply-report-generate.dto';

/**
 * Тела отчёта о поставке через тот же ValidationPipe, что и в проде.
 *
 * Регрессия: массивы объектов без `@Type` при enableImplicitConversion
 * превращали каждый элемент в Array → init-form отвечал 400
 * «each value in value must be an object» на корректном теле.
 */
type Json = Record<string, any>;

const EXAMPLE_PATH = join(__dirname, '../dto/suppli-init-form-example.dto.json');
const loadInitFormExample = (): Json =>
    JSON.parse(readFileSync(EXAMPLE_PATH, 'utf8')) as Json;

const runPipe = async (pipe: ValidationPipe, body: Json, metatype: any) =>
    (await pipe.transform(body, { type: 'body', metatype })) as Json;

const errorMessages = async (
    pipe: ValidationPipe,
    body: Json,
    metatype: any,
): Promise<string[]> => {
    try {
        await runPipe(pipe, body, metatype);
        return [];
    } catch (error) {
        expect(error).toBeInstanceOf(BadRequestException);
        const response = (error as BadRequestException).getResponse() as {
            message: string[];
        };
        return response.message;
    }
};

/** Элементы — обычные объекты (или null), сериализация отдаёт ровно то, что пришло. */
const expectPlainObjectsOrNull = (actual: unknown[], expected: unknown[]) => {
    expect(actual).toHaveLength(expected.length);
    actual.forEach(item => {
        expect(Array.isArray(item)).toBe(false);
        expect(typeof item).toBe('object');
    });
    expect(JSON.parse(JSON.stringify(actual))).toEqual(expected);
};

const expectPlainObjects = (actual: unknown[], expected: unknown[]) => {
    actual.forEach(item => expect(item).not.toBeNull());
    expectPlainObjectsOrNull(actual, expected);
};

describe('Отчёт о поставке: тела через глобальный ValidationPipe', () => {
    let pipe: ValidationPipe;

    beforeEach(() => {
        pipe = createGlobalValidationPipe();
    });

    describe('POST init-form', () => {
        it('реальное тело из примера проходит без 400', async () => {
            await expect(
                runPipe(pipe, loadInitFormExample(), DocumentSupplyInitFormDto),
            ).resolves.toBeInstanceOf(DocumentSupplyInitFormDto);
        });

        it('массивы объектов доходят до сервиса без искажений', async () => {
            const source = loadInitFormExample();
            const dto = await runPipe(
                pipe,
                loadInitFormExample(),
                DocumentSupplyInitFormDto,
            );

            expectPlainObjectsOrNull(dto.legalTech.value, source.legalTech.value);
            expectPlainObjectsOrNull(dto.consalting.value, source.consalting.value);
            expectPlainObjectsOrNull(dto.star.value, source.star.value);
            expectPlainObjectsOrNull(dto.star.items, source.star.items);
            expect(dto.documentInfoblocks).toHaveLength(
                source.documentInfoblocks.length,
            );
            dto.documentInfoblocks.forEach((block: Json, i: number) =>
                expectPlainObjectsOrNull(
                    block.value,
                    source.documentInfoblocks[i].value,
                ),
            );
        });

        it('пустые массивы допустимы', async () => {
            const body = loadInitFormExample();
            body.legalTech.value = [];
            body.consalting.value = [];
            body.star.value = [];
            body.star.items = [];

            await expect(
                runPipe(pipe, body, DocumentSupplyInitFormDto),
            ).resolves.toBeInstanceOf(DocumentSupplyInitFormDto);
        });

        it('null-«дыры» в транзитных массивах допустимы (в примере legalTech.value[13..15])', async () => {
            const source = loadInitFormExample();
            expect(source.legalTech.value).toContain(null);

            const body = loadInitFormExample();
            body.star.items = [null, ...body.star.items];
            const dto = await runPipe(pipe, body, DocumentSupplyInitFormDto);

            expectPlainObjectsOrNull(dto.legalTech.value, source.legalTech.value);
            expect(dto.star.items[0]).toBeNull();
        });

        it('элемент-не-объект по-прежнему отклоняется', async () => {
            const body = loadInitFormExample();
            body.legalTech.value = ['строка вместо объекта'];

            const messages = await errorMessages(
                pipe,
                body,
                DocumentSupplyInitFormDto,
            );
            expect(messages).toEqual([
                'legalTech.each value in value must be an object or null',
            ]);
        });
    });

    describe('POST generate-document', () => {
        const arrays = (): Json => ({
            bxContacts: [{ ID: '17', NAME: 'Иван', PHONE: [{ VALUE: '+7' }] }],
            supplyReport: [
                { code: 'contact_name', name: 'Контактное лицо', value: 'Иван' },
                { code: 'buh', name: 'Бухгалтер', value: { id: 5 } },
            ],
            products: [{ name: 'Гарант-Офис', number: 1, type: 'garant' }],
        });

        it('bxContacts, supplyReport и products не превращаются в массивы', () => {
            const source = arrays();
            const dto = plainToInstance(
                DocumentSupplyReportGenerateDto,
                arrays(),
                GLOBAL_VALIDATION_PIPE_OPTIONS.transformOptions,
            ) as unknown as Json;

            expectPlainObjects(dto.bxContacts, source.bxContacts);
            expectPlainObjects(dto.supplyReport, source.supplyReport);
            expectPlainObjects(dto.products, source.products);
        });

        it('generate: null в supplyReport отклоняется — сервис разбирает элементы', async () => {
            const body = arrays();
            body.supplyReport = [null];

            const messages = await errorMessages(
                pipe,
                body,
                DocumentSupplyReportGenerateDto,
            );
            expect(messages).toContain(
                'each value in supplyReport must be an object',
            );
        });

        it('pipe не ругается на корректные массивы объектов', async () => {
            const messages = await errorMessages(
                pipe,
                arrays(),
                DocumentSupplyReportGenerateDto,
            );
            const aboutArrays = messages.filter(m =>
                /^(bxContacts|supplyReport|products)\b/.test(m),
            );
            expect(aboutArrays).toEqual([]);
        });
    });
});
