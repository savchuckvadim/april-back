import { Injectable } from "@nestjs/common";
import { PrismaService } from "src/core/prisma";
import { TemplateBaseRepository } from "./template-base.repository";
import { TemplateBaseEntity, TemplateBasePortalEntity } from "./template-base.entity";
import { createTemplateBaseEntityFromPrisma } from "./lib/template-base-entity.util";
import { createTemplateBasePortalEntityFromPrisma } from "./lib/template-base-entity.util";

@Injectable()
export class TemplateBasePrismaRepository implements TemplateBaseRepository {
    constructor(
        private readonly prisma: PrismaService,
    ) { }

    async findById(id: number): Promise<TemplateBaseEntity | null> {
        const result = await this.prisma.templates.findUnique({
            where: { id: BigInt(id) },
            include: {
                template_counter: true,
                template_field: true
            }
        });

        if (!result) return null;

        return createTemplateBaseEntityFromPrisma(result);
    }

    async findByCode(code: string): Promise<TemplateBaseEntity | null> {
        const result = await this.prisma.templates.findFirst({
            where: { code },
            include: {
                template_counter: true,
                template_field: true
            }
        });

        if (!result) return null;

        return createTemplateBaseEntityFromPrisma(result);
    }

    async findMany(): Promise<TemplateBaseEntity[] | null> {
        const result = await this.prisma.templates.findMany();
        if (!result) return null;

        return result.map(template => createTemplateBaseEntityFromPrisma(template));
    }
    async findByDomain(domain: string): Promise<TemplateBasePortalEntity[] | null> {
        const portal = await this.prisma.portals.findFirst({
            where: { domain },
            select: { id: true }
        })
        if (!portal) {
            throw new Error('Portal not found');
        };
        const result = await this.prisma.templates.findMany({
            where: { portalId: portal.id },
            include: {
                template_counter: true,
                template_field: true
            }
        });
        if (!result) return null;
        const fields = await this.prisma.fields.findMany({
            where: {
                template_field: {
                    some: { template_id: { in: result.map(template => template.id) } }
                }
            },
           
        });
        return result.map(template => createTemplateBasePortalEntityFromPrisma(template, fields));
    }
    async findManyWithRelations(): Promise<TemplateBaseEntity[] | null> {
        const result = await this.prisma.templates.findMany({
            include: {
                template_counter: true,
                template_field: true
            }
        });

        if (!result) return null;

        return result.map(template => createTemplateBaseEntityFromPrisma(template));
    }
} 