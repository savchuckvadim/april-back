import { Module } from '@nestjs/common';
import { PackageService } from './services/package.service';
import { PackageRepository } from './repository/package.repository';
import { PackagePrismaRepository } from './repository/package.prisma.repository';
import { AdminGarantPackageController } from './controllers/package.admin.controller';

@Module({
    controllers: [AdminGarantPackageController],
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
