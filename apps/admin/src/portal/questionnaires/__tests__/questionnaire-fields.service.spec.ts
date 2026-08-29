import { PbxEntityTypePrisma } from '@/shared/enums';
import { EnumQuestionnaireFieldSource } from '../dto/questionnaire-field-source.dto';
import { QuestionnaireFieldSource } from '../services/questionnaire-field-source.service';
import { QuestionnaireLiveField } from '../services/questionnaire-bitrix-fields.reader';
import { QuestionnaireFieldsService } from '../services/questionnaire-fields.service';

/**
 * Спека источника полей. Главное здесь — `inPortalDb`: по нему владелец
 * отличает поля, которые поставил установщик, от тех, что завёл руками
 * (только вторые и нужны анкете).
 *
 * Ловушка, ради которой спека и написана: `bitrixfields.bitrixId`
 * неоднороден. Установщик штатных сущностей кладёт туда суффикс из Excel
 * (`OP_CLIENT_TYPE`), установщик смартов — полное имя
 * (`UF_CRM_7_ZPR_LEAD`). Сравнение «в лоб» пометило бы половину
 * установленных полей как ручные, и владелец начал бы строить анкету на
 * полях установщика — которые сносит переустановка.
 */

const COMPANY_SOURCE: QuestionnaireFieldSource = {
    entity: EnumQuestionnaireFieldSource.company,
    smartId: null,
    entityTypeId: 4,
    bitrixId: null,
    title: 'Компания',
    ufEntityId: 'CRM_COMPANY',
    snapshotEntityType: PbxEntityTypePrisma.BTX_COMPANY,
    snapshotEntityId: 11,
};

const SMART_SOURCE: QuestionnaireFieldSource = {
    entity: EnumQuestionnaireFieldSource.smart,
    smartId: 3,
    entityTypeId: 177,
    bitrixId: 7,
    title: 'Заявка',
    ufEntityId: 'CRM_7',
    snapshotEntityType: PbxEntityTypePrisma.SMART,
    snapshotEntityId: 3,
};

const makeField = (
    over: Partial<QuestionnaireLiveField> = {},
): QuestionnaireLiveField => ({
    fieldName: 'UF_CRM_1712345678',
    title: 'Дата решения',
    type: 'date',
    multiple: false,
    mandatory: false,
    bitrixId: 555,
    xmlId: null,
    items: [],
    ...over,
});

const makeDeps = (options: {
    source?: QuestionnaireFieldSource;
    fields: QuestionnaireLiveField[];
    snapshot: { bitrixId: string; code: string }[];
    questionnaires?: unknown[];
    degraded?: boolean;
    /** Что вернула запись поля — для createField. */
    written?: QuestionnaireLiveField;
    writtenCreated?: boolean;
}) => {
    const prisma = {
        bitrixfields: {
            findMany: jest.fn().mockResolvedValue(options.snapshot),
        },
    };
    const sourceService = {
        requireDomain: jest.fn().mockResolvedValue('gsr.bitrix24.ru'),
        listSources: jest.fn().mockResolvedValue([]),
        resolveSource: jest
            .fn()
            .mockResolvedValue(options.source ?? COMPANY_SOURCE),
    };
    const reader = {
        connect: jest.fn().mockResolvedValue({}),
        readFields: jest.fn().mockResolvedValue({
            fields: options.fields,
            degraded: options.degraded ?? false,
        }),
    };
    const questionnaires = {
        listByPortal: jest.fn().mockResolvedValue(options.questionnaires ?? []),
    };
    const writer = {
        create: jest.fn().mockResolvedValue({
            field: options.written ?? options.fields[0],
            created: options.writtenCreated ?? true,
        }),
    };
    const service = new QuestionnaireFieldsService(
        prisma as never,
        sourceService as never,
        reader as never,
        questionnaires as never,
        writer as never,
    );
    return {
        service,
        prisma,
        sourceService,
        reader,
        questionnaires,
        writer,
    };
};

describe('QuestionnaireFieldsService', () => {
    afterEach(() => jest.clearAllMocks());

    describe('поле из слепка против поля, заведённого вручную', () => {
        it('слепок без префикса совпадает с живым UF_CRM_-именем', async () => {
            const { service } = makeDeps({
                fields: [
                    makeField({
                        fieldName: 'UF_CRM_OP_CLIENT_TYPE',
                        type: 'enumeration',
                    }),
                ],
                // Установщик штатных сущностей пишет суффикс из Excel.
                snapshot: [
                    { bitrixId: 'OP_CLIENT_TYPE', code: 'op_client_type' },
                ],
            });

            const result = await service.listFields(
                7,
                EnumQuestionnaireFieldSource.company,
            );

            expect(result.fields[0].inPortalDb).toBe(true);
            expect(result.fields[0].portalCode).toBe('op_client_type');
        });

        it('слепок смарта с полным именем тоже совпадает', async () => {
            const { service } = makeDeps({
                source: SMART_SOURCE,
                fields: [makeField({ fieldName: 'UF_CRM_7_ZPR_LEAD' })],
                // Установщик смартов кладёт полное имя как есть.
                snapshot: [{ bitrixId: 'UF_CRM_7_ZPR_LEAD', code: 'zpr_lead' }],
            });

            const result = await service.listFields(
                7,
                EnumQuestionnaireFieldSource.smart,
                3,
            );

            expect(result.fields[0].inPortalDb).toBe(true);
            expect(result.fields[0].portalCode).toBe('zpr_lead');
        });

        it('поле, которого нет в слепке, считается заведённым вручную', async () => {
            const { service } = makeDeps({
                fields: [makeField({ fieldName: 'UF_CRM_1712345678' })],
                snapshot: [
                    { bitrixId: 'OP_CLIENT_TYPE', code: 'op_client_type' },
                ],
            });

            const result = await service.listFields(
                7,
                EnumQuestionnaireFieldSource.company,
            );

            expect(result.fields[0].inPortalDb).toBe(false);
            expect(result.fields[0].portalCode).toBeNull();
        });

        it('регистр слепка не мешает сравнению', async () => {
            const { service } = makeDeps({
                fields: [makeField({ fieldName: 'UF_CRM_OP_CLIENT_TYPE' })],
                snapshot: [
                    { bitrixId: 'op_client_type', code: 'op_client_type' },
                ],
            });

            const result = await service.listFields(
                7,
                EnumQuestionnaireFieldSource.company,
            );

            expect(result.fields[0].inPortalDb).toBe(true);
        });

        it('фильтр «только ручные» убирает поля установщика', async () => {
            const { service } = makeDeps({
                fields: [
                    makeField({ fieldName: 'UF_CRM_OP_CLIENT_TYPE' }),
                    makeField({ fieldName: 'UF_CRM_1712345678' }),
                ],
                snapshot: [
                    { bitrixId: 'OP_CLIENT_TYPE', code: 'op_client_type' },
                ],
            });

            const result = await service.listFields(
                7,
                EnumQuestionnaireFieldSource.company,
                undefined,
                true,
            );

            expect(result.fields).toHaveLength(1);
            expect(result.fields[0].fieldName).toBe('UF_CRM_1712345678');
        });

        it('сущность не установлена на портале — слепок не читается', async () => {
            const { service, prisma } = makeDeps({
                source: { ...COMPANY_SOURCE, snapshotEntityId: null },
                fields: [makeField()],
                snapshot: [],
            });

            const result = await service.listFields(
                7,
                EnumQuestionnaireFieldSource.company,
            );

            expect(prisma.bitrixfields.findMany).not.toHaveBeenCalled();
            expect(result.fields[0].inPortalDb).toBe(false);
        });

        it('слепок ищется по своему якорю, а идентификатор портала в него не подставляется', async () => {
            const { service, prisma } = makeDeps({
                fields: [makeField()],
                snapshot: [],
            });

            await service.listFields(7, EnumQuestionnaireFieldSource.company);

            expect(prisma.bitrixfields.findMany).toHaveBeenCalledWith({
                where: {
                    entity_type: PbxEntityTypePrisma.BTX_COMPANY,
                    entity_id: BigInt(11),
                },
                select: { bitrixId: true, code: true },
            });
        });
    });

    describe('где поле уже используется', () => {
        it('анкета и вопрос находятся по имени поля с любой стороны префикса', async () => {
            const { service } = makeDeps({
                fields: [makeField({ fieldName: 'UF_CRM_1712345678' })],
                snapshot: [],
                questionnaires: [
                    {
                        id: 'q-1',
                        code: 'refine',
                        title: 'Доработка',
                        items: [
                            {
                                code: 'decision_date',
                                title: 'Дата решения',
                                fieldName: 'uf_crm_1712345678',
                            },
                        ],
                    },
                ],
            });

            const result = await service.listFields(
                7,
                EnumQuestionnaireFieldSource.company,
            );

            expect(result.fields[0].usedIn).toEqual([
                {
                    questionnaireId: 'q-1',
                    questionnaireCode: 'refine',
                    questionnaireTitle: 'Доработка',
                    itemCode: 'decision_date',
                    itemTitle: 'Дата решения',
                },
            ]);
        });
    });

    describe('неполное чтение', () => {
        it('degraded доезжает до ответа как есть', async () => {
            const { service } = makeDeps({
                fields: [makeField({ bitrixId: null, xmlId: null })],
                snapshot: [],
                degraded: true,
            });

            const result = await service.listFields(
                7,
                EnumQuestionnaireFieldSource.company,
            );

            expect(result.degraded).toBe(true);
        });
    });

    describe('создание поля', () => {
        /**
         * Созданное поле обязано выглядеть как строка списка выбора: из
         * ответа редактор собирает вопрос сразу, без второго запроса.
         */
        it('приезжает в том же виде, что и строка списка полей', async () => {
            const { service, writer } = makeDeps({
                source: SMART_SOURCE,
                fields: [],
                snapshot: [],
                written: makeField({
                    fieldName: 'UF_CRM_7_DECISION_1',
                    title: 'Итог презентации',
                    type: 'enumeration',
                    bitrixId: 555,
                    items: [{ id: 301, value: 'Тендер', xmlId: 'TENDER' }],
                }),
            });

            const result = await service.createField(7, {
                entity: EnumQuestionnaireFieldSource.smart,
                smartId: 3,
                code: 'DECISION',
                title: 'Итог презентации',
                type: 'enumeration',
                items: [{ title: 'Тендер', code: 'TENDER' }],
            });

            expect(result.created).toBe(true);
            expect(result.field.fieldName).toBe('UF_CRM_7_DECISION_1');
            expect(result.field.items[0].id).toBe(301);
            expect(result.source.smartId).toBe(3);
            // Носитель и черновик доезжают до записи как есть.
            expect(writer.create).toHaveBeenCalledWith(
                expect.anything(),
                SMART_SOURCE,
                expect.objectContaining({
                    code: 'DECISION',
                    type: 'enumeration',
                }),
            );
        });

        /**
         * Строку в слепок под анкету мы не создаём никогда: переустановка
         * сущности сносит её строки скопом. Поэтому созданное поле всегда
         * помечено как заведённое вручную.
         */
        it('в слепок не пишется и остаётся «ручным»', async () => {
            const { service, prisma } = makeDeps({
                source: SMART_SOURCE,
                fields: [],
                snapshot: [],
                written: makeField({ fieldName: 'UF_CRM_7_DECISION' }),
            });

            const result = await service.createField(7, {
                entity: EnumQuestionnaireFieldSource.smart,
                smartId: 3,
                code: 'DECISION',
                title: 'Итог презентации',
                type: 'string',
            });

            expect(result.field.inPortalDb).toBe(false);
            expect(result.field.portalCode).toBeNull();
            // Слепок только ЧИТАЕТСЯ — записи в bitrixfields здесь нет.
            expect(Object.keys(prisma.bitrixfields)).toEqual(['findMany']);
        });

        it('у существующего поля показывает, где оно уже занято', async () => {
            const { service } = makeDeps({
                source: SMART_SOURCE,
                fields: [],
                snapshot: [],
                written: makeField({ fieldName: 'UF_CRM_7_DECISION' }),
                writtenCreated: false,
                questionnaires: [
                    {
                        id: 'q-1',
                        code: 'presentation',
                        title: 'Презентация',
                        items: [
                            {
                                code: 'decision',
                                title: 'Итог',
                                fieldName: 'UF_CRM_7_DECISION',
                            },
                        ],
                    },
                ],
            });

            const result = await service.createField(7, {
                entity: EnumQuestionnaireFieldSource.smart,
                smartId: 3,
                code: 'DECISION',
                title: 'Итог презентации',
                type: 'string',
            });

            expect(result.created).toBe(false);
            expect(result.field.usedIn).toEqual([
                {
                    questionnaireId: 'q-1',
                    questionnaireCode: 'presentation',
                    questionnaireTitle: 'Презентация',
                    itemCode: 'decision',
                    itemTitle: 'Итог',
                },
            ]);
        });
    });
});
