import {
    BadRequestException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/core/prisma';
import { InfoblockRepository } from './infoblock.repository';
import { InfoblockEntity } from './infoblock.entity';
import { createInfoblockEntityFromPrisma } from './lib/infoblock-entity.util';
import { createInfogroupEntityFromPrisma } from '../infogroup/lib/infogroup-entity.util';

@Injectable()
export class InfoblockPrismaRepository implements InfoblockRepository {
    constructor(private readonly prisma: PrismaService) {}

    async findById(id: number): Promise<InfoblockEntity> {
        const result = await this.prisma.infoblock.findUnique({
            where: { id: BigInt(id) },
            include: {
                group: true,
                parent: true,
                relation: true,
                related: true,
                excluded: true,
                infoblock_package_infoblock_idToinfoblocks: {
                    include: {
                        infoblocks_infoblock_package_package_idToinfoblocks: true,
                    },
                },
                infoblock_package_package_idToinfoblocks: {
                    include: {
                        infoblocks_infoblock_package_infoblock_idToinfoblocks: true,
                    },
                },
            },
        });

        if (!result) {
            throw new NotFoundException('Infoblock not found by id');
        }

        const entity = createInfoblockEntityFromPrisma(result);

        // Handle relations
        if (result.group) {
            const groupEntity = createInfogroupEntityFromPrisma(result.group);
            entity.group = groupEntity;
        } else {
            const group = await this.prisma.info_groups.findFirst({
                where: { infoblocks: { some: { id: BigInt(id) } } },
            });
            if (group) {
                const groupEntity = createInfogroupEntityFromPrisma(group);
                entity.group = groupEntity;
            }
        }

        // if (result.parent) {
        //     entity.parent = createInfoblockEntityFromPrisma(result.parent);
        // }

        // if (result.relation) {
        //     entity.relation = createInfoblockEntityFromPrisma(result.relation);
        // }

        // if (result.related) {
        //     entity.related = createInfoblockEntityFromPrisma(result.related);
        // }

        if (result.excluded) {
            entity.excluded = createInfoblockEntityFromPrisma(result.excluded);
        }

        // Handle package relations
        if (result.infoblock_package_infoblock_idToinfoblocks) {
            entity.packages =
                result.infoblock_package_infoblock_idToinfoblocks.map(pkg =>
                    createInfoblockEntityFromPrisma(
                        pkg.infoblocks_infoblock_package_package_idToinfoblocks,
                    ),
                );
        }

        if (result.infoblock_package_package_idToinfoblocks) {
            entity.packageInfoblocks =
                result.infoblock_package_package_idToinfoblocks.map(pkg =>
                    createInfoblockEntityFromPrisma(
                        pkg.infoblocks_infoblock_package_infoblock_idToinfoblocks,
                    ),
                );
        }

        return entity;
    }

    async findMany(): Promise<InfoblockEntity[] | null> {
        const result = await this.prisma.infoblock.findMany();
        if (!result) return null;
        const entityResults: InfoblockEntity[] = [];

        for (const infoblock of result) {
            const entity = await this.findById(Number(infoblock.id));
            entityResults.push(entity);
        }
        return entityResults;
    }

    async findByCode(code: string): Promise<InfoblockEntity | null> {
        const infoblock = await this.prisma.infoblock.findFirst({
            where: { code },
            include: {
                group: {
                    include: {
                        infoblocks: true,
                    },
                },
                parent: true,
                relation: true,
                related: true,
                excluded: true,
                infoblock_package_infoblock_idToinfoblocks: {
                    include: {
                        infoblocks_infoblock_package_package_idToinfoblocks: true,
                    },
                },
                infoblock_package_package_idToinfoblocks: {
                    include: {
                        infoblocks_infoblock_package_infoblock_idToinfoblocks: true,
                    },
                },
            },
        });
        if (!infoblock) return null;

        const entity = createInfoblockEntityFromPrisma(infoblock);

        // Handle relations
        if (infoblock.group) {
            const groupEntity = createInfogroupEntityFromPrisma(
                infoblock.group,
            );

            if (infoblock.group.infoblocks) {
                groupEntity.infoblocks = infoblock.group.infoblocks.map(ib =>
                    createInfoblockEntityFromPrisma(ib),
                );
            }

            entity.group = groupEntity;
        }

        if (infoblock.parent) {
            entity.parent = createInfoblockEntityFromPrisma(infoblock.parent);
        }

        if (infoblock.relation) {
            entity.relation = createInfoblockEntityFromPrisma(
                infoblock.relation,
            );
        }

        if (infoblock.related) {
            entity.related = createInfoblockEntityFromPrisma(infoblock.related);
        }

        if (infoblock.excluded) {
            entity.excluded = createInfoblockEntityFromPrisma(
                infoblock.excluded,
            );
        }

        // Handle parent packages (where this infoblock is a part of)
        if (infoblock.infoblock_package_infoblock_idToinfoblocks) {
            entity.packages =
                infoblock.infoblock_package_infoblock_idToinfoblocks.map(pkg =>
                    createInfoblockEntityFromPrisma(
                        pkg.infoblocks_infoblock_package_package_idToinfoblocks,
                    ),
                );
        }

        // Handle infoblocks in package (where this infoblock is a package)
        if (infoblock.infoblock_package_package_idToinfoblocks) {
            entity.packageInfoblocks =
                infoblock.infoblock_package_package_idToinfoblocks.map(pkg =>
                    createInfoblockEntityFromPrisma(
                        pkg.infoblocks_infoblock_package_infoblock_idToinfoblocks,
                    ),
                );
        }

        return entity;
    }

    async findByCodes(codes: string[]): Promise<InfoblockEntity[] | null> {
        const infoblocks = await this.prisma.infoblock.findMany({
            where: { code: { in: codes } },
        });
        if (!infoblocks) return null;

        return infoblocks.map(infoblock =>
            createInfoblockEntityFromPrisma(infoblock),
        );
    }

    async findManyWithRelations(): Promise<InfoblockEntity[] | null> {
        const infoblocks = await this.prisma.infoblock.findMany({
            include: {
                group: true,
                parent: true,
                relation: true,
                related: true,
                excluded: true,
                infoblock_package_infoblock_idToinfoblocks: {
                    include: {
                        infoblocks_infoblock_package_package_idToinfoblocks: true,
                    },
                },
                infoblock_package_package_idToinfoblocks: {
                    include: {
                        infoblocks_infoblock_package_infoblock_idToinfoblocks: true,
                    },
                },
            },
        });
        if (!infoblocks) return null;

        return infoblocks.map(infoblock => {
            const entity = createInfoblockEntityFromPrisma(infoblock);

            if (infoblock.group) {
                entity.group = createInfogroupEntityFromPrisma(infoblock.group);
            }

            if (infoblock.parent) {
                entity.parent = createInfoblockEntityFromPrisma(
                    infoblock.parent,
                );
            }

            if (infoblock.relation) {
                entity.relation = createInfoblockEntityFromPrisma(
                    infoblock.relation,
                );
            }

            if (infoblock.related) {
                entity.related = createInfoblockEntityFromPrisma(
                    infoblock.related,
                );
            }

            if (infoblock.excluded) {
                entity.excluded = createInfoblockEntityFromPrisma(
                    infoblock.excluded,
                );
            }

            // Handle package relations
            if (infoblock.infoblock_package_infoblock_idToinfoblocks) {
                entity.packages =
                    infoblock.infoblock_package_infoblock_idToinfoblocks.map(
                        pkg =>
                            createInfoblockEntityFromPrisma(
                                pkg.infoblocks_infoblock_package_package_idToinfoblocks,
                            ),
                    );
            }

            if (infoblock.infoblock_package_package_idToinfoblocks) {
                entity.packageInfoblocks =
                    infoblock.infoblock_package_package_idToinfoblocks.map(
                        pkg =>
                            createInfoblockEntityFromPrisma(
                                pkg.infoblocks_infoblock_package_infoblock_idToinfoblocks,
                            ),
                    );
            }

            return entity;
        });
    }

    async create(
        infoblock: Partial<InfoblockEntity>,
    ): Promise<InfoblockEntity> {
        try {
            const groupId = BigInt(infoblock.group_id!);

            const count = await this.prisma.infoblock.count({
                where: { group_id: groupId },
            });
            const inGroupId = count + 1;
            // В реальной БД есть legacy NOT NULL колонка `infoblock_id`, которой нет в schema.prisma.
            // Prisma create не может ее передать, поэтому делаем вставку через raw SQL с infoblock_id=0.
            await this.prisma.$executeRaw`
                INSERT INTO infoblocks
                (
                    number, name, title, description, descriptionForSale,
                    shortDescription, weight, code, inGroupId, groupId,
                    group_id, parent_id, relation_id, related_id, excluded_id,
                    isLa, isFree, isShowing, isSet, isProduct, isPackage, tag,
                    infoblock_id
                )
                VALUES
                (
                    ${infoblock.number!}, ${infoblock.name!}, ${infoblock.title ?? null}, ${infoblock.description ?? null}, ${infoblock.descriptionForSale ?? null},
                    ${infoblock.shortDescription ?? null}, ${infoblock.weight!}, ${infoblock.code!}, ${inGroupId}, ${groupId},
                    ${null}, ${null}, ${null}, ${null}, ${null},
                    ${infoblock.isLa!}, ${infoblock.isFree!}, ${infoblock.isShowing!}, ${infoblock.isSet!}, ${infoblock.isProduct ?? null}, ${infoblock.isPackage ?? null}, ${infoblock.tag ?? null},
                    ${BigInt(0)}
                )
            `;

            const result = await this.prisma.infoblock.findFirst({
                where: { code: infoblock.code!, number: infoblock.number! },
                orderBy: { id: 'desc' },
            });
            if (!result) {
                throw new NotFoundException('Infoblock not created');
            }

            const withGroup = await this.setGroup(
                result.id.toString(),
                infoblock.group_id ?? null,
            );
            if (withGroup) return withGroup;
            return this.findById(Number(result.id));
        } catch (error: any) {
            const errorData = {
                code: error?.code,
                meta: error?.meta,
                message: error?.message,
                infoblock: {
                    number: infoblock.number,
                    name: infoblock.name,
                    code: infoblock.code,
                    group_id: infoblock.group_id,
                },
            };
            console.error('Error creating infoblock:', errorData);
            throw new BadRequestException(JSON.stringify(errorData));
        }
    }

    async update(
        infoblock: Partial<InfoblockEntity>,
    ): Promise<InfoblockEntity | null> {
        try {
            const { id, ...data } = infoblock;
            const result = await this.prisma.infoblock.update({
                where: { id: BigInt(id!) },
                data: {
                    number: data.number,
                    name: data.name,
                    title: data.title ?? null,
                    description: data.description ?? null,
                    descriptionForSale: data.descriptionForSale ?? null,
                    shortDescription: data.shortDescription ?? null,
                    weight: data.weight,
                    code: data.code,
                    inGroupId: data.inGroupId
                        ? Number(data.inGroupId)
                        : undefined,
                    group_id: data.group_id
                        ? BigInt(data.group_id)
                        : data.group_id === null
                          ? null
                          : undefined,
                    isLa: data.isLa,
                    isFree: data.isFree,
                    isShowing: data.isShowing,
                    isSet: data.isSet,
                    isProduct: data.isProduct ?? null,
                    isPackage: data.isPackage ?? null,
                    tag: data.tag ?? null,
                    parent_id: data.parent_id
                        ? BigInt(data.parent_id)
                        : data.parent_id === null
                          ? null
                          : undefined,
                    relation_id: data.relation_id
                        ? BigInt(data.relation_id)
                        : data.relation_id === null
                          ? null
                          : undefined,
                    related_id: data.related_id
                        ? BigInt(data.related_id)
                        : data.related_id === null
                          ? null
                          : undefined,
                    excluded_id: data.excluded_id
                        ? BigInt(data.excluded_id)
                        : data.excluded_id === null
                          ? null
                          : undefined,
                },
            });
            return this.findById(Number(id!));
        } catch (error) {
            console.error('Error updating infoblock:', error);
            return null;
        }
    }

    async setGroup(
        infoblockId: string,
        groupId: string | null,
    ): Promise<InfoblockEntity | null> {
        try {
            await this.prisma.infoblock.update({
                where: { id: BigInt(infoblockId) },
                data: {
                    group_id: groupId ? BigInt(groupId) : null,
                },
            });
            return this.findById(Number(infoblockId));
        } catch (error) {
            console.error('Error setting group:', error);
            return null;
        }
    }
    async delete(id: string): Promise<boolean> {
        try {
            const infoblock = await this.findById(Number(id));
            if (!infoblock) {
                throw new NotFoundException('Infoblock not found');
            }
            await this.prisma.infoblock.delete({
                where: { id: BigInt(id) },
            });
            await this.prisma.infoblock_package.deleteMany({
                where: { infoblock_id: BigInt(id) },
            });
            await this.prisma.infoblock_package.deleteMany({
                where: { package_id: BigInt(id) },
            });
            return true;
        } catch (error) {
            console.error('Error deleting infoblock:', error);
            throw new BadRequestException('Error deleting infoblock');
        }
    }
    // async setParent(infoblockId: string, parentId: string | null): Promise<InfoblockEntity | null> {
    //     try {
    //         await this.prisma.infoblock.update({
    //             where: { id: BigInt(infoblockId) },
    //             data: {
    //                 parent_id: parentId ? BigInt(parentId) : null,
    //             },
    //         });
    //         return this.findById(Number(infoblockId));
    //     } catch (error) {
    //         console.error('Error setting parent:', error);
    //         return null;
    //     }
    // }

    // async setRelation(infoblockId: string, relationId: string | null): Promise<InfoblockEntity | null> {
    //     try {
    //         await this.prisma.infoblock.update({
    //             where: { id: BigInt(infoblockId) },
    //             data: {
    //                 relation_id: relationId ? BigInt(relationId) : null,
    //             },
    //         });
    //         return this.findById(Number(infoblockId));
    //     } catch (error) {
    //         console.error('Error setting relation:', error);
    //         return null;
    //     }
    // }

    // async setRelated(infoblockId: string, relatedId: string | null): Promise<InfoblockEntity | null> {
    //     try {
    //         await this.prisma.infoblock.update({
    //             where: { id: BigInt(infoblockId) },
    //             data: {
    //                 related_id: relatedId ? BigInt(relatedId) : null,
    //             },
    //         });
    //         return this.findById(Number(infoblockId));
    //     } catch (error) {
    //         console.error('Error setting related:', error);
    //         return null;
    //     }
    // }

    async setExcluded(
        infoblockId: string,
        excludedId: string | null,
    ): Promise<InfoblockEntity | null> {
        try {
            await this.prisma.infoblock.update({
                where: { id: BigInt(infoblockId) },
                data: {
                    excluded_id: excludedId ? BigInt(excludedId) : null,
                },
            });
            return this.findById(Number(infoblockId));
        } catch (error) {
            console.error('Error setting excluded:', error);
            return null;
        }
    }

    /**
     *
     * Действие проиходит из одного инфоблока в несколько пакетов
     */

    async addPackages(
        infoblockId: string,
        packageIds: string[],
    ): Promise<InfoblockEntity | null> {
        try {
            // Добавляем инфоблоки в пакет (infoblockId - это infoblock, packageIds - пакеты, в которые он входит)
            await this.prisma.infoblock_package.createMany({
                data: packageIds.map(pkgId => ({
                    infoblock_id: BigInt(infoblockId),
                    package_id: BigInt(pkgId),
                })),
                skipDuplicates: true,
            });
            return this.findById(Number(infoblockId));
        } catch (error) {
            console.error('Error adding packages:', error);
            return null;
        }
    }

    // удалить infoblockpackages из инфоблока.
    async removePackages(
        infoblockId: string,
        packageIds: string[],
    ): Promise<InfoblockEntity | null> {
        try {
            await this.prisma.infoblock_package.deleteMany({
                where: {
                    infoblock_id: BigInt(infoblockId),
                    package_id: {
                        in: packageIds.map(id => BigInt(id)),
                    },
                },
            });
            return this.findById(Number(infoblockId));
        } catch (error) {
            console.error('Error removing packages:', error);
            return null;
        }
    }
    // //засетать один инфоблок в несколько пакетов
    // async setInfoblockInPackages(infoblockId: string, packageIds: string[]): Promise<InfoblockEntity | null> {
    //     try {
    //         // Удаляем все существующие связи (где infoblockId - это пакет)
    //         await this.prisma.infoblock_package.deleteMany({
    //             where: {
    //                 package_id: BigInt(infoblockId),
    //             },
    //         });
    //         // Создаем новые связи
    //         if (packageIds.length > 0) {
    //             await this.prisma.infoblock_package.createMany({
    //                 data: packageIds.map(pkgId => ({
    //                     package_id: BigInt(infoblockId),
    //                     infoblock_id: BigInt(pkgId),
    //                 })),
    //             });
    //         }
    //         return this.findById(Number(infoblockId));
    //     } catch (error) {
    //         console.error('Error setting packages:', error);
    //         return null;
    //     }
    // }

    // Методы для управления пакетами, в которые входит инфоблок (packages)
    /**
     *
     * Действие проиходит из одного пакета  с несколькими инфоблоками
     */
    async addInfoblocksToPackage(
        infoblockIds: string[],
        packageId: string,
    ): Promise<InfoblockEntity | null> {
        try {
            // Добавляем инфоблоки в пакеты (infoblockId - это инфоблок, packageIds - пакеты, в которые он входит)
            await this.prisma.infoblock_package.createMany({
                data: infoblockIds.map(infoblockId => ({
                    package_id: BigInt(packageId),
                    infoblock_id: BigInt(infoblockId),
                })),
                skipDuplicates: true,
            });
            return this.findById(Number(packageId));
        } catch (error) {
            console.error('Error adding to packages:', error);
            return null;
        }
    }

    async removeInfoblocksFromPackage(
        infoblockIds: string[],
        packageId: string,
    ): Promise<InfoblockEntity | null> {
        try {
            // Удаляем инфоблок из пакета
            await this.prisma.infoblock_package.deleteMany({
                where: {
                    infoblock_id: {
                        in: infoblockIds.map(id => BigInt(id)),
                    },
                    package_id: BigInt(packageId),
                },
            });
            return this.findById(Number(packageId));
        } catch (error) {
            console.error('Error removing from packages:', error);
            return null;
        }
    }

    //засетать несколько инфоблоков в один пакет
    // а все остальное из пакета удалить
    async setInfoblocksInPackage(
        infoblockIds: string[],
        packageId: string,
    ): Promise<InfoblockEntity> {
        // Удаляем все существующие связи (где packageId - это package)
        // то есть убираем все инфоблоки из пакета
        await this.prisma.infoblock_package.deleteMany({
            where: {
                package_id: BigInt(packageId),
            },
        });
        // Создаем новые связи
        if (infoblockIds.length > 0) {
            await this.prisma.infoblock_package.createMany({
                data: infoblockIds.map(infoblockId => ({
                    package_id: BigInt(packageId),
                    infoblock_id: BigInt(infoblockId),
                })),
            });
        }
        return this.findById(Number(packageId));
    }
}
