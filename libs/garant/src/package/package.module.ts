import { Module } from '@nestjs/common';
import { PackageService } from './services/package.service';
import { PackageRepository } from './repository/package.repository';
import { PackagePrismaRepository } from './repository/package.prisma.repository';

/**
 * Сервисный модуль пакетов гаранта: провайдеры + экспорт сервиса/репозитория.
 * Админ-контроллер вынесен в {@link AdminGarantPackageModule}, чтобы konstructor
 * (импортит ради PackageService) не тащил админские роуты в свой Swagger.
 */
@Module({
    providers: [
        PackageService,
        {
            provide: PackageRepository,
            useClass: PackagePrismaRepository,
        },
    ],
    exports: [PackageService, PackageRepository],
})
export class PackageModule {}
