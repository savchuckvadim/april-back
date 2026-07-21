import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/core/prisma';
import { PBXService } from '@lib/pbx/pbx.service';
import { EUserFieldType } from '@/modules/bitrix';
import { SmartService } from './smart.service';
import {
    SmartBitrixStateDto,
    SmartCategoryDto,
    SmartDetailsResponseDto,
    SmartFieldDto,
} from '../dto/smart-details-response.dto';

/**
 * Детали смарта для раскрывашки в админке: строка из таблицы smarts +
 * ЖИВОЕ состояние в Bitrix (тип, воронки со стадиями, UF-поля с enum).
 * Bitrix-часть fail-open: недоступный портал не ломает список — в ответе
 * bitrix=null и текст ошибки.
 */
@Injectable()
export class SmartDetailsService {
    private readonly logger = new Logger(SmartDetailsService.name);

    constructor(
        private readonly smartService: SmartService,
        private readonly prisma: PrismaService,
        private readonly pbxService: PBXService,
    ) {}

    async getDetails(id: number): Promise<SmartDetailsResponseDto> {
        const smart = await this.smartService.findById(id);

        const portal = await this.prisma.portal.findUnique({
            where: { id: BigInt(smart.portal_id) },
            select: { domain: true },
        });
        if (!portal?.domain) {
            throw new NotFoundException(
                `Портал ${smart.portal_id} не найден для смарта ${id}`,
            );
        }

        try {
            const bitrix = await this.loadBitrixState(
                portal.domain,
                smart.entityTypeId,
            );
            return { smart, domain: portal.domain, bitrix };
        } catch (error) {
            this.logger.warn(
                `Живое состояние смарта ${id} (${portal.domain}) не получено: ${(error as Error).message}`,
            );
            return {
                smart,
                domain: portal.domain,
                bitrix: null,
                error: this.humanizeError((error as Error).message),
            };
        }
    }

    /**
     * userfieldconfig.* доступен только администраторам CRM: без прав Bitrix
     * отвечает «Вы не можете просматривать настройки пользовательских полей».
     * Превращаем в понятную подсказку, что чинить (права REST-ключа портала).
     */
    private humanizeError(message: string): string {
        if (message.includes('не можете просматривать настройки')) {
            return (
                'У REST-ключа портала нет прав администратора CRM ' +
                '(userfieldconfig): пересоздайте вебхук от имени администратора.'
            );
        }
        return message;
    }

    private async loadBitrixState(
        domain: string,
        entityTypeId: number,
    ): Promise<SmartBitrixStateDto> {
        const { bitrix } = await this.pbxService.init(domain);

        const full = await bitrix.smartType.getSmartFull({ entityTypeId });
        const fields = await bitrix.userFieldConfig.getAllWithItems('crm', {
            entityId: `CRM_${entityTypeId}`,
        });

        return {
            entityTypeId,
            code: String(full.code ?? ''),
            title: String(full.title ?? ''),
            categories: (full.categories ?? []).map(category =>
                this.mapCategory(
                    category as unknown as Record<string, unknown>,
                ),
            ),
            fields: fields.map(field => {
                const dto: SmartFieldDto = {
                    fieldName: String(field.fieldName ?? ''),
                    title:
                        field.editFormLabel?.ru ??
                        String(field.fieldName ?? ''),
                    type: String(field.userTypeId ?? ''),
                    multiple: field.multiple === 'Y',
                    xmlId: field.xmlId ?? undefined,
                };
                if (
                    field.userTypeId === EUserFieldType.ENUMERATION &&
                    field.enum?.length
                ) {
                    dto.items = field.enum.map(item => ({
                        id: Number(item.id),
                        value: String(item.value ?? ''),
                        xmlId: item.xmlId ?? undefined,
                    }));
                }
                return dto;
            }),
        };
    }

    /** Категории/стадии приходят слабо типизированными — маппим защитно. */
    private mapCategory(category: Record<string, unknown>): SmartCategoryDto {
        const rawStages = Array.isArray(category.stages)
            ? (category.stages as Record<string, unknown>[])
            : [];
        return {
            id: Number(category.id),
            name: this.toStr(category.name),
            stages: rawStages.map(stage => ({
                statusId: this.toStr(stage.STATUS_ID ?? stage.statusId),
                name: this.toStr(stage.NAME ?? stage.name),
            })),
        };
    }

    /** Безопасное приведение неизвестного значения к строке. */
    private toStr(value: unknown): string {
        if (typeof value === 'string') return value;
        if (typeof value === 'number') return String(value);
        return '';
    }
}
