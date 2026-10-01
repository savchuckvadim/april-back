import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { getErrorString } from '@/shared/lib/utils/get-error-string.util';
import {
    BxDepartmentStructureService,
    BxSuperUserService,
} from '@lib/bx-department';
import {
    BxCurrentUserDto,
    EBxVisibilityLevel,
} from '@lib/bx-department/dto/bx-department-structure.dto';
import { EDepartamentGroup } from '@lib/portal-lib/portal/interfaces/portal.interface';

/** Текст отказа для человека — без кодов и «админки» (правила текстов UI). */
export const HEAD_ONLY_MESSAGE =
    'Присоединять и объединять сделки клиента может только руководитель ' +
    'отдела продаж. Если вы руководитель, а видите это сообщение, — ' +
    'попросите разработчика добавить вас в настройки «Отдел продаж».';

/**
 * Руководитель для действий с дублями: суперпользователь вендора, глава
 * любого уровня по структуре (группа, ОП, «Главы» над ОП) или видимость
 * шире своей из настроек «Отдел продаж» (так отмечают руководителя, не
 * отмеченного в структуре Битрикса).
 */
export const isDuplicatesManager = (
    user: Pick<
        BxCurrentUserDto,
        'isHead' | 'headOf' | 'visibility' | 'isSuperUser'
    >,
): boolean =>
    user.isSuperUser ||
    user.isHead ||
    user.headOf !== null ||
    user.visibility !== EBxVisibilityLevel.own;

/**
 * ПРОВЕРКА ПРАВ НА БЭКЕ для присоединения и объединения сделок клиента
 * (решение владельца 01.10.2026: кнопки — только руководителю). Фронт
 * прячет кнопки, но ручки открыты — без проверки здесь их мог бы вызвать
 * любой сотрудник.
 *
 * Правило — {@link isDuplicatesManager} поверх снимка структуры отдела
 * продаж (тот же, что у режима руководителя). Сбой структуры — «нет»
 * (fail closed), но суперпользователь проходит и тогда: его таблица не
 * зависит от Битрикса.
 */
@Injectable()
export class HeadAccessService {
    private readonly logger = new Logger(HeadAccessService.name);

    constructor(
        private readonly structure: BxDepartmentStructureService,
        private readonly superUsers: BxSuperUserService,
    ) {}

    async canManageDuplicates(
        domain: string,
        userId: number | null | undefined,
    ): Promise<boolean> {
        if (!userId || userId <= 0) return false;
        try {
            if (await this.superUsers.isSuperUser(domain, userId)) return true;
            const { currentUser } = await this.structure.getStructure(
                domain,
                EDepartamentGroup.sales,
                userId,
            );
            return isDuplicatesManager(currentUser);
        } catch (error) {
            this.logger.warn(
                `[head-access] ${domain}: права ${userId} не проверены — отказ: ${getErrorString(error)}`,
            );
            return false;
        }
    }

    /** 403 с понятным текстом, если пользователь не руководитель. */
    async assertCanManageDuplicates(
        domain: string,
        userId: number | null | undefined,
    ): Promise<void> {
        if (!(await this.canManageDuplicates(domain, userId))) {
            throw new ForbiddenException(HEAD_ONLY_MESSAGE);
        }
    }
}
