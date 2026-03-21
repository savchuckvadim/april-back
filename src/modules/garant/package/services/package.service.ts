import { Injectable, NotFoundException } from '@nestjs/common';
import { PackageEntity } from '../entity/package.entity';
import { PackageRepository } from '../repository/package.repository';
import { PackageCreateDto } from '../dto/package-create.dto';
import { PackageEntityDto } from '../dto/package-entity.dto';
import { PackageProductTypeEnum, PackageTypeEnum } from '../types/package.type';
import { PackageUpdateDto } from '../dto/package-update.dto';

@Injectable()
export class PackageService {
    constructor(private readonly packageRepository: PackageRepository) {}

    async create(
        createPackageDto: PackageCreateDto,
    ): Promise<PackageEntityDto> {
        const packageEntity = new PackageEntity();
        Object.assign(packageEntity, createPackageDto);
        const newPackage = await this.packageRepository.create(packageEntity);
        if (!newPackage) throw new NotFoundException('Package not created');
        return new PackageEntityDto(newPackage);
    }

    async findAll(): Promise<PackageEntityDto[]> {
        const packages = await this.packageRepository.findMany();
        if (!packages) return [];
        return packages.map(pkg => new PackageEntityDto(pkg));
    }
    async findById(id: string): Promise<PackageEntityDto> {
        const packageEntity = await this.packageRepository.findById(id);
        if (!packageEntity) throw new NotFoundException('Package not found');
        return new PackageEntityDto(packageEntity);
    }

    async update(
        id: string,
        updatePackageDto: PackageUpdateDto,
    ): Promise<PackageEntityDto> {
        const packageEntity = new PackageEntity();
        Object.assign(packageEntity, { id, ...updatePackageDto });
        const updatedPackage =
            await this.packageRepository.update(packageEntity);
        if (!updatedPackage) throw new NotFoundException('Package not updated');
        return new PackageEntityDto(updatedPackage);
    }

    async findByCode(code: string): Promise<PackageEntityDto | null> {
        const packageEntity = await this.packageRepository.findByCode(code);
        if (!packageEntity) return null;
        return new PackageEntityDto(packageEntity as PackageEntity);
    }
}
