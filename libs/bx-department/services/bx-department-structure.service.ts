import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EDepartamentGroup } from '@lib/portal-lib/portal/interfaces/portal.interface';
import {
    EnumPortalAppCode,
    parseUserIds,
    PortalAppSettingsService,
} from '@lib/portal-lib/store/app-settings';
import { BxDepartmentService } from './bx-department.service';
import { BxSuperUserService } from './bx-super-user.service';
import {
    EMPTY_FORCED_VISIBILITY,
    ForcedVisibilityLists,
} from '../lib/forced-visibility.util';
import { buildCurrentUser } from '../lib/current-user.util';
import { toStructureData } from '../lib/structure-projection.util';
import { BxDepartmentStructureResponseDto } from '../dto/bx-department-structure.dto';

/**
 * Структура отделов продаж на старом API (department.get) — проекция
 * снимка отдела BxDepartmentService: тот же ключ кэша, те же отделы и
 * сотрудники (подчинённые ⊆ allUsers по построению). В мультирежиме —
 * разбивка по всем ОП портала, плюс роль текущего пользователя и его
 * коллег (суперпользователь вендора, заведённый в админке, получает
 * видимость all). Своего кэша и запросов в Битрикс у сервиса нет.
 */
@Injectable()
export class BxDepartmentStructureService {
    private readonly logger = new Logger(BxDepartmentStructureService.name);

    constructor(
        private readonly departments: BxDepartmentService,
        private readonly appSettings: PortalAppSettingsService,
        private readonly superUsers: BxSuperUserService,
    ) {}

    async getStructure(
        domain: string,
        group: EDepartamentGroup = EDepartamentGroup.sales,
        userId: number,
        resetCache = false,
    ): Promise<BxDepartmentStructureResponseDto> {
        const { department: snapshot } =
            await this.departments.getFullDepartment(domain, group, resetCache);
        if (snapshot.isMultiple && snapshot.generalDepartment.length === 0) {
            throw new NotFoundException(
                `На портале ${domain} не найдено отделов группы ${group} по названию/тэгу`,
            );
        }

        const structure = toStructureData(snapshot);
        const forced = await this.resolveForcedVisibility(domain, group);
        const currentUser = buildCurrentUser(structure, userId, {
            forced,
            isSuperUser: await this.superUsers.isSuperUser(
                domain,
                Number(userId),
            ),
        });
        return {
            isMultiple: snapshot.isMultiple ?? false,
            multipleTag: snapshot.multipleTag ?? null,
            department: structure.department,
            salesDepartments: structure.salesDepartments,
            currentUser,
        } as BxDepartmentStructureResponseDto;
    }

    /**
     * Списки принудительной видимости из настроек портала, блок «Отдел
     * продаж» (visibility_*_user_ids). Только для группы sales; недоступные
     * настройки — пустые списки с warn, роли считаются по структуре.
     */
    private async resolveForcedVisibility(
        domain: string,
        group: EDepartamentGroup,
    ): Promise<ForcedVisibilityLists> {
        if (group !== EDepartamentGroup.sales) return EMPTY_FORCED_VISIBILITY;
        try {
            const settings = await this.appSettings.resolve(
                domain,
                EnumPortalAppCode.sales,
            );
            return {
                group: parseUserIds(settings.visibilityGroupUserIds),
                department: parseUserIds(settings.visibilityDepartmentUserIds),
                all: parseUserIds(settings.visibilityAllUserIds),
            };
        } catch (error) {
            this.logger.warn(
                `[${domain}] настройки видимости («Отдел продаж») недоступны, роли по структуре: ${
                    error instanceof Error ? error.message : String(error)
                }`,
            );
            return EMPTY_FORCED_VISIBILITY;
        }
    }
}
