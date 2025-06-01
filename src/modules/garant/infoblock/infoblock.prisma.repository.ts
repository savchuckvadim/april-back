import { Injectable } from "@nestjs/common";
import { PrismaService } from "src/core/prisma";
import { InfoblockRepository } from "./infoblock.repository";
import { InfoblockEntity } from "./infoblock.entity";
import { InfogroupEntity } from "../infogroup/infogroup.entity";

@Injectable()
export class InfoblockPrismaRepository implements InfoblockRepository {
    constructor(
        private readonly prisma: PrismaService,
    ) { }

    private createEntityFromPrisma(data: NonNullable<Awaited<ReturnType<PrismaService['infoblocks']['findUnique']>>>): InfoblockEntity {
        const entity = new InfoblockEntity();
        entity.id = data.id.toString();
        entity.number = data.number;
        entity.name = data.name;
        entity.title = data.title;
        entity.description = data.description;
        entity.descriptionForSale = data.descriptionForSale;
        entity.shortDescription = data.shortDescription;
        entity.weight = data.weight;
        entity.code = data.code;
        entity.inGroupId = data.inGroupId?.toString() ?? null;
        entity.groupId = (data.groupId || BigInt(0)).toString();
        entity.isLa = data.isLa;
        entity.isFree = data.isFree;
        entity.isShowing = data.isShowing;
        entity.isSet = data.isSet;
        entity.isProduct = data.isProduct;
        entity.isPackage = data.isPackage;
        entity.tag = data.tag;
        entity.parent_id = data.parent_id?.toString() ?? null;
        entity.relation_id = data.relation_id?.toString() ?? null;
        entity.related_id = data.related_id?.toString() ?? null;
        entity.excluded_id = data.excluded_id?.toString() ?? null;
        entity.created_at = data.created_at;
        entity.updated_at = data.updated_at;
        return entity;
    }

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

        const entity = this.createEntityFromPrisma(result);

        // Handle relations
        if (result.group) {
            const groupEntity = new InfogroupEntity();
            groupEntity.id = result.group.id.toString();
            groupEntity.number = result.group.number;
            groupEntity.name = result.group.name;
            groupEntity.title = result.group.title;
            groupEntity.description = result.group.description;
            groupEntity.descriptionForSale = result.group.descriptionForSale;
            groupEntity.shortDescription = result.group.shortDescription;
            groupEntity.code = result.group.code;
            groupEntity.type = result.group.type;
            groupEntity.productType = result.group.productType;
            groupEntity.created_at = result.group.created_at;
            groupEntity.updated_at = result.group.updated_at;
            entity.group = groupEntity;
        }

        if (result.parent) {
            entity.parent = this.createEntityFromPrisma(result.parent);
        }

        if (result.relation) {
            entity.relation = this.createEntityFromPrisma(result.relation);
        }

        if (result.related) {
            entity.related = this.createEntityFromPrisma(result.related);
        }

        if (result.excluded) {
            entity.excluded = this.createEntityFromPrisma(result.excluded);
        }

        entity.packages = result.packages.map(pkg => this.createEntityFromPrisma(pkg));
        entity.packageInfoblocks = result.packageInfoblocks.map(pkg => this.createEntityFromPrisma(pkg));

        return entity;
    }

    async findMany(): Promise<InfoblockEntity[] | null> {
        const result = await this.prisma.infoblocks.findMany();
        if (!result) return null;

        return result.map(infoblock => this.createEntityFromPrisma(infoblock));
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

        const entity = this.createEntityFromPrisma(infoblock);

        // Handle relations
        if (infoblock.group) {
            const groupEntity = new InfogroupEntity();
            groupEntity.id = infoblock.group.id.toString();
            groupEntity.number = infoblock.group.number;
            groupEntity.name = infoblock.group.name;
            groupEntity.title = infoblock.group.title;
            groupEntity.description = infoblock.group.description;
            groupEntity.descriptionForSale = infoblock.group.descriptionForSale;
            groupEntity.shortDescription = infoblock.group.shortDescription;
            groupEntity.code = infoblock.group.code;
            groupEntity.type = infoblock.group.type;
            groupEntity.productType = infoblock.group.productType;
            groupEntity.created_at = infoblock.group.created_at;
            groupEntity.updated_at = infoblock.group.updated_at;

            // Add infoblocks to group
            if (infoblock.group.infoblocks) {
                groupEntity.infoblocks = infoblock.group.infoblocks.map(ib => this.createEntityFromPrisma(ib));
            }

            entity.group = groupEntity;
        }

        if (infoblock.parent) {
            entity.parent = this.createEntityFromPrisma(infoblock.parent);
        }

        if (infoblock.relation) {
            entity.relation = this.createEntityFromPrisma(infoblock.relation);
        }

        if (infoblock.related) {
            entity.related = this.createEntityFromPrisma(infoblock.related);
        }

        if (infoblock.excluded) {
            entity.excluded = this.createEntityFromPrisma(infoblock.excluded);
        }

        // Handle parent packages (where this infoblock is a part of)
        if (infoblock.infoblock_package_infoblock_idToinfoblocks) {
            entity.packages = infoblock.infoblock_package_infoblock_idToinfoblocks.map(pkg =>
                this.createEntityFromPrisma(pkg.infoblocks_infoblock_package_package_idToinfoblocks)
            );
        }

        // Handle infoblocks in package (where this infoblock is a package)
        if (infoblock.infoblock_package_package_idToinfoblocks) {
            entity.packageInfoblocks = infoblock.infoblock_package_package_idToinfoblocks.map(pkg =>
                this.createEntityFromPrisma(pkg.infoblocks_infoblock_package_infoblock_idToinfoblocks)
            );
        }

        return entity;
    }

    async findByCodes(codes: string[]): Promise<InfoblockEntity[] | null> {
        const infoblocks = await this.prisma.infoblocks.findMany({
            where: { code: { in: codes } },
        });
        if (!infoblocks) return null;

        return infoblocks.map(infoblock => this.createEntityFromPrisma(infoblock));
    }
}   