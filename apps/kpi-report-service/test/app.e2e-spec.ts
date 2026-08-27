import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { KpiReportServiceModule } from './../src/kpi-report-service.module';

describe('KpiReportService (e2e)', () => {
    let app: INestApplication;

    beforeEach(async () => {
        const moduleFixture: TestingModule = await Test.createTestingModule({
            imports: [KpiReportServiceModule],
        }).compile();

        app = moduleFixture.createNestApplication();
        await app.init();
    });

    afterEach(async () => {
        await app.close();
    });

    it('/health (GET)', () => {
        return request(app.getHttpServer()).get('/health').expect(200);
    });
});
