import { PrismaService } from "src/core/prisma";
import { ContractRepository } from "./contract.repository";
import { ContractEntity } from "./contract.entity";
import { PortalContractEntity } from "./portal-contract.entity";

export class ContractPrismaRepository implements ContractRepository {
    constructor(
        private readonly prisma: PrismaService,
    ) { }

    async create(contract: Partial<ContractEntity>): Promise<ContractEntity | null> {
        const result = await this.prisma.contracts.create({
            data: {
                name: contract.name!,
                number: contract.number!,
                title: contract.title!,
                code: contract.code!,
                type: contract.type!,
                template: contract.template,
                order: contract.order,
                coefficient: contract.coefficient!,
                prepayment: contract.prepayment!,
                discount: contract.discount!,
                productName: contract.productName,
                product: contract.product,
                service: contract.service,
                description: contract.description,
                comment: contract.comment,
                comment1: contract.comment1,
                comment2: contract.comment2,
                withPrepayment: contract.withPrepayment!
            },
        });
        return result;
    }

    async update(contract: Partial<ContractEntity>): Promise<ContractEntity | null> {
        return await this.prisma.contracts.update({
            where: { id: contract.id },
            data: contract
        });
    }

    async findById(id: number): Promise<ContractEntity | null> {
        return await this.prisma.contracts.findUnique({
            where: { id }
        });
    }

    async findMany(): Promise<ContractEntity[] | null> {
        return await this.prisma.contracts.findMany();
    }

    async findByPortalId(portalId: number): Promise<PortalContractEntity[] | null> {
        return await this.prisma.portal_contracts.findMany({
            where: { portal_id: portalId },
            include: {
                contracts: true,
                portal_measure: {
                    include: {
                        measures: true
                    }
                }
            }
        });
    }
} 