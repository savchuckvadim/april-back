import { Injectable } from '@nestjs/common';
import { IBXDeal } from '@/modules/bitrix';

type DuplicateWarning = {
    companyId: string;
    companyTitle: string;
    duplicateStartMonths: string[];
    duplicateEndMonths: string[];
    deals: IBXDeal[];
};

type EmployeeReport = {
    userId: string;
    emptyFrom: IBXDeal[];
    emptyTo: IBXDeal[];
    duplicateWarnings: DuplicateWarning[];
};

@Injectable()
export class DealWarningsBbcodeFormatterService {
    buildEmployeeMessage(
        domain: string,
        report: EmployeeReport,
        companyTitleById: Map<string, string>,
        employeeName?: string,
    ): string {
        const employeeLabel = employeeName || `ID ${report.userId}`;
        const hasMissingContractFields =
            report.emptyFrom.length > 0 || report.emptyTo.length > 0;

        const lines: string[] = [
            `[B]Сотрудник: ${employeeLabel}[/B]`,
            '',
            '[B][color=#1d74d8]1) Сделки с пропущенными датами договора[/color][/B]',
            hasMissingContractFields
                ? [
                      this.renderMissingDealsBlock(
                          domain,
                          'действия договора с',
                          report.emptyFrom,
                          companyTitleById,
                      ),
                      this.renderMissingDealsBlock(
                          domain,
                          'действия договора по',
                          report.emptyTo,
                          companyTitleById,
                      ),
                  ].join('\n')
                : '[color=#2e7d32][b]✅ Все сделки оформлены замечательно: пропусков по датам договора нет.[/b][/color]',
            '',
            '[B][color=#d97706]2) Возможные дубли по месяцам[/color][/B]',
            this.renderDuplicatesBlock(
                domain,
                report.duplicateWarnings,
                companyTitleById,
            ),
        ];

        return lines.join('\n').trim();
    }

    private renderMissingDealsBlock(
        domain: string,
        fieldName: string,
        deals: IBXDeal[],
        companyTitleById: Map<string, string>,
    ): string {
        const header = `[B]• Пустое поле "${fieldName}" — ${deals.length}[/B]`;
        if (deals.length === 0) {
            return `${header}\n[i]✅ Нарушений нет[/i]\n`;
        }

        const rows: string[] = [header];

        for (const deal of deals) {
            const companyId = String(deal.COMPANY_ID ?? '');
            const companyTitle = this.getCompanyTitle(
                companyId,
                undefined,
                companyTitleById,
            );
            const dealUrl = this.dealUrl(domain, String(deal.ID));
            rows.push(`>> [url=${dealUrl}]#${deal.ID}[/url] — ${companyTitle}`);
        }

        return rows.join('\n');
    }

    private renderDuplicatesBlock(
        domain: string,
        warnings: DuplicateWarning[],
        companyTitleById: Map<string, string>,
    ): string {
        if (warnings.length === 0) {
            return '[color=#2e7d32][b]✅ Дублей не найдено.[/b][/color]';
        }

        const rows: string[] = [];

        for (const warning of warnings) {
            const companyTitle = this.getCompanyTitle(
                warning.companyId,
                warning.companyTitle,
                companyTitleById,
            );
            const companyUrl = this.companyUrl(domain, warning.companyId);
            const reasons = this.renderDuplicateReasons(warning);

            rows.push(
                `[B]• [url=${companyUrl}]${companyTitle}[/url][/B] (сделок: ${warning.deals.length})`,
                reasons,
                '',
            );
        }

        return rows.join('\n').trim();
    }

    private renderDuplicateReasons(warning: DuplicateWarning): string {
        const reasons: string[] = [];
        if (warning.duplicateStartMonths.length > 0) {
            reasons.push(
                `>> совпадают месяцы начала договора: ${warning.duplicateStartMonths.join(', ')}`,
            );
        }
        if (warning.duplicateEndMonths.length > 0) {
            reasons.push(
                `>> совпадают месяцы окончания договора: ${warning.duplicateEndMonths.join(', ')}`,
            );
        }
        if (reasons.length === 0) {
            reasons.push(
                '>> потенциальный дубль (несколько открытых сделок по одной компании)',
            );
        }
        return reasons.join('\n');
    }

    private getCompanyTitle(
        companyId: string,
        fallbackTitle: string | undefined,
        companyTitleById: Map<string, string>,
    ): string {
        return (
            companyTitleById.get(companyId) ||
            (fallbackTitle && fallbackTitle.trim()) ||
            `Компания ${companyId || 'без ID'}`
        );
    }

    private dealUrl(domain: string, dealId: string): string {
        return `https://${domain}/crm/deal/details/${dealId}/`;
    }

    private companyUrl(domain: string, companyId: string): string {
        return `https://${domain}/crm/company/details/${companyId}/`;
    }
}
