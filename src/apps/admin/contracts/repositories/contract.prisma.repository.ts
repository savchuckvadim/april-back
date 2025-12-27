import { Injectable } from '@nestjs/common';
import { contracts } from 'generated/prisma';
import { PrismaService } from '@/core/prisma';
import { ContractRepository } from './contract.repository';

@Injectable()
export class ContractPrismaRepository implements ContractRepository {
    constructor(private readonly prisma: PrismaService) {}

    async create(contract: Partial<contracts>): Promise<contracts | null> {
        const result = await this.prisma.contracts.create({
            data: {
                name: contract.name!,
                number: contract.number!,
                title: contract.title!,
                code: contract.code!,
                type: contract.type!,
                withPrepayment: contract.withPrepayment!,
                template: contract.template,
                order: contract.order,
                coefficient: contract.coefficient ?? 1,
                prepayment: contract.prepayment ?? 1,
                discount: contract.discount ?? 1.0,
                productName: contract.productName,
                product: contract.product,
                service: contract.service,
                description: contract.description,
                comment: contract.comment,
                comment1: contract.comment1,
                comment2: contract.comment2,
            },
        });
        return result;
    }

    async findById(id: number): Promise<contracts | null> {
        const result = await this.prisma.contracts.findUnique({
            where: { id: BigInt(id) },
        });
        return result;
    }

    async findMany(): Promise<contracts[] | null> {
        const result = await this.prisma.contracts.findMany();
        return result;
    }

    async update(id: number, contract: Partial<contracts>): Promise<contracts | null> {
        const updateData: any = {};
        if (contract.name !== undefined) updateData.name = contract.name;
        if (contract.number !== undefined) updateData.number = contract.number;
        if (contract.title !== undefined) updateData.title = contract.title;
        if (contract.code !== undefined) updateData.code = contract.code;
        if (contract.type !== undefined) updateData.type = contract.type;
        if (contract.withPrepayment !== undefined) updateData.withPrepayment = contract.withPrepayment;
        if (contract.template !== undefined) updateData.template = contract.template;
        if (contract.order !== undefined) updateData.order = contract.order;
        if (contract.coefficient !== undefined) updateData.coefficient = contract.coefficient;
        if (contract.prepayment !== undefined) updateData.prepayment = contract.prepayment;
        if (contract.discount !== undefined) updateData.discount = contract.discount;
        if (contract.productName !== undefined) updateData.productName = contract.productName;
        if (contract.product !== undefined) updateData.product = contract.product;
        if (contract.service !== undefined) updateData.service = contract.service;
        if (contract.description !== undefined) updateData.description = contract.description;
        if (contract.comment !== undefined) updateData.comment = contract.comment;
        if (contract.comment1 !== undefined) updateData.comment1 = contract.comment1;
        if (contract.comment2 !== undefined) updateData.comment2 = contract.comment2;

        const result = await this.prisma.contracts.update({
            where: { id: BigInt(id) },
            data: updateData,
        });
        return result;
    }

    async delete(id: number): Promise<boolean> {
        const result = await this.prisma.contracts.delete({
            where: { id: BigInt(id) },
        });
        return result ? true : false;
    }
}

