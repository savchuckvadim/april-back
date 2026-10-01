import type { BxDepartmentService } from '@lib/bx-department/services/bx-department.service';
import { EDepartamentGroup } from '@lib/portal-lib/portal/interfaces/portal.interface';

/** Снимок отделов продаж в том виде, в каком его отдаёт bx-department. */
type SalesSnapshot = Awaited<
    ReturnType<BxDepartmentService['getFullDepartment']>
>['department'];

/** Отдел снимка — структурно подходит для buildHeadsByUser. */
export type SalesDepartment = SalesSnapshot['generalDepartment'][number];

/**
 * Отделы продаж ОДНИМ плоским списком: основные (в мультирежиме — все ОП),
 * их подотделы и предки. Предки нужны подъёму по PARENT: у группы без
 * своего руководителя РОП — в отделе выше.
 *
 * Общий для всех, кто ищет руководителей по снимку (оповещения о повторной
 * заявке, сводки аудита сделок): форма снимка меняется в одном месте.
 * Сбой чтения — пустой список и предупреждение `${failureText}: причина`:
 * оповещение руководителей вторично и операцию не роняет.
 */
export async function loadSalesDepartments(
    departments: Pick<BxDepartmentService, 'getFullDepartment'>,
    domain: string,
    warnings: string[],
    failureText = 'структура отдела продаж не прочитана',
): Promise<SalesDepartment[]> {
    try {
        const { department } = await departments.getFullDepartment(
            domain,
            EDepartamentGroup.sales,
        );
        return [
            ...(department.generalDepartment ?? []),
            ...(department.childrenDepartments ?? []),
            ...(department.parentDepartments ?? []),
        ];
    } catch (error) {
        warnings.push(`${failureText}: ${(error as Error).message}`);
        return [];
    }
}
