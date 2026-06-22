import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/core/prisma';
import {
    CreateTemplateBaseData,
    TemplateBaseRepository,
    TemplateCounterPivotData,
    UpdateTemplateBaseData,
} from './template-base.repository';
import {
    TemplateBaseEntity,
    TemplateBasePortalEntity,
} from './template-base.entity';
import { createTemplateBaseEntityFromPrisma } from './lib/template-base-entity.util';
import { createTemplateBasePortalEntityFromPrisma } from './lib/template-base-entity.util';

@Injectable()
export class TemplateBasePrismaRepository implements TemplateBaseRepository {
    constructor(private readonly prisma: PrismaService) {}

    async findById(id: number): Promise<TemplateBaseEntity | null> {
        const result = await this.prisma.template.findUnique({
            where: { id: BigInt(id) },
            include: {
                template_counter: { include: { counters: true } },
                template_field: { include: { fields: true } },
            },
        });

        if (!result) return null;

        return createTemplateBaseEntityFromPrisma(result);
    }

    async findByCode(code: string): Promise<TemplateBaseEntity | null> {
        const result = await this.prisma.template.findFirst({
            where: { code },
            include: {
                template_counter: true,
                template_field: true,
            },
        });

        if (!result) return null;

        return createTemplateBaseEntityFromPrisma(result);
    }

    async findMany(): Promise<TemplateBaseEntity[] | null> {
        const result = await this.prisma.template.findMany();
        if (!result) return null;

        return result.map(template =>
            createTemplateBaseEntityFromPrisma(template),
        );
    }
    async findByDomain(
        domain: string,
    ): Promise<TemplateBasePortalEntity[] | null> {
        const portal = await this.prisma.portal.findFirst({
            where: { domain },
            select: { id: true },
        });
        if (!portal) {
            throw new Error('Portal not found');
        }
        const result = await this.prisma.template.findMany({
            where: { portalId: portal.id },
            include: {
                template_counter: true,
            },
        });
        if (!result) return null;
        const fields = await this.prisma.field.findMany({
            where: {
                template_field: {
                    some: {
                        template_id: {
                            in: result.map(template => template.id),
                        },
                    },
                },
            },
        });
        return result.map(template =>
            createTemplateBasePortalEntityFromPrisma(template, fields),
        );
    }
    async findManyByPortalId(
        portalId: number,
    ): Promise<TemplateBaseEntity[] | null> {
        const result = await this.prisma.template.findMany({
            where: { portalId: BigInt(portalId) },
            include: {
                template_counter: { include: { counters: true } },
                template_field: { include: { fields: true } },
            },
        });

        return result.map(template =>
            createTemplateBaseEntityFromPrisma(template),
        );
    }

    async findManyWithRelations(): Promise<TemplateBaseEntity[] | null> {
        const result = await this.prisma.template.findMany({
            include: {
                template_counter: { include: { counters: true } },
                template_field: { include: { fields: true } },
            },
        });

        if (!result) return null;

        return result.map(template =>
            createTemplateBaseEntityFromPrisma(template),
        );
    }

    async create(data: CreateTemplateBaseData): Promise<TemplateBaseEntity> {
        const result = await this.prisma.template.create({
            data: {
                name: data.name,
                code: data.code,
                type: data.type,
                link: data.link ?? null,
                portalId: BigInt(data.portalId),
            },
        });

        return createTemplateBaseEntityFromPrisma(result);
    }

    async update(
        id: number,
        data: UpdateTemplateBaseData,
    ): Promise<TemplateBaseEntity> {
        const result = await this.prisma.template.update({
            where: { id: BigInt(id) },
            data: {
                ...(data.name !== undefined && { name: data.name }),
                ...(data.code !== undefined && { code: data.code }),
                ...(data.type !== undefined && { type: data.type }),
                ...(data.link !== undefined && { link: data.link }),
                ...(data.portalId !== undefined && {
                    portalId: BigInt(data.portalId),
                }),
            },
        });

        return createTemplateBaseEntityFromPrisma(result);
    }

    async delete(id: number): Promise<void> {
        await this.prisma.template.delete({ where: { id: BigInt(id) } });
    }

    async attachField(templateId: number, fieldId: number): Promise<void> {
        const existing = await this.prisma.templateField.findFirst({
            where: {
                template_id: BigInt(templateId),
                field_id: BigInt(fieldId),
            },
            select: { id: true },
        });
        if (existing) return;

        await this.prisma.templateField.create({
            data: {
                template_id: BigInt(templateId),
                field_id: BigInt(fieldId),
            },
        });
    }

    async detachField(templateId: number, fieldId: number): Promise<void> {
        await this.prisma.templateField.deleteMany({
            where: {
                template_id: BigInt(templateId),
                field_id: BigInt(fieldId),
            },
        });
    }

    async attachCounter(
        templateId: number,
        counterId: number,
        data: TemplateCounterPivotData,
    ): Promise<void> {
        const pivot = this.buildCounterPivot(data);
        await this.prisma.template_counter.upsert({
            where: {
                template_id_counter_id: {
                    template_id: BigInt(templateId),
                    counter_id: BigInt(counterId),
                },
            },
            create: {
                template_id: BigInt(templateId),
                counter_id: BigInt(counterId),
                ...pivot,
            },
            update: pivot,
        });
    }

    async updateCounter(
        templateId: number,
        counterId: number,
        data: TemplateCounterPivotData,
    ): Promise<void> {
        await this.prisma.template_counter.update({
            where: {
                template_id_counter_id: {
                    template_id: BigInt(templateId),
                    counter_id: BigInt(counterId),
                },
            },
            data: this.buildCounterPivot(data),
        });
    }

    async detachCounter(templateId: number, counterId: number): Promise<void> {
        await this.prisma.template_counter.deleteMany({
            where: {
                template_id: BigInt(templateId),
                counter_id: BigInt(counterId),
            },
        });
    }

    /** Только переданные pivot-поля (для частичного create/update). */
    private buildCounterPivot(data: TemplateCounterPivotData) {
        return {
            ...(data.value !== undefined && { value: data.value }),
            ...(data.prefix !== undefined && { prefix: data.prefix }),
            ...(data.day !== undefined && { day: data.day }),
            ...(data.year !== undefined && { year: data.year }),
            ...(data.month !== undefined && { month: data.month }),
            ...(data.count !== undefined && { count: data.count }),
            ...(data.size !== undefined && { size: data.size }),
        };
    }
}
