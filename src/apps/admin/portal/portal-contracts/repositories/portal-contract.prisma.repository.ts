import { Injectable } from '@nestjs/common';
import { portal_contracts } from 'generated/prisma';
import { PrismaService } from '@/core/prisma';
import { PortalContractRepository } from './portal-contract.repository';

@Injectable()
export class PortalContractPrismaRepository implements PortalContractRepository {
    constructor(private readonly prisma: PrismaService) {}

    async create(portalContract: Partial<portal_contracts>): Promise<portal_contracts | null> {
        const result = await this.prisma.portal_contracts.create({
            data: {
                portal_id: BigInt(portalContract.portal_id!),
                contract_id: BigInt(portalContract.contract_id!),
                portal_measure_id: BigInt(portalContract.portal_measure_id!),
                bitrixfield_item_id: BigInt(portalContract.bitrixfield_item_id!),
                title: portalContract.title!,
                template: portalContract.template,
                order: portalContract.order,
                productName: portalContract.productName,
                description: portalContract.description,
            },
            include: {
                portals: true,
                contracts: true,
                portal_measure: true,
                bitrixfield_items: true,
            },
        });
        return result;
    }

    async findById(id: number): Promise<portal_contracts | null> {
        const result = await this.prisma.portal_contracts.findUnique({
            where: { id: BigInt(id) },
            include: {
                portals: true,
                contracts: true,
                portal_measure: true,
                bitrixfield_items: true,
            },
        });
        return result;
    }

    async findMany(): Promise<portal_contracts[] | null> {
        const result = await this.prisma.portal_contracts.findMany({
            include: {
                portals: true,
                contracts: true,
                portal_measure: true,
                bitrixfield_items: true,
            },
        });
        return result;
    }

    async findByPortalId(portalId: number): Promise<portal_contracts[] | null> {
        const result = await this.prisma.portal_contracts.findMany({
            where: { portal_id: BigInt(portalId) },
            include: {
                portals: true,
                contracts: true,
                portal_measure: true,
                bitrixfield_items: true,
            },
        });
        return result;
    }

    async findByContractId(contractId: number): Promise<portal_contracts[] | null> {
        const result = await this.prisma.portal_contracts.findMany({
            where: { contract_id: BigInt(contractId) },
            include: {
                portals: true,
                contracts: true,
                portal_measure: true,
                bitrixfield_items: true,
            },
        });
        return result;
    }

    async update(id: number, portalContract: Partial<portal_contracts>): Promise<portal_contracts | null> {
        const updateData: any = {};
        if (portalContract.portal_id !== undefined) updateData.portal_id = BigInt(portalContract.portal_id);
        if (portalContract.contract_id !== undefined) updateData.contract_id = BigInt(portalContract.contract_id);
        if (portalContract.portal_measure_id !== undefined) updateData.portal_measure_id = BigInt(portalContract.portal_measure_id);
        if (portalContract.bitrixfield_item_id !== undefined) updateData.bitrixfield_item_id = BigInt(portalContract.bitrixfield_item_id);
        if (portalContract.title !== undefined) updateData.title = portalContract.title;
        if (portalContract.template !== undefined) updateData.template = portalContract.template;
        if (portalContract.order !== undefined) updateData.order = portalContract.order;
        if (portalContract.productName !== undefined) updateData.productName = portalContract.productName;
        if (portalContract.description !== undefined) updateData.description = portalContract.description;

        const result = await this.prisma.portal_contracts.update({
            where: { id: BigInt(id) },
            data: updateData,
            include: {
                portals: true,
                contracts: true,
                portal_measure: true,
                bitrixfield_items: true,
            },
        });
        return result;
    }

    async delete(id: number): Promise<boolean> {
        const result = await this.prisma.portal_contracts.delete({
            where: { id: BigInt(id) },
        });
        return result ? true : false;
    }
}

