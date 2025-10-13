import { Injectable, Logger } from '@nestjs/common';
import { BitrixListFlowService } from './bx-event-flow.service';

// Assuming these interfaces/types are defined similarly to how they were for BitrixListFlowService
// or are accessible from a shared types file.
interface BitrixList {
    type: string;
    group: string;
    bitrixId: string | number;
    bitrixfields?: any[]; // Define more strictly if possible
}

interface WorkStatus {
    code: string;
    name?: string;
}

interface Reason {
    code: string;
    name?: string;
}

type BatchCommands = Record<string, any>;

interface CurrentTask {
    // Derived from usage in PHP
    id?: string | number;
    eventType?: string;
    // ... other properties from currentTask if used by getListBatchFlow
}

interface BtxDealShort {
    ID: string | number;
    ASSIGNED_BY_ID?: string | number; // For TMC Deal
    // other relevant properties if needed for logic
}

// Mock/Placeholder for EventReportService properties that getListBatchFlow uses.
// In a real scenario, these would be properly initialized or passed.
interface EventReportServiceProperties {
    hook: string;
    bitrixLists: BitrixList[];
    withLists: boolean;
    currentReportEventType: string;
    currentReportEventName: string;
    currentPlanEventType: string | null;
    currentPlanEventName: string | null;
    resultStatus: string; // result, noresult, expired, new
    planDeadline: string | null; // Format: 'DD.MM.YYYY HH:MI:SS' from Bitrix
    planCreatedId: string | number | null;
    planResponsibleId: string | number | null;
    planTmcId: string | number | null;
    entityId: string | number;
    comment: string;
    workStatus: { current: WorkStatus | null } | null;
    noresultReason: { current: Reason | null } | null;
    failReason: { current: Reason | null } | null;
    failType: { current: Reason | null } | null;
    currentBtxDeals: Array<{ ID: string | number }> | null;
    currentBaseDeal: BtxDealShort | null;
    currentTMCDealFromCurrentPres: BtxDealShort | null; // Added for TMC logic
    // nowDate: string; // Removed, will be generated dynamically
    planContactId: string | number | null;
    reportContactId: string | number | null; // Added from PHP review
    currentTask: CurrentTask | null;
    isPlanned: boolean;
    isExpired: boolean;
    isFail: boolean;
    isSuccessSale: boolean;
    isNoCall: boolean;
    isPresentationDone: boolean; // Added based on PHP logic
    isNew: boolean; // Added based on PHP logic
    domain: string; // Added for planDeadline formatting
    // Properties for removeEmojisIntl simulation if needed, or assume it's handled
}

@Injectable()
export class EventReportListFlowService {
    private readonly logger = new Logger(EventReportListFlowService.name);

    // Helper to parse DD.MM.YYYY HH:MI:SS from Bitrix
    private parseBtxDateTime(dateStr: string): Date {
        const parts = dateStr.match(
            /(\d{2})\.(\d{2})\.(\d{4}) (\d{2}):(\d{2}):(\d{2})/,
        );
        if (parts) {
            return new Date(
                +parts[3],
                +parts[2] - 1,
                +parts[1],
                +parts[4],
                +parts[5],
                +parts[6],
            );
        }
        this.logger.warn(
            `Could not parse date string: ${dateStr}, returning current date.`,
        );
        return new Date(); // Fallback
    }

    // Helper to format Date object to DD.MM.YYYY HH:MI:SS for Bitrix
    private formatBtxDateTime(
        dateObj: Date,
        timeZone: string = 'Europe/Moscow',
    ): string {
        return dateObj
            .toLocaleString('ru-RU', {
                timeZone: timeZone,
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
            })
            .replace(',', '');
    }

    // Helper to simulate PHP's removeEmojisIntl. For now, a simple pass-through.
    private removeEmojisIntl(str: string | null): string {
        return str || '';
    }

    // Method to simulate the properties of EventReportService for demonstration.
    // In a real app, these would come from the actual service instance or be passed.
    private getMockEventReportProperties(): EventReportServiceProperties {
        const initialNow = new Date();
        return {
            hook: 'mock_hook_url',
            bitrixLists: [{ type: 'kpi', group: 'sales', bitrixId: '123' }],
            withLists: true,
            currentReportEventType: 'xo',
            currentReportEventName: 'Холодный звонок (Отчет)',
            currentPlanEventType: 'presentation',
            currentPlanEventName: 'Презентация (План)',
            resultStatus: 'result',
            planDeadline: new Date(
                initialNow.getTime() + 24 * 60 * 60 * 1000,
            ).toISOString(),
            planCreatedId: 'user1',
            planResponsibleId: 'user2',
            planTmcId: 'user_tmc',
            entityId: 'company100',
            comment: 'Основной комментарий к событию',
            workStatus: { current: { code: 'inJob' } },
            noresultReason: { current: null },
            failReason: { current: null },
            failType: { current: null },
            currentBtxDeals: [{ ID: 'D1' }, { ID: 'D2' }],
            currentBaseDeal: { ID: 'BD1' },
            currentTMCDealFromCurrentPres: {
                ID: 'TMC_D1',
                ASSIGNED_BY_ID: 'user_tmc_assigned',
            },
            planContactId: 'contact1',
            reportContactId: 'contactRep1', // Example value
            currentTask: { id: 'task1', eventType: 'xo' },
            isPlanned: true,
            isExpired: false,
            isFail: false,
            isSuccessSale: false,
            isNoCall: false,
            isPresentationDone: true, // Example value
            isNew: false, // Example value
            domain: 'somecompany.bitrix24.ru', // Example domain
        };
    }

    /**
     * Corresponds to getListBatchFlow in EventReportService.php
     */
    public getListBatchFlow(): BatchCommands {
        const props = this.getMockEventReportProperties();
        let resultBatchCommands: BatchCommands = {};

        // Equivalent of date_default_timezone_set('Europe/Moscow');
        // JavaScript Date objects handle timezones internally; formatting handles output.
        let currentBtxDateTime = new Date(); // Represents current moment in time
        let nowDateForCall: string; // Will store formatted date string for calls

        try {
            if (
                !props.withLists ||
                !props.bitrixLists ||
                props.bitrixLists.length === 0
            ) {
                this.logger.warn('No lists to process or withLists is false.');
                return resultBatchCommands;
            }

            // PHP: $currentDealIds = []; $currentBaseDealId = null;
            const currentDealIds: (string | number)[] = (
                props.currentBtxDeals || []
            ).map(d => d.ID);
            const currentBaseDealId: string | number | null =
                props.currentBaseDeal?.ID || null;

            // PHP: $planDeadline = $this->planDeadline;
            let planDeadlineForLogic = props.planDeadline; // Format: DD.MM.YYYY HH:MI:SS

            // PHP: Timezone conversion for planDeadline
            if (planDeadlineForLogic) {
                if (props.domain === 'alfacentr.bitrix24.ru') {
                    const tmpDeadline =
                        this.parseBtxDateTime(planDeadlineForLogic); // Parses assuming it's 'Asia/Novosibirsk'
                    // To correctly simulate, we'd need to know the original timezone of planDeadline string
                    // For now, let's assume it's passed in Moscow time or UTC and adjust if this is a critical discrepancy
                    // PHP: $tmpDeadline = Carbon::createFromFormat('d.m.Y H:i:s', $planDeadline, 'Asia/Novosibirsk');
                    // PHP: $tmpDeadline = $tmpDeadline->setTimezone('Europe/Moscow');
                    // PHP: $planDeadline = $tmpDeadline->format('Y-m-d H:i:s');
                    // This part is tricky without knowing the exact original timezone of props.planDeadline.
                    // If props.planDeadline is already in 'Europe/Moscow', no change needed.
                    // If it's from 'Asia/Novosibirsk', we'd parse it as such then format to 'Y-m-d H:i:s' in Moscow.
                    // For simplicity, assuming planDeadlineForLogic is already 'Europe/Moscow' or interpretation is handled by BitrixListFlowService
                    this.logger.debug(
                        `planDeadline for ${props.domain}: ${planDeadlineForLogic} (no specific conversion applied in TS yet)`,
                    );
                } else if (props.domain === 'gsirk.bitrix24.ru') {
                    // Similar logic for 'Asia/Irkutsk'
                    this.logger.debug(
                        `planDeadline for ${props.domain}: ${planDeadlineForLogic} (no specific conversion applied in TS yet)`,
                    );
                }
            }

            const reportEventTypeFromProps = props.currentReportEventType;
            const reportEventTypeNameFromProps = props.currentReportEventName;
            let planEventTypeNameForLogic = this.removeEmojisIntl(
                props.currentPlanEventName,
            );
            let planEventTypeForLogic = props.currentPlanEventType;

            // PHP: $eventAction = 'expired'; $planComment = 'Перенесен';
            let eventAction = 'expired';
            let planComment = 'Перенесен';

            // PHP: if (!$this->isExpired) { ... }
            if (!props.isExpired) {
                eventAction = 'plan';
                planComment = 'Запланирован';
                if (planEventTypeNameForLogic === 'Презентация') {
                    planComment = 'Запланирована';
                }
            } else {
                // PHP: $planEventTypeName = $this->currentReportEventName; $planEventType = $this->currentReportEventType;
                planEventTypeNameForLogic = reportEventTypeNameFromProps;
                planEventTypeForLogic = reportEventTypeFromProps;
            }

            // PHP: $planComment = $planComment . ' ' . $planEventTypeName . ' ' . $this->removeEmojisIntl($this->currentPlanEventName);
            planComment = `${planComment} ${planEventTypeNameForLogic} ${this.removeEmojisIntl(props.currentPlanEventName)}`;

            // PHP: if ($this->isNew || $this->isExpired) { $planComment .= ' ' . $this->comment; }
            if (props.isNew || props.isExpired) {
                planComment = `${planComment} ${props.comment}`;
            }

            // --- Start of calls to BitrixListFlowService.getBatchListFlow ---

            // PHP: if (!$this->isNew) { ... }
            if (!props.isNew) {
                // PHP: if (!$this->isExpired) { ... }
                if (!props.isExpired) {
                    let reportAction = 'done';
                    // PHP: if ($this->resultStatus !== 'result') { $reportAction = 'nodone'; }
                    if (props.resultStatus !== 'result') {
                        // Assuming 'new' is not 'result'
                        reportAction = 'nodone';
                    }

                    // PHP: if ($reportEventType !== 'presentation' || ($reportEventType == 'presentation' && !empty($this->isNoCall)))
                    if (
                        reportEventTypeFromProps !== 'presentation' ||
                        (reportEventTypeFromProps === 'presentation' &&
                            props.isNoCall)
                    ) {
                        let deadlineForThisCall = planDeadlineForLogic; // Uses the potentially timezone-adjusted planDeadline
                        // PHP: if (!$this->isPlanned) { $deadline = null; }
                        if (!props.isPlanned) {
                            deadlineForThisCall = null;
                        }

                        currentBtxDateTime = new Date(
                            currentBtxDateTime.getTime() + 1000,
                        ); // +1 second
                        nowDateForCall =
                            this.formatBtxDateTime(currentBtxDateTime);

                        this.logger.log(
                            `Calling BitrixListFlowService.getBatchListFlow (Report Current Event) at ${nowDateForCall}`,
                        );
                        resultBatchCommands =
                            BitrixListFlowService.getBatchListFlow(
                                props.hook,
                                props.bitrixLists,
                                reportEventTypeFromProps,
                                reportEventTypeNameFromProps,
                                reportAction,
                                deadlineForThisCall,
                                String(props.planCreatedId ?? ''),
                                String(props.planResponsibleId ?? ''),
                                String(props.planResponsibleId ?? ''),
                                String(props.entityId),
                                props.comment,
                                props.workStatus?.current || null,
                                props.resultStatus,
                                props.noresultReason?.current || null,
                                props.failReason?.current || null,
                                props.failType?.current || null,
                                currentDealIds.map(id => String(id)),
                                currentBaseDealId
                                    ? String(currentBaseDealId)
                                    : null,
                                nowDateForCall,
                                reportEventTypeNameFromProps,
                                props.reportContactId
                                    ? String(props.reportContactId)
                                    : null,
                                resultBatchCommands,
                            );
                    }
                }
            }

            // PHP: if ($this->isPresentationDone == true && !$this->isExpired)
            if (props.isPresentationDone && !props.isExpired) {
                // PHP: if ($reportEventType !== 'presentation')
                if (reportEventTypeFromProps !== 'presentation') {
                    // Unplanned presentation
                    currentBtxDateTime = new Date(
                        currentBtxDateTime.getTime() + 1000,
                    ); // PHP: +2 seconds from last modification
                    nowDateForCall = this.formatBtxDateTime(currentBtxDateTime);

                    this.logger.log(
                        `Calling BitrixListFlowService.getBatchListFlow (Log Unplanned Presentation) at ${nowDateForCall}`,
                    );
                    resultBatchCommands =
                        BitrixListFlowService.getBatchListFlow(
                            props.hook,
                            props.bitrixLists,
                            'presentation',
                            'Презентация',
                            'plan', // action
                            nowDateForCall, // deadline is current time for unplanned
                            String(props.planResponsibleId ?? ''), // PHP uses planResponsibleId for all three user ID fields here
                            String(props.planResponsibleId ?? ''),
                            String(props.planResponsibleId ?? ''),
                            String(props.entityId),
                            'незапланированая презентация', // comment
                            { code: 'inJob' }, // workStatus
                            'result', // resultStatus
                            props.noresultReason?.current || null,
                            props.failReason?.current || null,
                            props.failType?.current || null,
                            currentDealIds.map(id => String(id)),
                            currentBaseDealId
                                ? String(currentBaseDealId)
                                : null,
                            nowDateForCall, // eventDate
                            'Презентация', // hotName - PHP: null
                            props.reportContactId
                                ? String(props.reportContactId)
                                : null,
                            resultBatchCommands,
                        );
                }

                // This is the "report" for the presentation that was done.
                let deadlineForPresDoneCall = planDeadlineForLogic;
                // PHP: if (!$this->isPlanned) { $deadline = null; }
                if (!props.isPlanned) {
                    deadlineForPresDoneCall = null;
                }

                currentBtxDateTime = new Date(
                    currentBtxDateTime.getTime() + 1000,
                ); // PHP: +3 seconds from previous modification
                nowDateForCall = this.formatBtxDateTime(currentBtxDateTime);

                this.logger.log(
                    `Calling BitrixListFlowService.getBatchListFlow (Report Presentation Done) at ${nowDateForCall}`,
                );
                resultBatchCommands = BitrixListFlowService.getBatchListFlow(
                    props.hook,
                    props.bitrixLists,
                    'presentation',
                    'Презентация',
                    'done', // action
                    deadlineForPresDoneCall,
                    String(props.planResponsibleId ?? ''), // PHP uses planResponsibleId for all three user ID fields
                    String(props.planResponsibleId ?? ''),
                    String(props.planResponsibleId ?? ''),
                    String(props.entityId),
                    props.comment, // Main comment from props
                    props.workStatus?.current || null,
                    props.resultStatus,
                    props.noresultReason?.current || null,
                    props.failReason?.current || null,
                    props.failType?.current || null,
                    currentDealIds.map(id => String(id)),
                    currentBaseDealId ? String(currentBaseDealId) : null,
                    nowDateForCall, // eventDate
                    'Презентация', // hotName - PHP: null
                    props.reportContactId
                        ? String(props.reportContactId)
                        : null,
                    resultBatchCommands,
                );

                // PHP: if (!empty($this->currentTMCDealFromCurrentPres))
                const curTMCDeal = props.currentTMCDealFromCurrentPres;
                if (curTMCDeal && curTMCDeal.ID) {
                    // Check if curTMCDeal and its ID exist
                    // PHP: if (!empty($curTMCDeal['ASSIGNED_BY_ID']))
                    const tmcUserId = curTMCDeal.ASSIGNED_BY_ID;
                    if (tmcUserId) {
                        currentBtxDateTime = new Date(
                            currentBtxDateTime.getTime() + 1000,
                        ); // PHP: +4 seconds
                        nowDateForCall =
                            this.formatBtxDateTime(currentBtxDateTime);

                        this.logger.log(
                            `Calling BitrixListFlowService.getBatchListFlow (Report Presentation Done for TMC) at ${nowDateForCall}`,
                        );
                        resultBatchCommands =
                            BitrixListFlowService.getBatchListFlow(
                                props.hook,
                                props.bitrixLists,
                                'presentation',
                                'Презентация',
                                'done', // action
                                planDeadlineForLogic, // PHP uses $planDeadline directly here
                                String(tmcUserId), // PHP: $tmcUserId for eventUserGroupId
                                String(tmcUserId), // PHP: $tmcUserId for itemUserGroupId
                                String(props.planResponsibleId ?? ''), // PHP: $this->planResponsibleId for responsibleId
                                String(props.entityId),
                                `Презентация по заявке ТМЦ ${props.comment}`, // comment
                                props.workStatus?.current || null,
                                props.resultStatus,
                                props.noresultReason?.current || null,
                                props.failReason?.current || null,
                                props.failType?.current || null,
                                currentDealIds.map(id => String(id)),
                                currentBaseDealId
                                    ? String(currentBaseDealId)
                                    : null,
                                nowDateForCall, // eventDate
                                'Презентация', // hotName - PHP: null
                                props.reportContactId
                                    ? String(props.reportContactId)
                                    : null,
                                resultBatchCommands,
                            );
                    }
                }
            }

            // PHP: if ($this->isPlanned && $this->isPlanActive == true && $planEventType)
            // Assuming isPlanActive is implicitly true if an event is planned
            if (props.isPlanned && planEventTypeForLogic) {
                let deadlineForPlanCall = planDeadlineForLogic;

                // finalPlanEventType, finalPlanEventTypeName, finalPlanComment are derived from earlier logic
                // based on isExpired, currentReportEvent, and currentPlanEvent.
                // eventAction is also set based on isExpired.

                currentBtxDateTime = new Date(
                    currentBtxDateTime.getTime() + 1000,
                ); // Further increment
                nowDateForCall = this.formatBtxDateTime(currentBtxDateTime);

                this.logger.log(
                    `Calling BitrixListFlowService.getBatchListFlow (Plan Next/Expired Event) at ${nowDateForCall}`,
                );
                resultBatchCommands = BitrixListFlowService.getBatchListFlow(
                    props.hook,
                    props.bitrixLists,
                    planEventTypeForLogic ?? '',
                    planEventTypeNameForLogic, // Use the already determined name
                    eventAction, // This was 'plan' or 'expired' based on props.isExpired
                    deadlineForPlanCall,
                    String(props.planCreatedId ?? ''),
                    String(props.planResponsibleId ?? ''),
                    String(props.planTmcId ?? ''),
                    String(props.entityId),
                    planComment, // Use the fully constructed planComment
                    props.workStatus?.current || null,
                    props.resultStatus,
                    props.noresultReason?.current || null,
                    props.failReason?.current || null,
                    props.failType?.current || null,
                    currentDealIds.map(id => String(id)),
                    currentBaseDealId ? String(currentBaseDealId) : null,
                    nowDateForCall,
                    planEventTypeNameForLogic, // hotName should be the name of the event being planned
                    props.planContactId ? String(props.planContactId) : null,
                    resultBatchCommands,
                );
            }

            this.logger.log(
                'getListBatchFlow processing completed:',
                resultBatchCommands,
            );
            return resultBatchCommands;
        } catch (error: any) {
            this.logger.error(
                `Error in EventReportListFlowService.getListBatchFlow: ${error.message}`,
                error.stack,
            );
            // It's important to return resultBatchCommands even in case of an error,
            // as the PHP version accumulates commands and doesn't necessarily stop on one failing BitrixListFlowService call.
            return resultBatchCommands;
        }
    }
}
