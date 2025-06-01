import { Injectable } from "@nestjs/common";
import { PrismaService } from "src/core/prisma";
import { InfogroupRepository } from "./infogroup.repository";
import { InfogroupEntity } from "./infogroup.entity";
import { createInfogroupEntityFromPrisma } from "./lib/infogroup-entity.util";
import { createInfoblockEntityFromPrisma } from "../infoblock";



@Injectable()
export class InfogroupPrismaRepository implements InfogroupRepository {
    constructor(
        private readonly prisma: PrismaService,
    ) { }


    async create(infogroup: Partial<InfogroupEntity>): Promise<InfogroupEntity | null> {
        const result = await this.prisma.info_groups.create({
            data: {
                number: infogroup.number!,
                code: infogroup.code!,
                name: infogroup.name!,
                title: infogroup.title!,
                description: infogroup.description,
                descriptionForSale: infogroup.descriptionForSale,
                shortDescription: infogroup.shortDescription,
                type: infogroup.type!,
                productType: infogroup.productType!,
            },
        });
        return createInfogroupEntityFromPrisma(result);
    }

    async update(infogroup: Partial<InfogroupEntity>): Promise<InfogroupEntity | null> {
        const { id, infoblocks, ...data } = infogroup;
        const result = await this.prisma.info_groups.update({
            where: { id: BigInt(id!) },
            data
        });
        return createInfogroupEntityFromPrisma(result);
    }

    async findById(id: number): Promise<InfogroupEntity | null> {
        const result = await this.prisma.info_groups.findUnique({
            where: { id: BigInt(id) },
            include: {
                infoblocks: true
            }
        });

        if (!result) return null;

        const entity = createInfogroupEntityFromPrisma(result);
        entity.infoblocks = result.infoblocks.map(infoblock => createInfoblockEntityFromPrisma(infoblock));

        return entity;
    }

    async findMany(): Promise<InfogroupEntity[] | null> {
        const result = await this.prisma.info_groups.findMany({
            include: {
                infoblocks: true
            }
        });
        if (!result) return null;

        return result.map(group => {
            const entity = createInfogroupEntityFromPrisma(group);
            entity.infoblocks = group.infoblocks.map(infoblock => createInfoblockEntityFromPrisma(infoblock));
            return entity;
        });
    }

    async findByCode(code: string): Promise<InfogroupEntity | null> {
        const infogroup = await this.prisma.info_groups.findFirst({
            where: { code },
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
        });
        if (!infogroup) return null;

        const entity = createInfogroupEntityFromPrisma(infogroup);

        // Add all infoblocks with their relations
        if (infogroup.infoblocks) {
            entity.infoblocks = infogroup.infoblocks.map(infoblock => {
                const ibEntity = createInfoblockEntityFromPrisma(infoblock);

                // Handle relations for each infoblock
                if (infoblock.group) {
                    const groupEntity = createInfogroupEntityFromPrisma(infoblock.group);

                    ibEntity.group = groupEntity;
                }

                if (infoblock.parent) {
                    ibEntity.parent = createInfoblockEntityFromPrisma(infoblock.parent);
                }

                if (infoblock.relation) {
                    ibEntity.relation = createInfoblockEntityFromPrisma(infoblock.relation);
                }

                if (infoblock.related) {
                    ibEntity.related = createInfoblockEntityFromPrisma(infoblock.related);
                }

                if (infoblock.excluded) {
                    ibEntity.excluded = createInfoblockEntityFromPrisma(infoblock.excluded);
                }

                // Handle package relations
                if (infoblock.infoblock_package_infoblock_idToinfoblocks) {
                    ibEntity.packages = infoblock.infoblock_package_infoblock_idToinfoblocks.map(pkg =>
                        createInfoblockEntityFromPrisma(pkg.infoblocks_infoblock_package_package_idToinfoblocks)
                    );
                }

                if (infoblock.infoblock_package_package_idToinfoblocks) {
                    ibEntity.packageInfoblocks = infoblock.infoblock_package_package_idToinfoblocks.map(pkg =>
                        createInfoblockEntityFromPrisma(pkg.infoblocks_infoblock_package_infoblock_idToinfoblocks)
                    );
                }

                return ibEntity;
            });
        }

        return entity;
    }

    async findByCodes(codes: string[]): Promise<InfogroupEntity[] | null> {
        const infogroups = await this.prisma.info_groups.findMany({
            where: { code: { in: codes } },
            include: {
                infoblocks: true
            }
        });
        if (!infogroups) return null;

        return infogroups.map(group => {
            const entity = createInfogroupEntityFromPrisma(group);
            entity.infoblocks = group.infoblocks.map(infoblock => createInfoblockEntityFromPrisma(infoblock));
            return entity;
        });
    }
} 