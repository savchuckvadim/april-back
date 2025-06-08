import { Injectable } from "@nestjs/common";
import { PrismaService } from "src/core/prisma";
import { FieldRepository } from "./field.repository";
import { FieldEntity } from "./field.entity";
import { createFieldEntityFromPrisma } from "./lib/field-entity.util";

@Injectable()
export class FieldPrismaRepository implements FieldRepository {
    constructor(
        private readonly prisma: PrismaService,
    ) { }

    async findById(id: number): Promise<FieldEntity | null> {
        const result = await this.prisma.fields.findUnique({
            where: { id: BigInt(id) },
            include: {
                template_field: {
                    include: {
                        templates: true
                    }
                }
            }
        });

        if (!result) return null;

        return createFieldEntityFromPrisma(result);
    }

    async findByCode(code: string): Promise<FieldEntity | null> {
        const result = await this.prisma.fields.findFirst({
            where: { code },
            include: {
                template_field: {
                    include: {
                        templates: true
                    }
                }
            }
        });

        if (!result) return null;

        return createFieldEntityFromPrisma(result);
    }

    async findMany(): Promise<FieldEntity[] | null> {
        const result = await this.prisma.fields.findMany();
        if (!result) return null;

        return result.map(field => createFieldEntityFromPrisma(field));
    }

    async findManyWithRelations(): Promise<FieldEntity[] | null> {
        const result = await this.prisma.fields.findMany({
            include: {
                template_field: {
                    include: {
                        templates: true
                    }
                }
            }
        });

        if (!result) return null;

        return result.map(field => createFieldEntityFromPrisma(field));
    }
} 