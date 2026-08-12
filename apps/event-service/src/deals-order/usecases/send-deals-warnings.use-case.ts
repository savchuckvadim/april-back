import { Injectable, Logger } from '@nestjs/common';
import { IBXDeal } from '@/modules/bitrix';
import { DealServiceService } from '../services/ork-deals/deal-service.service';
import { CompanyInfoService } from '../services/company/company-info.service';
import { UserInfoService } from '../services/user/user-info.service';
import { DealMessageService } from '../services/message-send/deal-message.service';
import { DealWarningsBbcodeFormatterService } from '../services/message-layout/deal-warnings-bbcode-formatter.service';

const ADMIN_USER_ID = '187';
const DEFAULT_DOMAIN = 'gsr.bitrix24.ru';

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

type SendMode = 'employee' | 'admin' | 'both';
// ВНИМАНИЕ: при mode='admin' сотрудники НЕ получают сообщений — всё уходит
// только ADMIN_USER_ID. До монорепо-рефакторинга стояло 'both'.
const mode: SendMode = 'both';
@Injectable()
export class SendDealsWarningsUseCase {
    private readonly logger = new Logger(SendDealsWarningsUseCase.name);

    constructor(
        private readonly dealService: DealServiceService,
        private readonly companyInfoService: CompanyInfoService,
        private readonly userInfoService: UserInfoService,
        private readonly dealMessageService: DealMessageService,
        private readonly formatter: DealWarningsBbcodeFormatterService,
    ) {}

    async execute(
        domain: string | undefined = DEFAULT_DOMAIN as string,
    ): Promise<{
        mode: SendMode;
        employeeReportsCount: number;
        sentTo: string[];
        adminUserId: string;
        adminMessagesCount: number;
    }> {
        const [emptyFields, groupedByCompany] = await Promise.all([
            this.dealService.getDealsWithEmptyOneOfContractPeriodFields(),
            this.dealService.geGrouppedByComapny(),
        ]);

        const warnings = (groupedByCompany.warnings ??
            []) as DuplicateWarning[];
        this.logger.log(
            `deals-order [${domain}]: emptyFrom=${emptyFields.dealsWithEmptyFrom?.length ?? 0}, ` +
                `emptyTo=${emptyFields.dealsWithEmptyTo?.length ?? 0}, ` +
                `companiesWithDeals=${warnings.length}, mode=${mode}`,
        );
        const dealsForCompanyNames: IBXDeal[] = [
            ...(emptyFields.dealsWithEmptyFrom ?? []),
            ...(emptyFields.dealsWithEmptyTo ?? []),
            ...warnings.flatMap(w => w.deals ?? []),
        ];

        const companyIds = dealsForCompanyNames
            .map(deal => String(deal.COMPANY_ID ?? ''))
            .filter(Boolean);
        const companyTitleById =
            await this.companyInfoService.getCompanyTitlesMap(
                domain,
                companyIds,
            );

        const allUserIds = Array.from(
            new Set(
                [
                    ...dealsForCompanyNames.map(d =>
                        String(d.ASSIGNED_BY_ID ?? ''),
                    ),
                    ADMIN_USER_ID,
                ].filter(Boolean),
            ),
        );
        const userById = await this.userInfoService.getUserNamesMap(
            domain,
            allUserIds,
        );

        const employeeReports = this.buildEmployeeReports(
            emptyFields.dealsWithEmptyFrom ?? [],
            emptyFields.dealsWithEmptyTo ?? [],
            warnings,
        );

        this.logger.log(
            `deals-order [${domain}]: employeeReports=${employeeReports.length}`,
        );

        const sentTo: string[] = [];
        if (mode === 'employee' || mode === 'both') {
            for (const report of employeeReports) {
                const employee = userById.get(report.userId);
                const message = this.formatter.buildEmployeeMessage(
                    domain,
                    report,
                    companyTitleById,
                    employee?.name,
                );
                if (!message) continue;

                await this.dealMessageService.sendToUser(
                    domain,
                    report.userId,
                    message,
                );
                this.logger.log(
                    `deals-order [${domain}]: сообщение отправлено сотруднику ${report.userId}`,
                );
                sentTo.push(report.userId);
            }
        }

        let adminMessagesCount = 0;
        if (mode === 'admin' || mode === 'both') {
            const adminMessages = this.buildAdminMessages(
                domain,
                employeeReports,
                companyTitleById,
                userById,
            );
            for (const message of adminMessages) {
                await this.dealMessageService.sendToUser(
                    domain,
                    ADMIN_USER_ID,
                    message,
                );
                adminMessagesCount++;
            }
            this.logger.log(
                `deals-order [${domain}]: админу ${ADMIN_USER_ID} отправлено сообщений: ${adminMessagesCount}`,
            );
        }

        return {
            mode,
            employeeReportsCount: employeeReports.length,
            sentTo,
            adminUserId: ADMIN_USER_ID,
            adminMessagesCount,
        };
    }

    private buildEmployeeReports(
        dealsWithEmptyFrom: IBXDeal[],
        dealsWithEmptyTo: IBXDeal[],
        duplicateWarnings: DuplicateWarning[],
    ): EmployeeReport[] {
        const userIds = new Set<string>([
            ...dealsWithEmptyFrom.map(d => String(d.ASSIGNED_BY_ID ?? '')),
            ...dealsWithEmptyTo.map(d => String(d.ASSIGNED_BY_ID ?? '')),
            ...duplicateWarnings.flatMap(w =>
                (w.deals ?? []).map(d => String(d.ASSIGNED_BY_ID ?? '')),
            ),
        ]);

        return Array.from(userIds)
            .filter(Boolean)
            .map(userId => {
                const emptyFrom = dealsWithEmptyFrom.filter(
                    d => String(d.ASSIGNED_BY_ID ?? '') === userId,
                );
                const emptyTo = dealsWithEmptyTo.filter(
                    d => String(d.ASSIGNED_BY_ID ?? '') === userId,
                );
                const warnings = duplicateWarnings.filter(w =>
                    (w.deals ?? []).some(
                        d => String(d.ASSIGNED_BY_ID ?? '') === userId,
                    ),
                );
                return {
                    userId,
                    emptyFrom,
                    emptyTo,
                    duplicateWarnings: warnings,
                };
            })
            .filter(
                report =>
                    report.emptyFrom.length > 0 ||
                    report.emptyTo.length > 0 ||
                    report.duplicateWarnings.length > 0,
            );
    }

    private buildAdminMessages(
        domain: string,
        reports: EmployeeReport[],
        companyTitleById: Map<string, string>,
        userById: Map<string, { id: string; name: string }>,
    ): string[] {
        if (reports.length === 0) {
            return [
                '[B]Сводка по сотрудникам[/B]\n[color=#2e7d32][b]✅ Нарушений не найдено, всё в порядке.[/b][/color]',
            ];
        }

        return reports.map(report => {
            const employee = userById.get(report.userId);
            return this.formatter.buildEmployeeMessage(
                domain,
                report,
                companyTitleById,
                employee?.name,
            );
        });
    }
}
