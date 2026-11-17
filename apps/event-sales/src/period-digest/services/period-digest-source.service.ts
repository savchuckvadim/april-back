import { Injectable } from '@nestjs/common';
import { BxDepartmentService } from '@lib/bx-department';
import { CallReportAnalyticsDataService } from '@lib/call-lib';
import { EDepartamentGroup } from '@lib/portal-lib/portal/interfaces/portal.interface';
import { type DatedLiteRow, hasCallDate } from '@lib/sales-ai-analytics';
import type { DigestStructureDepartment } from '../lib/period-digest-managers';

/**
 * Данные итогов периода без Битрикса для звонков: lite-строки разборов из
 * нашей БД (call-lib `loadLite`, без текста транскрипта) за окно и снимок
 * структуры отделов продаж (bx-department, кэш в Redis).
 *
 * `@Injectable` без bitrix-состояния.
 */
@Injectable()
export class PeriodDigestSourceService {
    constructor(
        private readonly data: CallReportAnalyticsDataService,
        private readonly departments: BxDepartmentService,
    ) {}

    /** Записанные звонки портала за окно [from; to) по времени звонка. */
    async rows(domain: string, from: Date, to: Date): Promise<DatedLiteRow[]> {
        const dataset = await this.data.loadLite({
            domain,
            from: from.toISOString(),
            to: to.toISOString(),
            useCache: false,
            saveToHistory: false,
        });
        return dataset.rows
            .filter(hasCallDate)
            .filter(row => row.callStartedAt.getTime() < to.getTime());
    }

    /**
     * Основные и дочерние отделы продаж — состав менеджеров. Предков снимка
     * здесь нет: в них руководство компании, а не менеджеры.
     */
    async salesDepartments(
        domain: string,
    ): Promise<DigestStructureDepartment[]> {
        const { department } = await this.departments.getFullDepartment(
            domain,
            EDepartamentGroup.sales,
        );
        return [
            ...(department.generalDepartment ?? []),
            ...(department.childrenDepartments ?? []),
        ];
    }
}
