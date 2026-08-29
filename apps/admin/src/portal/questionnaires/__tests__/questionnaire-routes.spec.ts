import type { Server } from 'node:http';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { PortalQuestionnairesController } from '@lib/portal-lib/store/questionnaires/portal-questionnaires.controller';
import {
    PortalQuestionnairesService,
    getQuestionnaireSchema,
} from '@lib/portal-lib/store/questionnaires';
import { QuestionnaireCheckController } from '../controllers/questionnaire-check.controller';
import { QuestionnaireCheckService } from '../services/questionnaire-check.service';

/**
 * Поверхность анкет собрана из ДВУХ контроллеров на одном префиксе: CRUD
 * живёт в сторе портала, а сверка привязок — здесь, в админском
 * приложении (ей нужен Битрикс). Спека проверяет, что вместе они не
 * спорят за маршруты: `schema` не уезжает в `:id`, создание анкеты не
 * перехватывает `:id/check`, и наоборот.
 */

const PORTAL_ID = 7;
const QUESTIONNAIRE_ID = 'e6f5f0d0-0000-4000-8000-000000000001';

describe('маршруты каталога анкет (стор + админка вместе)', () => {
    let app: INestApplication;
    let server: Server;

    const questionnaires = {
        getSchema: jest.fn(() => getQuestionnaireSchema()),
        listByPortal: jest.fn().mockResolvedValue([]),
        getById: jest.fn(),
        save: jest.fn(),
        remove: jest.fn().mockResolvedValue(undefined),
    };
    const check = {
        check: jest.fn().mockResolvedValue({
            questionnaire: { id: QUESTIONNAIRE_ID },
            items: [],
            degraded: false,
        }),
    };

    beforeAll(async () => {
        const moduleRef = await Test.createTestingModule({
            controllers: [
                PortalQuestionnairesController,
                QuestionnaireCheckController,
            ],
            providers: [
                {
                    provide: PortalQuestionnairesService,
                    useValue: questionnaires,
                },
                { provide: QuestionnaireCheckService, useValue: check },
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

    it('«schema» не перехватывается ни одним параметрическим маршрутом', async () => {
        await request(server)
            .get(`/admin/portal/${PORTAL_ID}/questionnaires/schema`)
            .expect(200);

        expect(questionnaires.getById).not.toHaveBeenCalled();
        expect(check.check).not.toHaveBeenCalled();
    });

    it('сверка привязок доступна на том же префиксе, что и редактор', async () => {
        await request(server)
            .post(
                `/admin/portal/${PORTAL_ID}/questionnaires/` +
                    `${QUESTIONNAIRE_ID}/check`,
            )
            .expect(200);

        expect(check.check).toHaveBeenCalledWith(PORTAL_ID, QUESTIONNAIRE_ID);
        expect(questionnaires.save).not.toHaveBeenCalled();
    });

    it('создание анкеты не путается со сверкой привязок', async () => {
        questionnaires.save.mockResolvedValue({
            id: QUESTIONNAIRE_ID,
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
            conditions: [],
            configKey: null,
            legacyChecklistId: null,
            isActive: true,
            sort: 500,
            version: 1,
            updatedBy: null,
            createdAt: null,
            updatedAt: null,
            items: [],
        });

        await request(server)
            .post(`/admin/portal/${PORTAL_ID}/questionnaires`)
            .send({
                appCode: 'event-sales',
                code: 'refine',
                title: 'Доработка',
                purpose: 'plan',
                conditions: [{ kind: 'planType', values: ['refine'] }],
                items: [],
            })
            .expect(200);

        expect(questionnaires.save).toHaveBeenCalledTimes(1);
        expect(check.check).not.toHaveBeenCalled();
    });
});
