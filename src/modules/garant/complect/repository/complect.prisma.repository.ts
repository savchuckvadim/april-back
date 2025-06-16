import { Injectable } from "@nestjs/common";
import { PrismaService } from "src/core/prisma";
import { ComplectRepository } from "./complect.repository";
import { ComplectEntity } from "../complect.entity";

import { InfogroupEntity } from "../../infogroup/infogroup.entity";
import { createInfoblockEntityFromPrisma } from "../../infoblock/lib/infoblock-entity.util";
import { createComplectEntityFromPrisma } from "../lib/complect-entity.util";
import { createInfogroupEntityFromPrisma } from "../../infogroup/lib/infogroup-entity.util";


@Injectable()
export class ComplectPrismaRepository implements ComplectRepository {
    constructor(
        private readonly prisma: PrismaService,
    ) { }



    async create(complect: Partial<ComplectEntity>): Promise<ComplectEntity | null> {
        try {
         
            const result = await this.prisma.complects.create({
                data: {
                    name: complect.name!,
                    fullName: complect.fullName!,
                    shortName: complect.shortName!,
                    description: complect.description!,
                    code: complect.code!,
                    type: complect.type!,
                    color: complect.color!,
                    weight: complect.weight!,
                    abs: complect.abs ? parseFloat(complect.abs) : undefined,
                    number: complect.number!,
                    productType: complect.productType!,
                    withABS: complect.withABS!,
                    withConsalting: complect.withConsalting!,
                    withServices: complect.withServices!,
                    withLt: complect.withLt!,
                    isChanging: complect.isChanging!,
                    withDefault: complect.withDefault!
                },
            });
            return createComplectEntityFromPrisma(result);
        } catch (error) {
            console.error('Error creating complect:', error);
            return null;
        }
    }

    async update(complect: Partial<ComplectEntity>): Promise<ComplectEntity | null> {
        try {
            const { id, ...data } = complect;
            const result = await this.prisma.complects.update({
                where: { id: BigInt(id!) },
                data: {
                    ...data,
                    abs: data.abs ? parseFloat(data.abs) : undefined
                }
            });
            return createComplectEntityFromPrisma(result);
        } catch (error) {
            console.error('Error updating complect:', error);
            return null;
        }
    }

    async findById(id: string): Promise<ComplectEntity | null> {
        try {
            const result = await this.prisma.complects.findUnique({
                where: { id: BigInt(id) },
                include: {
                    complect_infoblock: {
                        include: {
                            infoblocks: {
                                include: {
                                    group: true,
                                    parent: true,
                                    relation: true,
                                    related: true,
                                    excluded: true,
                                    infoblock_package_infoblock_idToinfoblocks: {
                                        include: {
                                            infoblocks_infoblock_package_package_idToinfoblocks: true
                                        }
                                    },
                                    infoblock_package_package_idToinfoblocks: {
                                        include: {
                                            infoblocks_infoblock_package_infoblock_idToinfoblocks: true
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            });
            if (!result) return null;

            const entity = createComplectEntityFromPrisma(result);

            // Add infoblocks
            if (result.complect_infoblock) {
                entity.infoblocks = result.complect_infoblock.map(ci => {
                    const ibEntity = createInfoblockEntityFromPrisma(ci.infoblocks);

                    // Handle relations for each infoblock
                    if (ci.infoblocks.group) {
                        const groupEntity = createInfogroupEntityFromPrisma(ci.infoblocks.group);

                        ibEntity.group = groupEntity;
                    }

                    if (ci.infoblocks.parent) {
                        ibEntity.parent = createInfoblockEntityFromPrisma(ci.infoblocks.parent);
                    }

                    if (ci.infoblocks.relation) {
                        ibEntity.relation = createInfoblockEntityFromPrisma(ci.infoblocks.relation);
                    }

                    if (ci.infoblocks.related) {
                        ibEntity.related = createInfoblockEntityFromPrisma(ci.infoblocks.related);
                    }

                    if (ci.infoblocks.excluded) {
                        ibEntity.excluded = createInfoblockEntityFromPrisma(ci.infoblocks.excluded);
                    }

                    // Handle package relations
                    if (ci.infoblocks.infoblock_package_infoblock_idToinfoblocks) {
                        ibEntity.packages = ci.infoblocks.infoblock_package_infoblock_idToinfoblocks.map(pkg =>
                            createInfoblockEntityFromPrisma(pkg.infoblocks_infoblock_package_package_idToinfoblocks)
                        );
                    }

                    if (ci.infoblocks.infoblock_package_package_idToinfoblocks) {
                        ibEntity.packageInfoblocks = ci.infoblocks.infoblock_package_package_idToinfoblocks.map(pkg =>
                            createInfoblockEntityFromPrisma(pkg.infoblocks_infoblock_package_infoblock_idToinfoblocks)
                        );
                    }

                    return ibEntity;
                });
            }

            return entity;
        } catch (error) {
            console.error('Error finding complect by id:', error);
            return null;
        }
    }

    async findMany(): Promise<ComplectEntity[] | null> {
        try {
            const result = await this.prisma.complects.findMany({
                include: {
                    complect_infoblock: {
                        include: {
                            infoblocks: {
                                include: {
                                    group: true,
                                    parent: true,
                                    relation: true,
                                    related: true,
                                    excluded: true,
                                    infoblock_package_infoblock_idToinfoblocks: {
                                        include: {
                                            infoblocks_infoblock_package_package_idToinfoblocks: true
                                        }
                                    },
                                    infoblock_package_package_idToinfoblocks: {
                                        include: {
                                            infoblocks_infoblock_package_infoblock_idToinfoblocks: true
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            });
            if (!result) return null;

            return result.map(complect => {
                const entity = createComplectEntityFromPrisma(complect);

                // Add infoblocks
                if (complect.complect_infoblock) {
                    entity.infoblocks = complect.complect_infoblock.map(ci => {
                        const ibEntity = createInfoblockEntityFromPrisma(ci.infoblocks);

                        // Handle relations for each infoblock
                        if (ci.infoblocks.group) {
                            const groupEntity = createInfogroupEntityFromPrisma(ci.infoblocks.group);
                            ibEntity.group = groupEntity;
                        }

                        if (ci.infoblocks.parent) {
                            ibEntity.parent = createInfoblockEntityFromPrisma(ci.infoblocks.parent);
                        }

                        if (ci.infoblocks.relation) {
                            ibEntity.relation = createInfoblockEntityFromPrisma(ci.infoblocks.relation);
                        }

                        if (ci.infoblocks.related) {
                            ibEntity.related = createInfoblockEntityFromPrisma(ci.infoblocks.related);
                        }

                        if (ci.infoblocks.excluded) {
                            ibEntity.excluded = createInfoblockEntityFromPrisma(ci.infoblocks.excluded);
                        }

                        // Handle package relations
                        if (ci.infoblocks.infoblock_package_infoblock_idToinfoblocks) {
                            ibEntity.packages = ci.infoblocks.infoblock_package_infoblock_idToinfoblocks.map(pkg =>
                                createInfoblockEntityFromPrisma(pkg.infoblocks_infoblock_package_package_idToinfoblocks)
                            );
                        }

                        if (ci.infoblocks.infoblock_package_package_idToinfoblocks) {
                            ibEntity.packageInfoblocks = ci.infoblocks.infoblock_package_package_idToinfoblocks.map(pkg =>
                                createInfoblockEntityFromPrisma(pkg.infoblocks_infoblock_package_infoblock_idToinfoblocks)
                            );
                        }

                        return ibEntity;
                    });
                }

                return entity;
            });
        } catch (error) {
            console.error('Error finding complects:', error);
            return null;
        }
    }

    async findByCode(code: string): Promise<ComplectEntity | null> {
        const result = await this.prisma.complects.findFirst({
            where: { code }
        });
        if (!result) return null;
        return createComplectEntityFromPrisma(result);
    }
} 