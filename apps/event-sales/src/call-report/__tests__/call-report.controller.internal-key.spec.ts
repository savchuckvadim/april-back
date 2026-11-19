import { Logger, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { InstallCallReportSmartUseCase } from '@lib/call-lib';
import { SendCallReportWeeklyUseCase } from '@lib/call-lib/call-report/weekly-report/send-call-report-weekly.use-case';
import {
    APRIL_INTERNAL_API_KEY_ENV,
    APRIL_INTERNAL_GUARD_MODE_ENV,
    APRIL_INTERNAL_KEY_HEADER,
    isInternalKeyProtected,
} from '@lib/core/internal-key';
import { CallReportController } from '../controllers/call-report.controller';
import { CallReportScanUseCase } from '../use-cases/call-report-scan.use-case';
import { CallReportAnalyzeUseCase } from '../use-cases/call-report-analyze.use-case';
import { CallRevisionService } from '../services/call-revision.service';
import { PresentationAuditService } from '../services/presentation-audit.service';
import { PresentationPlanFactService } from '../services/presentation-plan-fact.service';
import { CallTypeStatsService } from '../services/call-type-stats.service';
import { CallReportSettingsService } from '../services/call-report-settings.service';

const KEY = 'call-report-key-0123456789';
const DOMAIN = 'a.bitrix24.ru';

/**
 * Ручки конвейера звонков (скан, синхронный разбор, ревизия, установка
 * смарта…) запускают платное распознавание, разбор моделью и запись в
 * Битрикс клиента. До 19.11.2026 они были открыты на
 * api.event-sales.april-app.ru любому, кто знает адрес. Сейчас — guard
 * служебного ключа: в report (по умолчанию) работают как раньше и пишут
 * обращение в журнал, в enforce — 403 без ключа.
 */
describe('CallReportController: служебный ключ', () => {
    const savedMode = process.env[APRIL_INTERNAL_GUARD_MODE_ENV];
    const savedKey = process.env[APRIL_INTERNAL_API_KEY_ENV];
    const scan = { execute: jest.fn().mockResolvedValue({ queued: 0 }) };
    const analyze = { execute: jest.fn().mockResolvedValue({ items: [] }) };
    const settings = { minDurationFor: jest.fn().mockResolvedValue(60) };
    let app: INestApplication;

    beforeAll(async () => {
        jest.spyOn(Logger.prototype, 'warn').mockImplementation();
        const moduleRef = await Test.createTestingModule({
            controllers: [CallReportController],
            providers: [
                { provide: InstallCallReportSmartUseCase, useValue: {} },
                { provide: CallReportScanUseCase, useValue: scan },
                { provide: CallReportAnalyzeUseCase, useValue: analyze },
                { provide: CallRevisionService, useValue: {} },
                { provide: PresentationAuditService, useValue: {} },
                { provide: PresentationPlanFactService, useValue: {} },
                { provide: SendCallReportWeeklyUseCase, useValue: {} },
                { provide: CallTypeStatsService, useValue: {} },
                { provide: CallReportSettingsService, useValue: settings },
            ],
        }).compile();
        app = moduleRef.createNestApplication();
        await app.init();
    });

    afterAll(async () => {
        await app.close();
        jest.restoreAllMocks();
        if (savedMode === undefined)
            delete process.env[APRIL_INTERNAL_GUARD_MODE_ENV];
        else process.env[APRIL_INTERNAL_GUARD_MODE_ENV] = savedMode;
        if (savedKey === undefined)
            delete process.env[APRIL_INTERNAL_API_KEY_ENV];
        else process.env[APRIL_INTERNAL_API_KEY_ENV] = savedKey;
    });

    afterEach(() => {
        scan.execute.mockClear();
        analyze.execute.mockClear();
    });

    const setEnv = (mode: string, key?: string): void => {
        process.env[APRIL_INTERNAL_GUARD_MODE_ENV] = mode;
        if (key === undefined) delete process.env[APRIL_INTERNAL_API_KEY_ENV];
        else process.env[APRIL_INTERNAL_API_KEY_ENV] = key;
    };

    const post = (path: string, key?: string) => {
        const call = request(app.getHttpServer() as App)
            .post(path)
            .send({ domain: DOMAIN });
        return key ? call.set(APRIL_INTERNAL_KEY_HEADER, key) : call;
    };

    it('enforce, ключ на сервере не задан — скан не запускается (403)', async () => {
        setEnv('enforce');
        await post('/call-report/scan', KEY).expect(403);
        expect(scan.execute).not.toHaveBeenCalled();
    });

    it('enforce: без ключа и с неверным ключом — 403, разбор не запускается', async () => {
        setEnv('enforce', KEY);
        await post('/call-report/analyze').expect(403);
        await post('/call-report/analyze', 'wrong-key').expect(403);
        expect(analyze.execute).not.toHaveBeenCalled();
    });

    it('enforce, верный ключ — ручка работает', async () => {
        setEnv('enforce', KEY);
        await post('/call-report/scan', KEY).expect(200);
        expect(scan.execute).toHaveBeenCalledWith(
            DOMAIN,
            expect.objectContaining({ minDurationSec: 60 }),
        );
    });

    it('report (по умолчанию) — без ключа работает как раньше', async () => {
        delete process.env[APRIL_INTERNAL_GUARD_MODE_ENV];
        delete process.env[APRIL_INTERNAL_API_KEY_ENV];
        await post('/call-report/scan').expect(200);
        expect(scan.execute).toHaveBeenCalledTimes(1);
    });

    it.each([
        'installSmart',
        'scan',
        'analyze',
        'revise',
        'presentationAuditRun',
        'presentationPlanFactRun',
        'weeklyReport',
        'typeStatsRun',
    ])('%s под служебным ключом', handler => {
        expect(isInternalKeyProtected(CallReportController, handler)).toBe(
            true,
        );
    });
});
