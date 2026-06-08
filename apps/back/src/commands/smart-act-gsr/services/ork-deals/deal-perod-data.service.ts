import { IBXDeal } from '@/modules/bitrix';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { getContractPeriodDealData } from './utils/get-contract-period-field.util';
import { Injectable } from '@nestjs/common';
export interface IOrkDealPeriodData {
    isFromNotEmpty: boolean;
    isToNotEmpty: boolean;
    currentMonth: number; // 2 - 2-й,
    //прошло месяцев
    passedMonths: number; //1
    //осталось месяцев
    remainingMonths: number; //11
    //общее количество месяцев
    totalMonths: number; //12
    from: string;
    to: string;
}
@Injectable()
export class DealPerodDataService {
    public getDealPeriodData(
        deal: IBXDeal,
        portal: PortalModel,
    ): IOrkDealPeriodData {
        const { from, to } = getContractPeriodDealData(deal, portal);
        const startDate = this.parseDate(from);
        const endDate = this.parseDate(to);
        const isFromNotEmpty = Boolean(startDate);
        const isToNotEmpty = Boolean(endDate);
        if (!startDate || !endDate || startDate > endDate) {
            return {
                currentMonth: 0,
                isFromNotEmpty,
                isToNotEmpty,
                passedMonths: 0,
                remainingMonths: 0,
                totalMonths: 0,
                from,
                to,
            };
        }

        const totalMonths = this.getTotalMonths(from, to);
        //totalMonths общее всего месяцев по договору стандартно если с 01.01.2026 по 31.12.2026 то 12 месяцев.
        // если месяцев получается не ровно 12 округляем в большую если количество дней более 14
        // если месяцев получается не ровно 12 округляем в меньшую если количество дней менее 15

        const currentMonth = this.getCurrentMonth(from, to); //
        //currentMonth текущий месяц по договору
        //стандартно если с 01.01.2026 по 31.12.2026
        // а сечас 27 апреля 2026 то currentMonth = 4; потому что 3 полных месяца уже прошло и 4-й идет сейчас
        // по этому показателю будем определять нужно ли выставлять акт на текущий месяц или уже выставлен

        const passedMonths = this.getPassedMonths(from, to); // прошло месяцев
        // passedMonths количество полных месяцев которые уже прошли по договору
        // если с 01.01.2026 по 31.12.2026
        //  а сечас 27 апреля 2026 то passedMonths = 3; потому что 3 полных месяца уже прошло

        const remainingMonths = this.getRemainingMonths(from, to);
        // remainingMonths количество месяцев которые остались по договору
        // если с 01.01.2026 по 31.12.2026
        //  а сечас 27 апреля 2026 то remainingMonths = 8; потому что 8 месяцев осталось

        return {
            currentMonth,
            isFromNotEmpty,
            isToNotEmpty,
            passedMonths,
            remainingMonths,
            totalMonths,
            from,
            to,
        };
    }

    private getTotalMonths(from: unknown, to: unknown): number {
        const startDate = this.parseDate(from);
        const endDate = this.parseDate(to);
        if (!startDate || !endDate || startDate > endDate) {
            return 0;
        }
        return this.countMonthsWithHalfMonthRounding(startDate, endDate);
    }

    private getPassedMonths(from: unknown, to: unknown): number {
        const startDate = this.parseDate(from);
        const endDate = this.parseDate(to);
        if (!startDate || !endDate || startDate > endDate) {
            return 0;
        }

        const now = this.getCurrentDate();
        if (now <= startDate) {
            return 0;
        }
        if (now >= endDate) {
            return this.getTotalMonths(startDate, endDate);
        }
        return this.countFullMonths(startDate, now);
    }

    private getCurrentMonth(from: unknown, to: unknown): number {
        const startDate = this.parseDate(from);
        const endDate = this.parseDate(to);
        if (!startDate || !endDate || startDate > endDate) {
            return 0;
        }

        const now = this.getCurrentDate();
        const totalMonths = this.getTotalMonths(startDate, endDate);
        if (now < startDate) {
            return 0;
        }
        if (now >= endDate) {
            return totalMonths;
        }

        const passedMonths = this.getPassedMonths(startDate, endDate);
        return Math.min(passedMonths + 1, totalMonths);
    }

    private getRemainingMonths(from: unknown, to: unknown): number {
        const totalMonths = this.getTotalMonths(from, to);
        const currentMonth = this.getCurrentMonth(from, to);
        if (totalMonths === 0 || currentMonth === 0) {
            return 0;
        }
        return Math.max(totalMonths - currentMonth, 0);
    }

    private countMonthsWithHalfMonthRounding(from: Date, to: Date): number {
        const fullMonths = this.countFullMonths(from, to);
        const cursor = this.addMonths(from, fullMonths);
        const restDays = this.daysDiffInclusive(cursor, to);
        return fullMonths + (restDays >= 15 ? 1 : 0);
    }

    private countFullMonths(from: Date, to: Date): number {
        let months = 0;
        while (this.addMonths(from, months + 1) <= to) {
            months += 1;
        }
        return months;
    }

    private addMonths(date: Date, months: number): Date {
        const result = new Date(date.getTime());
        result.setMonth(result.getMonth() + months);
        return result;
    }

    private daysDiffInclusive(from: Date, to: Date): number {
        const msInDay = 1000 * 60 * 60 * 24;
        const fromUtc = Date.UTC(
            from.getFullYear(),
            from.getMonth(),
            from.getDate(),
        );
        const toUtc = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
        return Math.floor((toUtc - fromUtc) / msInDay) + 1;
    }

    private parseDate(value: unknown): Date | undefined {
        if (value instanceof Date) {
            return Number.isNaN(value.getTime()) ? undefined : value;
        }
        if (typeof value !== 'string' && typeof value !== 'number') {
            return undefined;
        }
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? undefined : date;
    }

    private getCurrentDate(): Date {
        return new Date();
    }
}
