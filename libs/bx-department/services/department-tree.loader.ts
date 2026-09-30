import { Logger } from '@nestjs/common';
import { DepartmentBitrixService } from '@/modules/bitrix/domain/department/services/department-bitrxi.service';
import { IBXDepartment } from 'src/modules/bitrix/domain/interfaces/bitrix.interface';
import { EDepartamentGroup } from '@lib/portal-lib/portal/interfaces/portal.interface';
import { resolvePatterns } from '../lib/department-match.util';
import { climbParents, selectMultipleTree } from '../lib/department-tree.util';
import { IDepartmentTree } from '../lib/structure-data.types';

/**
 * Загрузка дерева отделов группы из Битрикса (старый API department.get
 * + user.get), руководители не подмешиваются — это делает вызывающий.
 *
 * НЕ @Injectable: создаётся на вызов под инстанс bitrix своего домена —
 * `new DepartmentTreeLoader(new DepartmentBitrixService(bitrix), logger)`,
 * иначе разные порталы делили бы один инстанс (race condition). Batch не
 * используется: только прямые вызовы, чужую очередь команд не трогает.
 */
export class DepartmentTreeLoader {
    constructor(
        private readonly bx: DepartmentBitrixService,
        private readonly logger: Pick<Logger, 'warn'>,
    ) {}

    /**
     * Одиночный режим (как раньше): базовый отдел из конфига портала,
     * его прямые подотделы и родители — теми же запросами в том же порядке.
     */
    async loadSingle(baseId: number | undefined): Promise<IDepartmentTree> {
        const general = await this.bx.getDepartments({ ID: baseId });
        const children = await this.bx.getDepartments({ PARENT: baseId });

        const generalWithUsers = await this.bx.enrichWithUsers(general);
        const childrenWithUsers = await this.bx.enrichWithUsers(children);
        const parents = await climbParents(generalWithUsers, id =>
            this.findParentWithUsers(id),
        );
        return {
            general: generalWithUsers,
            children: childrenWithUsers,
            parents,
        };
    }

    /**
     * Мультирежим: все ОП группы по названию/тэгу со всей структуры
     * портала (один department.get), их подотделы и предки каждого ОП
     * (подъём в памяти). Ничего не нашлось — пустое дерево без исключения.
     */
    async loadMultiple(
        group: EDepartamentGroup,
        multipleTag: string | null,
    ): Promise<IDepartmentTree> {
        const all = await this.bx.getDepartmentsAll();
        const { general, children } = selectMultipleTree(
            all,
            resolvePatterns(group, multipleTag),
        );
        const byId = new Map(all.map(d => [Number(d.ID), d]));
        const climbed = await climbParents(general, id =>
            Promise.resolve(byId.get(id)),
        );
        // порядок department.get — как у прежних cup-отделов структуры
        const climbedIds = new Set(climbed.map(d => Number(d.ID)));
        const parents = all.filter(d => climbedIds.has(Number(d.ID)));

        return {
            general: await this.bx.enrichWithUsers(general),
            children: await this.bx.enrichWithUsers(children),
            parents: await this.parentsWithUsers(parents),
        };
    }

    /**
     * Родитель одиночного режима с сотрудниками — уровень за уровнем, как
     * раньше. Родители — обогащение для ролей, не повод ронять весь отдел:
     * сбой — warn и обрыв подъёма, найденные выше остаются.
     */
    private async findParentWithUsers(
        id: number,
    ): Promise<IBXDepartment | undefined> {
        try {
            const [parent] = await this.bx.getDepartments({ ID: id });
            if (!parent) return undefined;
            const [withUsers] = await this.bx.enrichWithUsers([parent]);
            return withUsers;
        } catch (error) {
            this.warn('parent departments climb failed', error);
            return undefined;
        }
    }

    /**
     * Сотрудники предков ОП. Сбой — warn и предки без сотрудников: сами
     * отделы нужны структуре (руководители уровня cup) и без них.
     */
    private async parentsWithUsers(
        parents: IBXDepartment[],
    ): Promise<IBXDepartment[]> {
        try {
            return await this.bx.enrichWithUsers(parents);
        } catch (error) {
            this.warn('parent departments users failed', error);
            return parents;
        }
    }

    private warn(message: string, error: unknown): void {
        this.logger.warn(
            `${message}: ${error instanceof Error ? error.message : String(error)}`,
        );
    }
}
