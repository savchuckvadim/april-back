import { Logger } from '@nestjs/common';
import { BitrixService } from '@/modules/bitrix';
import { IBXDepartment, IBXUser } from '../../interfaces/bitrix.interface';

/** Страница списочного метода REST: `next` — смещение следующей страницы. */
interface IBXListPage<T> {
    result?: T[];
    next?: number | string;
}

const USER_SELECT = [
    'ID',
    'NAME',
    'LAST_NAME',
    'EMAIL',
    'UF_DEPARTMENT',
    'UF_EMPLOYMENT_DATE',
    'UF_PHONE_INNER',
    'UF_USR_1570437798556',
    'USER_TYPE',
    'WORK_PHONE',
    'WORK_POSITION',
    'UF_HEAD_DEPARTMENT',
    'UF_DEPARTMENT_HEAD',
    'PERSONAL_PHOTO',
    'PERSONAL_WWW',
    'PERSONAL_BIRTHDAY',
    'PERSONAL_CITY',
    'PERSONAL_GENDER',
    'PERSONAL_MOBILE',
    'PERSONAL_PHONE',
    'PERSONAL_EMAIL',
    'PERSONAL_ADDRESS',
];

export class DepartmentBitrixService {
    private readonly logger = new Logger(DepartmentBitrixService.name);

    constructor(private readonly bitrix: BitrixService) {}

    /** Все отделы портала — все страницы department.get. */
    async getDepartmentsAll(): Promise<IBXDepartment[]> {
        return await this.callAllPages<IBXDepartment>('department.get', {});
    }

    async getDepartments(
        filter: Record<string, unknown>,
    ): Promise<IBXDepartment[]> {
        const res = (await this.bitrix.api.call('department.get', filter)) as {
            result: IBXDepartment[];
        };
        return res.result;
    }

    /**
     * Активные сотрудники отдела — все страницы user.get (по 50). Порядок
     * по ID явно: смещение по страницам устойчиво только при стабильной
     * сортировке (по умолчанию user.get и так отдаёт по ID).
     */
    async getUsersByDepartment(id: number): Promise<{ result: IBXUser[] }> {
        const result = await this.callAllPages<IBXUser>('user.get', {
            FILTER: { UF_DEPARTMENT: id, ACTIVE: true },
            SELECT: USER_SELECT,
            SORT: 'ID',
            ORDER: 'ASC',
        });
        return { result };
    }

    async enrichWithUsers(
        departments: IBXDepartment[],
    ): Promise<IBXDepartment[]> {
        const enriched = [] as IBXDepartment[];

        for (const d of departments) {
            const users = await this.getUsersByDepartment(d.ID);
            enriched.push({ ...d, USERS: users.result });
        }

        return enriched;
    }

    /**
     * Все страницы списочного метода. Первая страница — с прежними
     * параметрами, следующие — со смещением `start` = `next` из ответа.
     * Параметр строго в нижнем регистре: проверено на живом портале, что
     * `START` user.get игнорирует и снова отдаёт первую страницу. Страница
     * без новых ID останавливает обход — защита от проигнорированного
     * смещения и бесконечного цикла.
     */
    private async callAllPages<T extends { ID?: number | string }>(
        method: string,
        params: Record<string, unknown>,
    ): Promise<T[]> {
        const rows: T[] = [];
        const seen = new Set<string>();
        let start: number | undefined;

        do {
            const page = (await this.bitrix.api.call(
                method,
                start === undefined ? params : { ...params, start },
            )) as IBXListPage<T> | undefined;
            const fresh = (
                Array.isArray(page?.result) ? page.result : []
            ).filter(row => {
                const id = String(row?.ID);
                if (seen.has(id)) return false;
                seen.add(id);
                return true;
            });
            if (start !== undefined && fresh.length === 0) {
                // обход встал: смещение проигнорировано или страницы
                // съехали — список может быть неполным, пусть это видно
                this.logger.warn(
                    `${method}: страница start=${start} без новых строк — обход остановлен на ${rows.length}`,
                );
                break;
            }

            rows.push(...fresh);
            const next = Number(page?.next);
            start = Number.isInteger(next) && next > 0 ? next : undefined;
        } while (start !== undefined);

        return rows;
    }
}
