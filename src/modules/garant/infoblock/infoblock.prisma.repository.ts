import { Injectable } from "@nestjs/common";
import { PrismaService } from "src/core/prisma";
import { InfoblockRepository } from "./infoblock.repository";
import { InfoblockEntity } from "./infoblock.entity";
import { createInfoblockEntityFromPrisma } from "./lib/infoblock-entity.util";
import { createInfogroupEntityFromPrisma } from "../infogroup/lib/infogroup-entity.util";

@Injectable()
export class InfoblockPrismaRepository implements InfoblockRepository {
    constructor(
        private readonly prisma: PrismaService,
    ) { }

    async findById(id: number): Promise<InfoblockEntity | null> {
        const result = await this.prisma.infoblocks.findUnique({
            where: { id: BigInt(id) },
            include: {
                group: true,
                parent: true,
                relation: true,
                related: true,
                excluded: true,
                packages: true,
                packageInfoblocks: true
            }
        });

        if (!result) return null;

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

        if (result.parent) {
            entity.parent = createInfoblockEntityFromPrisma(result.parent);
        }

        if (result.relation) {
            entity.relation = createInfoblockEntityFromPrisma(result.relation);
        }

        if (result.related) {
            entity.related = createInfoblockEntityFromPrisma(result.related);
        }

        if (result.excluded) {
            entity.excluded = createInfoblockEntityFromPrisma(result.excluded);
        }

        entity.packages = result.packages.map(pkg => createInfoblockEntityFromPrisma(pkg));
        entity.packageInfoblocks = result.packageInfoblocks.map(pkg => createInfoblockEntityFromPrisma(pkg));

        return entity;
    }

    async findMany(): Promise<InfoblockEntity[] | null> {
        const result = await this.prisma.infoblocks.findMany();
        if (!result) return null;

        return result.map(infoblock => createInfoblockEntityFromPrisma(infoblock));
    }

    async findByCode(code: string): Promise<InfoblockEntity | null> {
        const infoblock = await this.prisma.infoblocks.findFirst({
            where: { code },
            include: {
                group: {
                    include: {
                        infoblocks: true
                    }
                },
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
        });
        if (!infoblock) return null;

        const entity = createInfoblockEntityFromPrisma(infoblock);

        // Handle relations
        if (infoblock.group) {
            const groupEntity = createInfogroupEntityFromPrisma(infoblock.group);

            if (infoblock.group.infoblocks) {
                groupEntity.infoblocks = infoblock.group.infoblocks.map(ib => createInfoblockEntityFromPrisma(ib));
            }

            entity.group = groupEntity;
        }

        if (infoblock.parent) {
            entity.parent = createInfoblockEntityFromPrisma(infoblock.parent);
        }

        if (infoblock.relation) {
            entity.relation = createInfoblockEntityFromPrisma(infoblock.relation);
        }

        if (infoblock.related) {
            entity.related = createInfoblockEntityFromPrisma(infoblock.related);
        }

        if (infoblock.excluded) {
            entity.excluded = createInfoblockEntityFromPrisma(infoblock.excluded);
        }

        // Handle parent packages (where this infoblock is a part of)
        if (infoblock.infoblock_package_infoblock_idToinfoblocks) {
            entity.packages = infoblock.infoblock_package_infoblock_idToinfoblocks.map(pkg =>
                createInfoblockEntityFromPrisma(pkg.infoblocks_infoblock_package_package_idToinfoblocks)
            );
        }

        // Handle infoblocks in package (where this infoblock is a package)
        if (infoblock.infoblock_package_package_idToinfoblocks) {
            entity.packageInfoblocks = infoblock.infoblock_package_package_idToinfoblocks.map(pkg =>
                createInfoblockEntityFromPrisma(pkg.infoblocks_infoblock_package_infoblock_idToinfoblocks)
            );
        }

        return entity;
    }

    async findByCodes(codes: string[]): Promise<InfoblockEntity[] | null> {
        const infoblocks = await this.prisma.infoblocks.findMany({
            where: { code: { in: codes } },
        });
        if (!infoblocks) return null;

        return infoblocks.map(infoblock => createInfoblockEntityFromPrisma(infoblock));
    }

    async findManyWithRelations(): Promise<InfoblockEntity[] | null> {
        const infoblocks = await this.prisma.infoblocks.findMany({
            include: {
                group: true,
                parent: true,
                relation: true,
                related: true,
                excluded: true,
                packages: true,
                packageInfoblocks: true
            }
        });
        if (!infoblocks) return null;

        return infoblocks.map(infoblock => {
            const entity = createInfoblockEntityFromPrisma(infoblock);

            if (infoblock.group) {
                entity.group = createInfogroupEntityFromPrisma(infoblock.group);
            }

            if (infoblock.parent) {
                entity.parent = createInfoblockEntityFromPrisma(infoblock.parent);
            }

            if (infoblock.relation) {
                entity.relation = createInfoblockEntityFromPrisma(infoblock.relation);
            }

            if (infoblock.related) {
                entity.related = createInfoblockEntityFromPrisma(infoblock.related);
            }

            if (infoblock.excluded) {
                entity.excluded = createInfoblockEntityFromPrisma(infoblock.excluded);
            }

            entity.packages = infoblock.packages.map(pkg => createInfoblockEntityFromPrisma(pkg));
            entity.packageInfoblocks = infoblock.packageInfoblocks.map(pkg => createInfoblockEntityFromPrisma(pkg));

            return entity;
        });
    }
}   