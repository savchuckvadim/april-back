import { Injectable } from "@nestjs/common";
import { PbxFieldRepository } from "./pbx-field.repositry";
import { PrismaService } from "@/core/prisma";
import { PbxField, PbxFieldEntity, PbxFieldEntityType, PbxFieldItem, PbxFieldItemEntity, PbxFieldWithItems } from "./pbx-field.entity";
import { FieldDataHelper } from "./lib/field-data.helper";

@Injectable()
export class PbxFieldPrismaRepository implements PbxFieldRepository {
    constructor(private readonly prisma: PrismaService) { }

    async findByEntityId(entity: PbxFieldEntityType, entityId: bigint): Promise<PbxFieldEntity[]> {
        const fields = await this.prisma.bitrixfields.findMany({
            where: {
                entity_id: entityId,
                entity_type: entity,
            },
            include: {
                bitrixfield_items: true,
            }
        });
        return fields.map(field => FieldDataHelper.getFieldEntity(field));
    }

    async addField(field: PbxFieldEntity): Promise<PbxField> {
        const newField = await this.prisma.bitrixfields.create({
            data: FieldDataHelper.createFieldData(field),
        });
        if (field.items.length > 0) {
            const data = FieldDataHelper.createFieldItemsData(newField.id.toString(), field.items);

            await this.prisma.bitrixfield_items.createMany({
                data,
            });
        }
        return newField;
    }

    async addFields(fields: PbxFieldEntity[]): Promise<PbxField[]> {
        return await this.prisma.$transaction(async (tx) => {
            const createdFields: PbxField[] = [];
            
            for (const field of fields) {
                const newField = await tx.bitrixfields.create({
                    data: FieldDataHelper.createFieldData(field),
                    include: {
                        bitrixfield_items: true,
                    }
                });
                
                if (field.items.length > 0) {
                    const itemsData = FieldDataHelper.createFieldItemsData(newField.id.toString(), field.items);
                    await tx.bitrixfield_items.createMany({
                        data: itemsData,
                    });
                    
                    // Получаем созданные items
                    const createdItems = await tx.bitrixfield_items.findMany({
                        where: { bitrixfield_id: newField.id },
                    });
                    
                    // Обновляем поле с items
                    const fieldWithItems = await tx.bitrixfields.findUnique({
                        where: { id: newField.id },
                        include: {
                            bitrixfield_items: true,
                        }
                    });
                    
                    createdFields.push(fieldWithItems!);
                } else {
                    createdFields.push(newField);
                }
            }
            
            return createdFields;
        });
    }

    async addFieldItem(fieldId: string, fieldItem: PbxFieldItemEntity): Promise<PbxFieldItem> {
        const newFieldItem = await this.prisma.bitrixfield_items.create({
            data: FieldDataHelper.createFieldItemData(fieldId, fieldItem),
        });
        return newFieldItem;
    }

    async updateField(fieldId: string, field: Partial<PbxFieldEntity>): Promise<PbxField> {
        const updatedField = await this.prisma.bitrixfields.update({
            where: { id: BigInt(fieldId) },
            data: FieldDataHelper.createFieldUpdateData(field),
        });
        if (field.items && field.items.length > 0) {
            const data = FieldDataHelper.createFieldItemsData(fieldId, field.items);

            await this.prisma.bitrixfield_items.createMany({
                data,
            });
        }
        return updatedField;
    }

    async deleteField(fieldId: string): Promise<void> {
        await this.prisma.bitrixfields.delete({
            where: { id: BigInt(fieldId) },
        });
    }

    async deleteFieldItem(fieldItemId: string): Promise<void> {
        await this.prisma.bitrixfield_items.delete({
            where: { id: BigInt(fieldItemId) },
        });
    }

    async upsertFields(fields: PbxFieldEntity[]): Promise<PbxField[]> {
        return await this.prisma.$transaction(async (tx) => {
            const resultFields: PbxField[] = [];
            
            for (const field of fields) {
                // Проверяем существование field по code, entity_id и entity_type
                const existingField = await tx.bitrixfields.findFirst({
                    where: {
                        code: field.code,
                        entity_id: field.entity_id,
                        entity_type: field.entity_type,
                    },
                    include: {
                        bitrixfield_items: true,
                    }
                });
                
                let currentField: PbxField;
                
                if (existingField) {
                    // Обновляем существующий field
                    currentField = await tx.bitrixfields.update({
                        where: { id: existingField.id },
                        data: FieldDataHelper.createFieldUpdateData(field),
                        include: {
                            bitrixfield_items: true,
                        }
                    });
                } else {
                    // Создаем новый field
                    currentField = await tx.bitrixfields.create({
                        data: FieldDataHelper.createFieldData(field),
                        include: {
                            bitrixfield_items: true,
                        }
                    });
                }
                
                // Обрабатываем items
                if (field.items.length > 0) {
                    // Получаем существующие items для этого field
                    const existingItems = await tx.bitrixfield_items.findMany({
                        where: { bitrixfield_id: currentField.id },
                    });
                    
                    // Создаем Map для быстрого поиска существующих items по code
                    const existingItemsMap = new Map(
                        existingItems.map(item => [item.code, item])
                    );
                    
                    // Обрабатываем каждый item
                    for (const item of field.items) {
                        const existingItem = existingItemsMap.get(item.code);
                        
                        if (existingItem) {
                            // Обновляем существующий item
                            await tx.bitrixfield_items.update({
                                where: { id: existingItem.id },
                                data: {
                                    name: item.name,
                                    title: item.title,
                                    code: item.code,
                                    bitrixId: item.bitrixId,
                                }
                            });
                        } else {
                            // Создаем новый item
                            await tx.bitrixfield_items.create({
                                data: FieldDataHelper.createFieldItemData(currentField.id.toString(), item),
                            });
                        }
                    }
                    
                    // Получаем обновленный field с items
                    const fieldWithItems = await tx.bitrixfields.findUnique({
                        where: { id: currentField.id },
                        include: {
                            bitrixfield_items: true,
                        }
                    });
                    
                    resultFields.push(fieldWithItems!);
                } else {
                    resultFields.push(currentField);
                }
            }
            
            return resultFields;
        });
    }

    async deleteFieldsByEntityId(entity: PbxFieldEntityType, entityId: bigint): Promise<void> {
        await this.prisma.$transaction(async (tx) => {
            // Сначала находим все поля для данной entity
            const fields = await tx.bitrixfields.findMany({
                where: { 
                    entity_id: entityId, 
                    entity_type: entity 
                },
                select: { id: true }
            });

            if (fields.length > 0) {
                const fieldIds = fields.map(field => field.id);
                
                // Удаляем связанные items
                await tx.bitrixfield_items.deleteMany({
                    where: {
                        bitrixfield_id: {
                            in: fieldIds
                        }
                    }
                });
                
                // Удаляем сами поля
                await tx.bitrixfields.deleteMany({
                    where: { 
                        entity_id: entityId, 
                        entity_type: entity 
                    }
                });
            }
        });
    }

}       