import { Injectable } from '@nestjs/common';
import { Portal } from 'generated/prisma';
import { PrismaService } from '@/core/prisma';
import { AdminPortalRepository } from './portal.repository';
import { AdminPortalWithRelations } from '../type/admin-portal.type';

@Injectable()
export class AdminPortalPrismaRepository implements AdminPortalRepository {
    constructor(private readonly prisma: PrismaService) { }

    async create(portal: Partial<Portal>): Promise<Portal | null> {
        const result = await this.prisma.portal.create({
            data: {
                domain: portal.domain,
                key: portal.key,
                C_REST_CLIENT_ID: portal.C_REST_CLIENT_ID,
                C_REST_CLIENT_SECRET: portal.C_REST_CLIENT_SECRET,
                C_REST_WEB_HOOK_URL: portal.C_REST_WEB_HOOK_URL,
                number: portal.number ?? 0,
                client_id: portal.client_id ? BigInt(portal.client_id) : null,
            },
        });
        return result;
    }

    async findById(id: number): Promise<AdminPortalWithRelations | null> {
        const result = await this.prisma.portal.findUnique({
            where: { id: BigInt(id) },
            include: {
                clients: true,
                agents: true,
                templates: true,

                smarts: true,
                timezones: true,
                portal_contracts: true,
                portal_region: true,
                bitrix_apps: true,
                bitrixlists: true,
            },
        }) as Portal | null;
        if (!result) return null;
        const portal_templates = await this.prisma.template.findMany({
            where: { portalId: result.id },
        });

        const bitrixlists = await this.prisma.bitrixlists.findMany({
            where: { portal_id: BigInt(result.id) },
        });
        const bitrix_apps = await this.prisma.bitrix_apps.findMany({
            where: { portal_id: BigInt(result.id) },
        });

        const btx_companies = await this.prisma.btx_companies.findMany({
            where: { portal_id: BigInt(result.id) },
        });
        const btx_contacts = await this.prisma.btx_contacts.findMany({
            where: { portal_id: BigInt(result.id) },
        });
        const btx_deals = await this.prisma.btx_deals.findMany({
            where: { portal_id: BigInt(result.id) },
        });
        const btx_leads = await this.prisma.btx_leads.findMany({
            where: { portal_id: BigInt(result.id) },
        });
        const btx_rpas = await this.prisma.btx_rpas.findMany({
            where: { portal_id: BigInt(result.id) },
        });
        const callings = await this.prisma.callings.findMany({
            where: { portal_id: BigInt(result.id) },
        });
        const departaments = await this.prisma.departaments.findMany({
            where: { portal_id: BigInt(result.id) },
        });
        const offerTemplatePortal = await this.prisma.offerTemplatePortal.findMany({
            where: { portal_id: BigInt(result.id) },
        });
        const offer_zakupki_settings = await this.prisma.offer_zakupki_settings.findMany({
            where: { portal_id: BigInt(result.id) },
        });
        const portal_contracts = await this.prisma.portal_contracts.findMany({
            where: { portal_id: BigInt(result.id) },
        });
        const portal_region = await this.prisma.portal_region.findMany({
            where: { portal_id: BigInt(result.id) },
        });
        const portal_measures = await this.prisma.portal_measure.findMany({
            where: { portal_id: BigInt(result.id) },
        });
        const portal_smarts = await this.prisma.smarts.findMany({
            where: { portal_id: BigInt(result.id) },
        });
        const portal_timezones = await this.prisma.timezones.findMany({
            where: { portal_id: BigInt(result.id) },
        });
        const bxDocumentDeal = await this.prisma.bxDocumentDeal.findMany({
            where: { portalId: BigInt(result.id) },
        });
        const deals = await this.prisma.deals.findMany({
            where: { portalId: BigInt(result.id) },
        });
        const ais = await this.prisma.ai.findMany({
            where: { portal_id: BigInt(result.id) },
        });
        const agents =  await this.prisma.agents.findMany({
            where: { portalId: BigInt(result.id) },
        });
        const bx_rqs = await this.prisma.bx_rqs.findMany({
            where: { portal_id: BigInt(result.id) },
        });
        const transcriptions = await this.prisma.transcription.findMany({
            where: { portal_id: String(result.id) },
        });
        const fullResult = {
            ...result,
           portal_templates,
           bitrixlists,
           bitrix_apps,
           btx_companies,
           btx_contacts,
           btx_deals,
           btx_leads,
           btx_rpas,
           callings,
           departaments,
           offerTemplatePortal,
           offer_zakupki_settings,
           portal_contracts,
           portal_region,
           portal_measures,
           portal_smarts,
           portal_timezones,
           bxDocumentDeal,
           deals,
           ais,
           agents,
           bx_rqs,
           transcriptions,
        } as AdminPortalWithRelations;
        return result;
    }

    async findMany(): Promise<Portal[] | null> {
        const result = await this.prisma.portal.findMany({
            include: {
                clients: true,
            },
        });
        return result;
    }

    async findByDomain(domain: string): Promise<Portal | null> {
        const result = await this.prisma.portal.findFirst({
            where: { domain: domain },
            include: {
                clients: true,
            },
        });
        return result;
    }

    async findByClientId(clientId: number): Promise<Portal[] | null> {
        const result = await this.prisma.portal.findMany({
            where: { client_id: BigInt(clientId) },
            include: {
                clients: true,
            },
        });
        return result;
    }

    async update(id: number, portal: Partial<Portal>): Promise<Portal | null> {
        const updateData: any = {};
        if (portal.domain !== undefined) updateData.domain = portal.domain;
        if (portal.key !== undefined) updateData.key = portal.key;
        if (portal.C_REST_CLIENT_ID !== undefined) updateData.C_REST_CLIENT_ID = portal.C_REST_CLIENT_ID;
        if (portal.C_REST_CLIENT_SECRET !== undefined) updateData.C_REST_CLIENT_SECRET = portal.C_REST_CLIENT_SECRET;
        if (portal.C_REST_WEB_HOOK_URL !== undefined) updateData.C_REST_WEB_HOOK_URL = portal.C_REST_WEB_HOOK_URL;
        if (portal.number !== undefined) updateData.number = portal.number;
        if (portal.client_id !== undefined) updateData.client_id = portal.client_id ? BigInt(portal.client_id) : null;

        const result = await this.prisma.portal.update({
            where: { id: BigInt(id) },
            data: updateData,
        });
        return result;
    }

    async delete(id: number): Promise<boolean> {
        const result = await this.prisma.portal.delete({
            where: { id: BigInt(id) },
        });
        return result ? true : false;
    }
}

