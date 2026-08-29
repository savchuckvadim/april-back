import type { Server } from 'node:http';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { PortalQuestionnairesController } from './portal-questionnaires.controller';
import { PortalQuestionnairesService } from './portal-questionnaires.service';
import {
    EnumQuestionnaireConditionKind,
    getQuestionnaireSchema,
} from './portal-questionnaires.schema';
import { PortalQuestionnaireRecord } from './portal-questionnaires.repository';
import {
    PortalQuestionnaireDto,
    PortalQuestionnaireFieldSyncResultDto,
    PortalQuestionnaireListItemDto,
    PortalQuestionnaireSchemaDto,
} from './portal-questionnaires.dto';

/**
 * Спека админского контроллера анкет. Проверяется ровно то, на чём здесь
 * ломаются: порядок объявления маршрутов (статический `schema` против
 * параметрического `:id`) и принадлежность анкеты порталу из адреса.
 */

const PORTAL_ID = 7;

const makeRecord = (
    over: Partial<PortalQuestionnaireRecord> = {},
): PortalQuestionnaireRecord => ({
    id: 'e6f5f0d0-0000-4000-8000-000000000001',
    portalId: PORTAL_ID,
    domain: 'gsr.bitrix24.ru',
    appCode: 'event-sales',
    code: 'refine',
    title: 'Доработка',
    hint: null,
    purpose: 'plan',
    presentation: 'inline',
    place: 'plan',
    persist: 'onChange',
    conditions: [{ kind: 'planType', values: ['refine'] }],
    configKey: null,
    legacyChecklistId: null,
    isActive: true,
    sort: 500,
    version: 3,
    updatedBy: null,
    createdAt: null,
    updatedAt: null,
    items: [],
    ...over,
});

describe('PortalQuestionnairesController', () => {
    let app: INestApplication;
    // getHttpServer() типизирован как any — приводим один раз здесь,
    // чтобы запросы ниже читались без приведений в каждом тесте.
    let server: Server;
    const service = {
        getSchema: jest.fn(() => getQuestionnaireSchema()),
        listByPortal: jest.fn(),
        getById: jest.fn(),
        save: jest.fn(),
        remove: jest.fn(),
        applyFieldSync: jest.fn(),
    };

    beforeAll(async () => {
        const moduleRef = await Test.createTestingModule({
            controllers: [PortalQuestionnairesController],
            providers: [
                { provide: PortalQuestionnairesService, useValue: service },
            ],
        }).compile();
        app = moduleRef.createNestApplication();
        await app.init();
        server = app.getHttpServer() as Server;
    });

    afterAll(async () => {
        await app.close();
    });

    afterEach(() => jest.clearAllMocks());

    describe('порядок маршрутов', () => {
        it('«schema» не перехватывается маршрутом /:id', async () => {
            service.getById.mockResolvedValue(makeRecord());

            const response = await request(server)
                .get(`/admin/portal/${PORTAL_ID}/questionnaires/schema`)
                .expect(200);

            // Реестр, а не анкета с кодом «schema».
            const body = response.body as PortalQuestionnaireSchemaDto;
            expect(body.contract).toBe(getQuestionnaireSchema().contract);
            expect(body.purposes.length).toBeGreaterThan(0);
            expect(body.conditions.length).toBeGreaterThan(0);
            expect(body.fieldTypeControls.length).toBeGreaterThan(0);
            // Самое важное: до чтения анкеты дело вообще не дошло.
            expect(service.getById).not.toHaveBeenCalled();
        });

        it('реестр отдаёт справочники значений условий и матрицу типов', async () => {
            const response = await request(server)
                .get(`/admin/portal/${PORTAL_ID}/questionnaires/schema`)
                .expect(200);

            const body = response.body as PortalQuestionnaireSchemaDto;
            const planType = body.conditions.find(
                kind => kind.kind === EnumQuestionnaireConditionKind.planType,
            );
            expect(planType?.values.length).toBeGreaterThan(0);
            const date = body.fieldTypeControls.find(
                row => row.fieldType === 'date',
            );
            expect(date?.controls).toContain('date');
        });

        it('идентификатор анкеты по-прежнему уходит в /:id', async () => {
            const record = makeRecord();
            service.getById.mockResolvedValue(record);

            const response = await request(server)
                .get(`/admin/portal/${PORTAL_ID}/questionnaires/${record.id}`)
                .expect(200);

            expect(service.getById).toHaveBeenCalledWith(record.id);
            expect((response.body as PortalQuestionnaireDto).code).toBe(
                'refine',
            );
        });
    });

    describe('принадлежность порталу', () => {
        it('анкета соседнего портала не читается по чужому адресу', async () => {
            const record = makeRecord({ portalId: 42 });
            service.getById.mockResolvedValue(record);

            await request(server)
                .get(`/admin/portal/${PORTAL_ID}/questionnaires/${record.id}`)
                .expect(404);
        });

        it('анкета соседнего портала не удаляется по чужому адресу', async () => {
            const record = makeRecord({ portalId: 42 });
            service.getById.mockResolvedValue(record);

            await request(server)
                .delete(
                    `/admin/portal/${PORTAL_ID}/questionnaires/${record.id}`,
                )
                .expect(404);
            expect(service.remove).not.toHaveBeenCalled();
        });

        it('расхождения в анкету соседнего портала не применяются', async () => {
            const record = makeRecord({ portalId: 42 });
            service.getById.mockResolvedValue(record);

            await request(server)
                .post(
                    `/admin/portal/${PORTAL_ID}/questionnaires/` +
                        `${record.id}/apply-field-sync`,
                )
                .send({ items: [{ itemId: 'item-1', title: 'Подмена' }] })
                .expect(404);
            expect(service.applyFieldSync).not.toHaveBeenCalled();
        });
    });

    describe('применение расхождений', () => {
        it('выбранное уходит в стор, ответ считает применённое', async () => {
            const record = makeRecord();
            service.getById.mockResolvedValue(record);
            service.applyFieldSync.mockResolvedValue({
                questionnaire: record,
                titles: 1,
                renamedOptions: 0,
                addedOptions: 2,
            });

            const response = await request(server)
                .post(
                    `/admin/portal/${PORTAL_ID}/questionnaires/` +
                        `${record.id}/apply-field-sync`,
                )
                .send({
                    items: [
                        {
                            itemId: 'item-1',
                            title: 'Дата решения',
                            addOptions: [
                                { bitrixId: 301, title: 'Субподряд' },
                                { bitrixId: 302, title: 'Прямая' },
                            ],
                        },
                    ],
                })
                .expect(200);

            const body = response.body as PortalQuestionnaireFieldSyncResultDto;
            expect(body.questionnaire.id).toBe(record.id);
            expect(body.appliedTitles).toBe(1);
            expect(body.addedOptions).toBe(2);
            // Тело уходит в стор как есть: принадлежность проверяет он.
            const [id, items] = service.applyFieldSync.mock.calls[0] as [
                string,
                { itemId: string }[],
            ];
            expect(id).toBe(record.id);
            expect(items[0].itemId).toBe('item-1');
            // Сохранение анкеты этим маршрутом не задевается.
            expect(service.save).not.toHaveBeenCalled();
        });
    });

    describe('список', () => {
        it('строка списка считает сломанные привязки', async () => {
            service.listByPortal.mockResolvedValue([
                makeRecord({
                    items: [
                        {
                            id: 'i-1',
                            questionnaireId: 'q-1',
                            portalId: PORTAL_ID,
                            code: 'decision_date',
                            title: 'Дата решения',
                            placeholder: null,
                            hint: null,
                            groupTitle: null,
                            sort: 500,
                            control: 'date',
                            isMultiple: false,
                            isRequired: false,
                            requireChange: false,
                            staleAfterDays: null,
                            channel: 'crm',
                            targetMode: 'auto',
                            targetEntity: null,
                            dtoPath: null,
                            smartId: null,
                            smartEntityTypeId: null,
                            isNative: false,
                            fieldName: 'UF_CRM_1712345678',
                            fieldBitrixId: null,
                            fieldXmlId: null,
                            fieldCode: null,
                            fieldType: 'date',
                            fieldStatus: 'missing',
                            fieldCheckedAt: null,
                            meta: {},
                            isActive: true,
                            options: [],
                        },
                    ],
                }),
            ]);

            const response = await request(server)
                .get(`/admin/portal/${PORTAL_ID}/questionnaires`)
                .expect(200);

            const rows = response.body as PortalQuestionnaireListItemDto[];
            expect(rows[0].itemsCount).toBe(1);
            expect(rows[0].issuesCount).toBe(1);
        });
    });
});
