import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from 'src/core/prisma';
import { StorageService } from '@lib/core/storage/storage.service';
import { SupplyReportTemplateController } from '../controllers/supply-report-template.controller';
import { SupplyReportTemplateCrudService } from '../services/supply-report-template-crud.service';
import { SupplyReportTemplateQueryService } from '../services/supply-report-template-query.service';
import { SupplyReportTemplateFilesService } from '../services/supply-report-template-files.service';
import { SupplyReportTemplateScopeService } from '../services/supply-report-template-scope.service';
import { SupplyReportTemplateDownloadService } from '../services/supply-report-template-download.service';
import { SupplyReportTemplateRepository } from '../repositories/supply-report-template.repository';
import { SupplyReportTemplatePrismaRepository } from '../repositories/supply-report-template.prisma.repository';

/**
 * Проверка графа зависимостей модуля БЕЗ подъёма реальной инфраструктуры:
 * провайдеры перечислены вручную, `PrismaService`/`StorageService`/
 * `ConfigService` подменены пустышками. Импортировать настоящие
 * инфраструктурные модули нельзя — они открывают Redis/БД и подвешивают
 * jest.
 */
describe('SupplyReportTemplateModule (граф зависимостей)', () => {
    const createModule = () =>
        Test.createTestingModule({
            controllers: [SupplyReportTemplateController],
            providers: [
                { provide: PrismaService, useValue: {} },
                { provide: StorageService, useValue: {} },
                { provide: ConfigService, useValue: { get: () => undefined } },
                {
                    provide: SupplyReportTemplateRepository,
                    useClass: SupplyReportTemplatePrismaRepository,
                },
                SupplyReportTemplateQueryService,
                SupplyReportTemplateFilesService,
                SupplyReportTemplateScopeService,
                SupplyReportTemplateCrudService,
                SupplyReportTemplateDownloadService,
            ],
        }).compile();

    it('контроллер и все сервисы собираются', async () => {
        const moduleRef = await createModule();

        expect(moduleRef.get(SupplyReportTemplateController)).toBeInstanceOf(
            SupplyReportTemplateController,
        );
        expect(moduleRef.get(SupplyReportTemplateQueryService)).toBeInstanceOf(
            SupplyReportTemplateQueryService,
        );
        expect(moduleRef.get(SupplyReportTemplateFilesService)).toBeInstanceOf(
            SupplyReportTemplateFilesService,
        );
        expect(moduleRef.get(SupplyReportTemplateScopeService)).toBeInstanceOf(
            SupplyReportTemplateScopeService,
        );
        expect(moduleRef.get(SupplyReportTemplateCrudService)).toBeInstanceOf(
            SupplyReportTemplateCrudService,
        );
        expect(
            moduleRef.get(SupplyReportTemplateDownloadService),
        ).toBeInstanceOf(SupplyReportTemplateDownloadService);

        await moduleRef.close();
    });

    it('абстрактный репозиторий подменяется Prisma-реализацией', async () => {
        const moduleRef = await createModule();

        expect(moduleRef.get(SupplyReportTemplateRepository)).toBeInstanceOf(
            SupplyReportTemplatePrismaRepository,
        );

        await moduleRef.close();
    });
});
