import { Injectable } from "@nestjs/common";
import { PrismaService } from "src/core/prisma";
import { InfoblockRepository } from "./infoblock.repository";
import { InfoblockEntity } from "./infoblock.entity";

@Injectable()
export class InfoblockPrismaRepository implements InfoblockRepository {
    constructor(
        private readonly prisma: PrismaService,
    ) { }

    async findById(id: number): Promise<InfoblockEntity | null> {
        const infoblock = await this.prisma.infoblocks.findUnique({
            where: { id },
        });
        if (!infoblock) return null;

        const entity = new InfoblockEntity();
        entity.id = Number(infoblock.id);
        entity.name = infoblock.name;
        entity.title = infoblock.title || '';
        entity.weight = Number(infoblock.weight);
        entity.code = infoblock.code;
        // entity.type = infoblock.tag || '';
        entity.description = infoblock.description || '';
        entity.descriptionForSale = infoblock.descriptionForSale || '';
        entity.isActive = infoblock.isShowing;
        return entity;
    }

    async findMany(): Promise<InfoblockEntity[] | null> {
        const result = await this.prisma.infoblocks.findMany();
        if (!result) return null;

        return result.map(infoblock => {
            const entity = new InfoblockEntity();
            entity.id = Number(infoblock.id);
            entity.name = infoblock.name;
            entity.title = infoblock.title || '';
            entity.weight = Number(infoblock.weight);
            entity.code = infoblock.code;
            // entity.type = infoblock.tag || '';
            entity.description = infoblock.description || '';
            entity.descriptionForSale = infoblock.descriptionForSale || '';
            entity.isActive = infoblock.isShowing;
            return entity;
        });
    }

    async findByCode(code: string): Promise<InfoblockEntity | null> {
        const infoblock = await this.prisma.infoblocks.findFirst({
            where: { code },
        });
        if (!infoblock) return null;

        const entity = new InfoblockEntity();
        entity.id = Number(infoblock.id);
        entity.name = infoblock.name;
        entity.title = infoblock.title || '';
        entity.weight = Number(infoblock.weight);
        entity.code = infoblock.code;
        // entity.type = infoblock.tag || '';
        entity.description = infoblock.description || '';
        entity.descriptionForSale = infoblock.descriptionForSale || '';
        entity.isActive = infoblock.isShowing;
        return entity;
    }

    async findByCodes(codes: string[]): Promise<InfoblockEntity[] | null> {
        const infoblocks = await this.prisma.infoblocks.findMany({
            where: { code: { in: codes } },
        });
        if (!infoblocks) return null;

        const entities = infoblocks.map(infoblock => {
            const entity = new InfoblockEntity();
            entity.id = Number(infoblock.id);
            entity.name = infoblock.name;
            entity.title = infoblock.title || '';
            entity.weight = Number(infoblock.weight);
            entity.code = infoblock.code;
            // entity.type = infoblock.tag || '';
            entity.description = infoblock.description || '';
            entity.descriptionForSale = infoblock.descriptionForSale || '';
            entity.isActive = infoblock.isShowing;
            return entity;
        });
        return entities;
    }
}   