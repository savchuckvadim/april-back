import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/core/prisma';
import { PackageRepository } from './package.repository';
import { PackageEntity } from '../entity/package.entity';
import { createPackageEntityFromPrisma } from '../lib/package-entity.util';
import { createInfoblockEntityFromPrisma } from '../../infoblock/';
import { createInfogroupEntityFromPrisma } from '../../infogroup';

@Injectable()
export class PackagePrismaRepository implements PackageRepository {
    constructor(private readonly prisma: PrismaService) {}

    async create(
        packageEntity: Partial<PackageEntity>,
    ): Promise<PackageEntity | null> {
        try {
            const result = await this.prisma.garant_packages.create({
                data: {
                    name: packageEntity.name!,
                    fullName: packageEntity.fullName!,
                    shortName: packageEntity.shortName!,
                    description: packageEntity.description,
                    code: packageEntity.code!,
                    type: packageEntity.type!,
                    color: packageEntity.color,
                    weight: packageEntity.weight,
                    abs: packageEntity.abs,
                    number: packageEntity.number!,
                    productType: packageEntity.productType,
                    withABS: packageEntity.withABS!,
                    isChanging: packageEntity.isChanging!,
                    withDefault: packageEntity.withDefault!,
                    infoblock_id: packageEntity.infoblock_id
                        ? BigInt(packageEntity.infoblock_id)
                        : null,
                    info_group_id: packageEntity.info_group_id
                        ? BigInt(packageEntity.info_group_id)
                        : null,
                },
            });
            return createPackageEntityFromPrisma(result);
        } catch (error) {
            console.error('Error creating package:', error);
            return null;
        }
    }

    async update(
        packageEntity: Partial<PackageEntity>,
    ): Promise<PackageEntity | null> {
        try {
            const { id, ...data } = packageEntity;
            const updateData: any = {
                ...data,
            };

            if (data.infoblock_id !== undefined) {
                updateData.infoblock_id = data.infoblock_id
                    ? BigInt(data.infoblock_id)
                    : null;
            }

            if (data.info_group_id !== undefined) {
                updateData.info_group_id = data.info_group_id
                    ? BigInt(data.info_group_id)
                    : null;
            }

            const result = await this.prisma.garant_packages.update({
                where: { id: BigInt(id!) },
                data: updateData,
            });
            return createPackageEntityFromPrisma(result);
        } catch (error) {
            console.error('Error updating package:', error);
            return null;
        }
    }

    async findById(id: string): Promise<PackageEntity | null> {
        try {
            const result = await this.prisma.garant_packages.findUnique({
                where: { id: BigInt(id) },
                include: {
                    infoblocks: {
                        include: {
                            group: true,
                        },
                    },
                    info_groups: true,
                },
            });
            if (!result) return null;

            const entity = createPackageEntityFromPrisma(result);

            // Handle relations
            if (result.infoblocks) {
                entity.infoblock = createInfoblockEntityFromPrisma(
                    result.infoblocks,
                );
                if (result.infoblocks.group) {
                    entity.infoblock.group = createInfogroupEntityFromPrisma(
                        result.infoblocks.group,
                    );
                }
            }

            if (result.info_groups) {
                entity.info_group = createInfogroupEntityFromPrisma(
                    result.info_groups,
                );
            }

            return entity;
        } catch (error) {
            console.error('Error finding package by id:', error);
            return null;
        }
    }

    async findMany(): Promise<PackageEntity[] | null> {
        try {
            const result = await this.prisma.garant_packages.findMany({
                include: {
                    infoblocks: {
                        include: {
                            group: true,
                        },
                    },
                    info_groups: true,
                },
            });
            if (!result) return null;

            return result.map(pkg => {
                const entity = createPackageEntityFromPrisma(pkg);

                // Handle relations
                if (pkg.infoblocks) {
                    entity.infoblock = createInfoblockEntityFromPrisma(
                        pkg.infoblocks,
                    );
                    if (pkg.infoblocks.group) {
                        entity.infoblock.group =
                            createInfogroupEntityFromPrisma(
                                pkg.infoblocks.group,
                            );
                    }
                }

                if (pkg.info_groups) {
                    entity.info_group = createInfogroupEntityFromPrisma(
                        pkg.info_groups,
                    );
                }

                return entity;
            });
        } catch (error) {
            console.error('Error finding many packages:', error);
            return null;
        }
    }

    async findByCode(code: string): Promise<PackageEntity | null> {
        try {
            console.log(code);
            const result = await this.prisma.garant_packages.findFirst({
                where: { code },
                include: {
                    infoblocks: {
                        include: {
                            group: true,
                        },
                    },
                    info_groups: true,
                },
            });
            console.log(result);
            if (!result) return null;

            const entity = createPackageEntityFromPrisma(result);

            // Handle relations
            if (result.infoblocks) {
                entity.infoblock = createInfoblockEntityFromPrisma(
                    result.infoblocks,
                );
                if (result.infoblocks.group) {
                    entity.infoblock.group = createInfogroupEntityFromPrisma(
                        result.infoblocks.group,
                    );
                }
            }

            if (result.info_groups) {
                entity.info_group = createInfogroupEntityFromPrisma(
                    result.info_groups,
                );
            }

            return entity;
        } catch (error) {
            console.error('Error finding package by code:', error);
            return null;
        }
    }
}
