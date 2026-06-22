import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/core/prisma';
import {
    CreateFieldData,
    FieldRepository,
    UpdateFieldData,
} from './field.repository';
import { FieldEntity } from './field.entity';
import { createFieldEntityFromPrisma } from './lib/field-entity.util';

@Injectable()
export class FieldPrismaRepository implements FieldRepository {
    constructor(private readonly prisma: PrismaService) {}

    async findById(id: number): Promise<FieldEntity | null> {
        const result = await this.prisma.field.findUnique({
            where: { id: BigInt(id) },
            include: {
                template_field: {
                    include: {
                        template: true,
                    },
                },
            },
        });

        if (!result) return null;

        return createFieldEntityFromPrisma(result);
    }

    async findByCode(code: string): Promise<FieldEntity | null> {
        const result = await this.prisma.field.findFirst({
            where: { code },
            include: {
                template_field: {
                    include: {
                        template: true,
                    },
                },
            },
        });

        if (!result) return null;

        return createFieldEntityFromPrisma(result);
    }

    async findMany(): Promise<FieldEntity[] | null> {
        const result = await this.prisma.field.findMany();
        if (!result) return null;

        return result.map(field => createFieldEntityFromPrisma(field));
    }

    async findManyWithRelations(): Promise<FieldEntity[] | null> {
        const result = await this.prisma.field.findMany({
            include: {
                template_field: {
                    include: {
                        template: true,
                    },
                },
            },
        });

        if (!result) return null;

        return result.map(field => createFieldEntityFromPrisma(field));
    }

    async create(data: CreateFieldData): Promise<FieldEntity> {
        const result = await this.prisma.field.create({
            data: {
                number: data.number,
                name: data.name,
                code: data.code,
                type: data.type,
                isGeneral: data.isGeneral,
                isDefault: data.isDefault,
                isRequired: data.isRequired,
                value: data.value ?? null,
                description: data.description ?? null,
                bitixId: data.bitixId ?? null,
                bitrixTemplateId: data.bitrixTemplateId ?? null,
                isActive: data.isActive,
                isPlural: data.isPlural,
                isClient: data.isClient ?? null,
            },
        });

        return createFieldEntityFromPrisma(result);
    }

    async update(id: number, data: UpdateFieldData): Promise<FieldEntity> {
        const result = await this.prisma.field.update({
            where: { id: BigInt(id) },
            data: {
                ...(data.number !== undefined && { number: data.number }),
                ...(data.name !== undefined && { name: data.name }),
                ...(data.code !== undefined && { code: data.code }),
                ...(data.type !== undefined && { type: data.type }),
                ...(data.isGeneral !== undefined && {
                    isGeneral: data.isGeneral,
                }),
                ...(data.isDefault !== undefined && {
                    isDefault: data.isDefault,
                }),
                ...(data.isRequired !== undefined && {
                    isRequired: data.isRequired,
                }),
                ...(data.value !== undefined && { value: data.value }),
                ...(data.description !== undefined && {
                    description: data.description,
                }),
                ...(data.bitixId !== undefined && { bitixId: data.bitixId }),
                ...(data.bitrixTemplateId !== undefined && {
                    bitrixTemplateId: data.bitrixTemplateId,
                }),
                ...(data.isActive !== undefined && { isActive: data.isActive }),
                ...(data.isPlural !== undefined && { isPlural: data.isPlural }),
                ...(data.isClient !== undefined && { isClient: data.isClient }),
            },
        });

        return createFieldEntityFromPrisma(result);
    }

    async delete(id: number): Promise<void> {
        await this.prisma.field.delete({ where: { id: BigInt(id) } });
    }
}
