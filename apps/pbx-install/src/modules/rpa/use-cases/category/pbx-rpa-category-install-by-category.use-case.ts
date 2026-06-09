import { Injectable, NotFoundException } from '@nestjs/common';
import { PBXService } from '@/modules/pbx';
import { InstallRpaCategoryDto } from '../../dto/install-rpa-category.dto';
import {
    InstallRpaCategoriesResult,
    InstallRpaCategoriesService,
} from '../../services/rpa-categories/install-rpa-categories.service';
import { RpaContextResolver } from '../../services/rpa-context.resolver';
import { RpaCategory } from '../../type/parse.type';
import { RpaCategoryDto } from '../../dto/install-rpa-category.dto';

/**
 * Установка воронки и стадий RPA по переданному массиву категорий (POST-вариант).
 * Не читает Excel — категории приходят в теле запроса.
 */
@Injectable()
export class PbxRpaCategoryInstallByCategoryUseCase {
    constructor(
        private readonly pbxService: PBXService,
        private readonly installService: InstallRpaCategoriesService,
        private readonly contextResolver: RpaContextResolver,
    ) {}

    async installRpaCategories(
        dto: InstallRpaCategoryDto,
    ): Promise<InstallRpaCategoriesResult | { message: string }> {
        const { bitrix } = await this.pbxService.init(dto.domain);
        const categoryDto = dto.categories[0];
        if (!categoryDto) {
            throw new NotFoundException('No RPA category provided');
        }
        const ctx = await this.contextResolver.resolve({
            domain: dto.domain,
            rpaName: dto.rpaName,
        });
        return this.installService.installCategory({
            bitrix,
            rpaTypeId: ctx.rpaTypeId,
            rpaDbId: ctx.rpaDbId,
            category: this.toRpaCategory(categoryDto),
        });
    }

    /** Нормализует DTO к парс-типу (заполняет опциональные поля дефолтами). */
    private toRpaCategory(dto: RpaCategoryDto): RpaCategory {
        return {
            id: dto.id,
            entityTypeId: dto.entityTypeId,
            type: dto.type,
            group: dto.group,
            name: dto.name,
            title: dto.title,
            bitrixId: dto.bitrixId,
            bitrixCamelId: dto.bitrixCamelId ?? '',
            code: dto.code,
            isActive: dto.isActive,
            isNeedUpdate: dto.isNeedUpdate,
            order: dto.order,
            isDefault: dto.isDefault ?? false,
            stages: dto.stages.map(s => ({
                id: '',
                name: s.name,
                title: s.title,
                bitrixId: s.bitrixId,
                color: s.color,
                code: s.code,
                semantic: s.semantic ?? '',
                isActive: s.isActive,
                isNeedUpdate: s.isNeedUpdate,
                order: s.order,
                isFirst: s.isFirst ?? false,
                isSuccess: s.isSuccess ?? false,
                isFail: s.isFail ?? false,
            })),
        };
    }
}
