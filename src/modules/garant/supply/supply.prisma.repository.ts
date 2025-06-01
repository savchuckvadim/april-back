import { Injectable } from "@nestjs/common";
import { PrismaService } from "src/core/prisma";
import { SupplyRepository } from "./supply.repository";
import { SupplyEntity } from "./supply.entity";
import { SupplyUpdate } from "./type/supply.type";
import { createSupplyEntityFromPrisma } from "./lib/supply-entity.util";

@Injectable()
export class SupplyPrismaRepository implements SupplyRepository {
    constructor(
        private readonly prisma: PrismaService,
    ) { }

    async create(supply: Partial<SupplyEntity>): Promise<SupplyEntity | null> {
        try {
            const result = await this.prisma.supplies.create({
                data: {
                    name: supply.name!,
                    fullName: supply.fullName!,
                    shortName: supply.shortName!,
                    saleName_1: supply.saleName_1,
                    saleName_2: supply.saleName_2,
                    saleName_3: supply.saleName_3,
                    usersQuantity: supply.usersQuantity!,
                    description: supply.description,
                    code: supply.code!,
                    type: supply.type!,
                    color: supply.color,
                    coefficient: supply.coefficient!,
                    contractName: supply.contractName,
                    contractPropComment: supply.contractPropComment,
                    contractPropEmail: supply.contractPropEmail,
                    contractPropLoginsQuantity: supply.contractPropLoginsQuantity,
                    lcontractName: supply.lcontractName,
                    lcontractPropComment: supply.lcontractPropComment,
                    lcontractPropEmail: supply.lcontractPropEmail
                },
            });
            return createSupplyEntityFromPrisma(result);
        } catch (error) {
            console.error('Error creating supply:', error);
            return null;
        }
    }

    async update(supply: Partial<SupplyEntity>): Promise<SupplyEntity | null> {
        try {
            const { id, ...data } = supply;
            const result = await this.prisma.supplies.update({
                where: { id: BigInt(id!) },
                data
            });
            return createSupplyEntityFromPrisma(result);
        } catch (error) {
            console.error('Error updating supply:', error);
            return null;
        }
    }

    async findById(id: string): Promise<SupplyEntity | null> {
        try {
            const result = await this.prisma.supplies.findUnique({
                where: { id: BigInt(id) }
            });
            if (!result) return null;
            return createSupplyEntityFromPrisma(result);
        } catch (error) {
            console.error('Error finding supply by id:', error);
            return null;
        }
    }

    async findMany(): Promise<SupplyEntity[] | null> {
        try {
            const result = await this.prisma.supplies.findMany();
            if (!result) return null;
            return result.map(supply => createSupplyEntityFromPrisma(supply));
        } catch (error) {
            console.error('Error finding supplies:', error);
            return null;
        }
    }

    async updateAll(supplies: SupplyUpdate[]): Promise<SupplyEntity[] | null> {
        try {
            await this.prisma.$transaction(async (prisma) => {
                for (const supply of supplies) {
                    await prisma.supplies.updateMany({
                        where: { code: supply.code },
                        data: supply
                    });
                }
            });

            const updatedSupplies = await this.prisma.supplies.findMany({
                where: {
                    code: {
                        in: supplies.map(s => s.code)
                    }
                }
            });

            return updatedSupplies.map(supply => createSupplyEntityFromPrisma(supply));
        } catch (error) {
            console.error('Error updating supplies:', error);
            return null;
        }
    }
} 