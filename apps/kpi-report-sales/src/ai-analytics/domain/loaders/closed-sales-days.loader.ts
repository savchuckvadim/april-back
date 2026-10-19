/**
 * Дни закрытия сделок менеджеров ростера за окно — вход воспроизведения
 * теневого журнала прогноза (шаг `forecast-log-replay`): «сделано продаж
 * к дню d» считается по дате закрытия каждой сделки, а не по итогу месяца.
 *
 * Источник тот же, что у вкладки «Финансы» и ночного шага финансов —
 * `ClosedSalesUseCase` (сделки sales_base в успехе по CLOSEDATE) с кэшем
 * sales-finance по закрытым месяцам: Битрикс для них не зовётся, числа
 * сходятся с «Финансами» на тех же фильтрах.
 *
 * `@Injectable` без bitrix-состояния: инстанс берёт use-case внутри вызова
 * (`PBXService.init(domain)`), здесь только фабрика и ростер.
 */
import { Injectable } from '@nestjs/common';
import { ManagersLoader } from './managers.loader';
import { SalesFinanceUseCaseFactory } from './sales-finance-use-case.factory';

/** Закрытая сделка в объёме воспроизведения: менеджер и день закрытия. */
export interface ClosedSaleDay {
    /** Bitrix-id ответственного строкой (как в снапшотах). */
    readonly managerId: string;
    /** День закрытия 'YYYY-MM-DD' — портальная дата CLOSEDATE. */
    readonly closeDay: string;
}

export interface ClosedSalesDaysOptions {
    /** Перечитать отчёт, игнорируя кэш sales-finance. */
    readonly forceRefresh?: boolean;
}

const CLOSE_DAY = /^(\d{4}-\d{2}-\d{2})/;

/**
 * День закрытия по строке CLOSEDATE Битрикса (дата портала в начале
 * ISO-строки — та же, по которой `>=CLOSEDATE` отобрал сделку);
 * нераспознанная дата — null.
 */
export function closeDayOf(closeDate: string): string | null {
    return CLOSE_DAY.exec(closeDate)?.[1] ?? null;
}

@Injectable()
export class ClosedSalesDaysLoader {
    constructor(
        private readonly useCases: SalesFinanceUseCaseFactory,
        private readonly managers: ManagersLoader,
    ) {}

    /**
     * Сделки ростера, закрытые в окне `[from; to]` ('YYYY-MM-DD'
     * включительно), по одной строке на сделку. Пустой ростер — без вызова.
     * Сделка с нераспознанной датой закрытия отбрасывается.
     */
    async load(
        domain: string,
        from: string,
        to: string,
        managerIds?: readonly (string | number)[],
        options: ClosedSalesDaysOptions = {},
    ): Promise<ClosedSaleDay[]> {
        const ids = await this.managers.resolve(domain, managerIds);
        if (ids.length === 0) return [];
        const { report } = await this.useCases.create().closed.executeDetailed({
            domain,
            forceRefresh: options.forceRefresh === true,
            filters: { assignedIds: ids, dateFrom: from, dateTo: to },
        });

        return report.employees.flatMap(employee =>
            employee.deals.flatMap((deal): ClosedSaleDay[] => {
                const closeDay = closeDayOf(deal.closeDate);

                return closeDay === null
                    ? []
                    : [{ managerId: String(employee.assignedId), closeDay }];
            }),
        );
    }
}
