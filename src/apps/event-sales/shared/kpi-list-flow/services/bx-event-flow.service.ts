import { Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid'; // For generating unique IDs

// --- Helper Interfaces (derived from PHP structure) ---
interface BitrixList {
    type: string; // 'kpi', 'history', etc.
    group: string; // 'sales', etc.
    bitrixId: string | number;
    bitrixfields?: BitrixListField[];
}

interface BitrixListField {
    code: string;
    bitrixCamelId: string | number;
    items?: BitrixListFieldItem[];
}

interface BitrixListFieldItem {
    code: string;
    bitrixId: string | number;
}

interface WorkStatus {
    code: string;
    // name?: string;
}

interface Reason {
    code: string;
    // name?: string;
}

type BatchCommands = Record<string, any>;

// --- Stub for BitrixListService (external dependency) ---
// This would typically be an injectable service in NestJS
class BitrixListServiceStub {
    public static getBatchCommandSetItem(
        hook: string,
        bitrixListId: string | number,
        fieldsData: Record<string, any>,
        code: string,
    ): any {
        console.warn(
            `STUB: BitrixListService.getBatchCommandSetItem called with listId: ${bitrixListId}, code: ${code}`,
        );
        // Return a representation of the command structure expected by the calling code
        return `crm.lists.element.add.json?IBLOCK_TYPE_ID=lists&IBLOCK_ID=${bitrixListId}&ELEMENT_CODE=${code}&FIELDS=${JSON.stringify(fieldsData)}`;
    }
}

@Injectable()
export class BitrixListFlowService {
    // --- Stubs for internal static methods from the PHP class ---
    // These would be private static methods within this class

    private static getEventType(eventType: string): string {
        // console.warn('getEventType STUB CALLED with:', eventType);
        // Based on PHP logic:
        // Холодный звонок	event_type	xo
        // Звонок	event_type	call
        // Презентация	event_type	presentation
        // ... many other types
        if (
            eventType === 'call' ||
            eventType === 'warm' ||
            eventType === 'supply'
        ) {
            return 'call';
        }
        if (eventType === 'presentation') {
            return 'presentation';
        }
        if (
            eventType === 'hot' ||
            eventType === 'inProgress' ||
            eventType === 'in_progress'
        ) {
            return 'call_in_progress';
        }
        if (
            eventType === 'moneyAwait' ||
            eventType === 'money_await' ||
            eventType === 'money'
        ) {
            return 'call_in_money';
        }
        if (eventType === 'fail') {
            return 'ev_fail';
        }
        if (eventType === 'success') {
            return 'ev_success';
        }
        return 'xo'; // Default from PHP if no other condition met early
    }

    private static getCurrentWorkStatusCode(
        workStatus: WorkStatus | null,
        currentEventType: string,
    ): string {
        // console.warn('getCurrentWorkStatusCode STUB CALLED with:', workStatus, currentEventType);
        // Based on PHP logic:
        // В работе	op_work_status	op_status_in_work
        // ... other statuses
        if (workStatus?.code) {
            const code = workStatus.code;
            switch (code) {
                case 'inJob':
                    if (currentEventType === 'hot')
                        return 'op_status_in_progress';
                    if (currentEventType === 'moneyAwait')
                        return 'op_status_money_await';
                    return 'op_status_in_work';
                case 'setAside':
                    return 'op_status_in_long';
                case 'fail':
                    return 'op_status_fail';
                case 'success':
                    return 'op_status_success';
                default:
                    break;
            }
        }
        return 'op_status_in_work'; // Default
    }

    private static getResultStatus(resultStatus: string | null): string {
        // console.warn('getResultStatus STUB CALLED with:', resultStatus);
        if (resultStatus !== 'result' && resultStatus !== 'new') {
            return 'op_call_result_no';
        }
        return 'op_call_result_yes';
    }

    private static getPerspectStatus(failTypeCode: string | null): string {
        // console.warn('getPerspectStatus STUB CALLED with:', failTypeCode);
        if (!failTypeCode) return 'op_prospects_good';
        switch (failTypeCode) {
            case 'op_prospects_good':
            case 'op_prospects_nopersp':
            case 'op_prospects_nophone':
            case 'op_prospects_company':
                return failTypeCode;
            case 'garant':
            case 'go':
            case 'territory':
            case 'autsorc':
            case 'depend':
                return `op_prospects_${failTypeCode}`;
            case 'accountant':
                return 'op_prospects_acountant';
            case 'failure':
                return 'op_prospects_fail';
            default:
                return 'op_prospects_good';
        }
    }

    private static getFailType(failReasonCode: string | null): string {
        // console.warn('getFailType STUB CALLED with:', failReasonCode);
        return failReasonCode || ''; // In PHP, it directly returns $failReason
    }

    private static getBtxListCurrentData(
        bitrixList: BitrixList,
        code: string, // Field code like 'sales_kpi_event_date'
        listCode: string | null, // Code of the list item, e.g., 'xo'
    ): string | number | null {
        // console.warn('getBtxListCurrentData STUB CALLED with list:', bitrixList.bitrixId, 'fieldCode:', code, 'listCode:', listCode);
        /**
         * This is a complex stub. The original PHP function:
         * 1. Finds a field in bitrixList.bitrixfields by 'code'.
         * 2. If found, it gets 'bitrixCamelId' as fieldBtxId.
         * 3. If listCode is provided, it searches within that field's 'items' for an item matching listCode.
         * 4. If item found, it gets item's 'bitrixId' as fieldItemBtxId.
         * Returns fieldBtxId if listCode is null, otherwise fieldItemBtxId.
         * Returns false if not found (mapped to null here).
         */
        if (bitrixList.bitrixfields) {
            const btxField = bitrixList.bitrixfields.find(f => f.code === code);
            if (btxField) {
                if (!listCode) {
                    return btxField.bitrixCamelId;
                }
                if (btxField.items) {
                    const btxFieldItem = btxField.items.find(
                        i => i.code === listCode,
                    );
                    if (btxFieldItem) {
                        return btxFieldItem.bitrixId;
                    }
                }
            }
        }
        return null; // PHP returned false, null is more idiomatic in TS for "not found ID"
    }

    public static getBatchListFlow(
        hook: string,
        bitrixLists: BitrixList[],
        eventType: string,
        eventTypeName: string,
        eventAction: string,
        deadline: string | null,
        created: string,
        responsible: string,
        suresponsible: string,
        companyId: string | number,
        comment: string,
        workStatus: WorkStatus | null,
        resultStatus: string | null,
        noresultReason: Reason | null,
        failReason: Reason | null,
        failType: Reason | null,
        dealIds: (string | number)[] | null,
        currentBaseDealId: string | number | null,
        nowDateInput?: string | null,
        hotNameInput?: string | null,
        contactId?: string | number | null,
        resultBatchCommandsInput: BatchCommands = {},
    ): BatchCommands {
        // Clone to avoid modifying the input object directly, mimicking PHP's array copy-on-write (for top level)
        const resultBatchCommands: BatchCommands = {
            ...resultBatchCommandsInput,
        };

        try {
            const nowDate =
                nowDateInput ||
                new Date()
                    .toLocaleString('ru-RU', {
                        timeZone: 'Europe/Moscow',
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                    })
                    .replace(',', ''); // Format: DD.MM.YYYY HH:MI:SS

            let eventActionName = 'Запланирован';
            let evTypeName = 'Звонок';
            let nextCommunication: string | null = deadline;
            let isUniqPresPlan = false;
            let isUniqPresReport = false;

            const crmValue: Record<string, string> = { n0: `CO_${companyId}` };
            let dealIndex = 1;
            if (contactId) {
                dealIndex = 2;
                crmValue['n1'] = `C_${contactId}`;
            }

            if (dealIds && dealIds.length > 0) {
                dealIds.forEach((dealId, key) => {
                    crmValue[`n${key + dealIndex}`] = `D_${dealId}`;
                });
            }

            if (eventType === 'xo' || eventType === 'cold') {
                evTypeName = 'Холодный звонок';
            } else if (
                eventType === 'warm' ||
                eventType === 'call' ||
                eventType === 'supply'
            ) {
                evTypeName = 'Звонок';
            } else if (eventType === 'presentation') {
                evTypeName = 'Презентация';
                eventActionName = 'Запланирована';
            } else if (
                eventType === 'hot' ||
                eventType === 'inProgress' ||
                eventType === 'in_progress'
            ) {
                evTypeName = 'Звонок по решению';
            } else if (
                eventType === 'money' ||
                eventType === 'moneyAwait' ||
                eventType === 'money_await'
            ) {
                evTypeName = 'Звонок по оплате';
            }

            let mutableEventAction = eventAction; // PHP $eventAction is modified

            if (mutableEventAction === 'expired') {
                mutableEventAction = 'pound';
                eventActionName = 'Перенос';
            } else if (mutableEventAction === 'done') {
                eventActionName = 'Состоялся';
                if (eventType === 'presentation') {
                    eventActionName = 'Состоялась';
                    isUniqPresReport = true;
                }
            } else if (mutableEventAction === 'plan') {
                if (eventType === 'presentation') {
                    isUniqPresPlan = true;
                }
            } else if (mutableEventAction === 'nodone') {
                nextCommunication = null;
                eventActionName = 'Не Состоялся';
                mutableEventAction = 'act_noresult_fail';
                if (eventType === 'presentation') {
                    eventActionName = 'Не Состоялась';
                }
                if (workStatus?.code === 'fail') {
                    eventActionName += ': Отказ';
                }
            }

            if (mutableEventAction !== 'plan') {
                if (
                    workStatus?.code !== 'inJob' &&
                    workStatus?.code !== 'setAside'
                ) {
                    nextCommunication = null;
                }
            }

            let hotName = hotNameInput || `${evTypeName} ${eventActionName}`;

            if (eventType === 'success') {
                hotName = 'Продажа';
            } else if (eventType === 'fail') {
                hotName = 'Отказ';
            }

            const xoFields: Array<{
                code: string;
                name: string;
                value?: any;
                list?: { code: string | null; name?: string };
            }> = [
                { code: 'event_date', name: 'Дата', value: nowDate },
                { code: 'event_title', name: 'Название', value: hotName },
                {
                    code: 'plan_date',
                    name: 'Дата Следующей коммуникации',
                    value: nextCommunication,
                },
                { code: 'author', name: 'Автор', value: created },
                {
                    code: 'responsible',
                    name: 'Ответственный',
                    value: responsible,
                },
                { code: 'su', name: 'Соисполнитель', value: suresponsible },
                { code: 'crm', name: 'crm', value: crmValue },
                {
                    code: 'crm_company',
                    name: 'crm_company',
                    value: { n0: `CO_${companyId}` },
                },
                {
                    code: 'manager_comment',
                    name: 'Комментарий',
                    value: comment,
                },
                {
                    code: 'event_type',
                    name: 'Тип События',
                    list: {
                        code: BitrixListFlowService.getEventType(eventType),
                        name: eventTypeName,
                    },
                },
                {
                    code: 'event_action',
                    name: 'Событие Действие',
                    list: { code: mutableEventAction },
                },
                {
                    code: 'op_work_status',
                    name: 'Статус Работы',
                    list: {
                        code: BitrixListFlowService.getCurrentWorkStatusCode(
                            workStatus,
                            eventType,
                        ),
                    },
                },
                {
                    code: 'op_result_status',
                    name: 'Результативность',
                    list: {
                        code: BitrixListFlowService.getResultStatus(
                            resultStatus,
                        ),
                    },
                },
            ];

            if (contactId) {
                xoFields.push({
                    code: 'crm_contact',
                    name: 'crm_contact',
                    value: { n0: `C_${contactId}` },
                });
            }

            if (resultStatus !== 'result' && resultStatus !== 'new') {
                if (noresultReason?.code) {
                    xoFields.push({
                        code: 'op_noresult_reason',
                        name: 'Тип Нерезультативности',
                        list: { code: noresultReason.code },
                    });
                }
            } else {
                xoFields.push({
                    code: 'op_noresult_reason',
                    name: 'Тип Нерезультативности',
                    list: { code: null }, // Explicitly null as in PHP
                });
            }

            if (workStatus?.code) {
                const workStatusCode = workStatus.code;
                if (workStatusCode === 'fail') {
                    if (failType?.code) {
                        xoFields.push({
                            code: 'op_prospects_type',
                            name: 'Перспективность',
                            list: {
                                code: BitrixListFlowService.getPerspectStatus(
                                    failType.code,
                                ),
                            },
                        });
                        if (failType.code === 'failure') {
                            if (failReason?.code) {
                                xoFields.push({
                                    code: 'op_fail_reason',
                                    name: 'ОП Причина Отказа',
                                    list: {
                                        code: BitrixListFlowService.getFailType(
                                            failReason.code,
                                        ),
                                    },
                                });
                            }
                        }
                    }
                } else {
                    xoFields.push({
                        code: 'op_prospects_type',
                        name: 'Перспективность',
                        list: { code: 'op_prospects_good' },
                    });
                }
            }

            const fieldsDataInitial: Record<string, any> = { NAME: hotName };

            for (const bitrixList of bitrixLists) {
                if (
                    (bitrixList.type === 'kpi' ||
                        bitrixList.type === 'history') &&
                    bitrixList.group === 'sales'
                ) {
                    const fieldsDataCurrent = { ...fieldsDataInitial };

                    for (const xoValue of xoFields) {
                        const fieldCode = `${bitrixList.group}_${bitrixList.type}_${xoValue.code}`;
                        const btxId =
                            BitrixListFlowService.getBtxListCurrentData(
                                bitrixList,
                                fieldCode,
                                null,
                            );

                        if (btxId !== null) {
                            // Check explicitly for 'value' property existence before assigning
                            if (
                                xoValue.hasOwnProperty('value') &&
                                xoValue.value !== undefined &&
                                xoValue.value !== null
                            ) {
                                fieldsDataCurrent[btxId as string] =
                                    xoValue.value;
                            }
                            // Process 'list' property
                            if (
                                xoValue.list &&
                                xoValue.list.code !== undefined
                            ) {
                                // Ensure list and list.code exist
                                const btxItemId =
                                    BitrixListFlowService.getBtxListCurrentData(
                                        bitrixList,
                                        fieldCode,
                                        xoValue.list.code,
                                    );
                                if (btxItemId !== null) {
                                    fieldsDataCurrent[btxId as string] =
                                        btxItemId;
                                }
                            }
                        }
                    }
                    // PHP: $uniqueHash = md5(uniqid(rand(), true)); $code = $uniqueHash;
                    // JS/TS: Using uuid for better uniqueness.
                    const listElementCode = uuidv4();
                    const fullCode = `${bitrixList.type}_${companyId}_${listElementCode}`;

                    const command =
                        BitrixListServiceStub.getBatchCommandSetItem(
                            hook,
                            bitrixList.bitrixId,
                            fieldsDataCurrent,
                            fullCode,
                        );
                    resultBatchCommands[`set_list_item_${fullCode}`] = command;
                }
            }

            // for uniq pres
            if (
                (resultStatus === 'result' || resultStatus === 'new') &&
                (isUniqPresPlan || isUniqPresReport)
            ) {
                // Find 'event_type' in xoFields and modify its list code
                const eventTypeField = xoFields.find(
                    f => f.code === 'event_type',
                );
                if (eventTypeField && eventTypeField.list) {
                    eventTypeField.list.code = 'presentation_uniq';
                }

                let codeForUniqPres = '';
                if (isUniqPresPlan) {
                    codeForUniqPres = `${companyId}_${currentBaseDealId}_plan`;
                }
                if (isUniqPresReport) {
                    codeForUniqPres = `${companyId}_${currentBaseDealId}_done`;
                    if (responsible !== suresponsible) {
                        codeForUniqPres = `${companyId}_${currentBaseDealId}_done_${responsible}`;
                    }
                }

                if (codeForUniqPres) {
                    for (const bitrixList of bitrixLists) {
                        if (
                            bitrixList.type === 'kpi' &&
                            bitrixList.group === 'sales'
                        ) {
                            const fieldsDataUniqPres = { ...fieldsDataInitial }; // Reset for each list
                            for (const xoValue of xoFields) {
                                // Iterate over (potentially modified) xoFields
                                const fieldCode = `${bitrixList.group}_${bitrixList.type}_${xoValue.code}`;
                                const btxId =
                                    BitrixListFlowService.getBtxListCurrentData(
                                        bitrixList,
                                        fieldCode,
                                        null,
                                    );
                                if (btxId !== null) {
                                    if (
                                        xoValue.hasOwnProperty('value') &&
                                        xoValue.value !== undefined &&
                                        xoValue.value !== null
                                    ) {
                                        fieldsDataUniqPres[btxId as string] =
                                            xoValue.value;
                                    }
                                    if (
                                        xoValue.list &&
                                        xoValue.list.code !== undefined
                                    ) {
                                        const btxItemId =
                                            BitrixListFlowService.getBtxListCurrentData(
                                                bitrixList,
                                                fieldCode,
                                                xoValue.list.code,
                                            );
                                        if (btxItemId !== null) {
                                            fieldsDataUniqPres[
                                                btxId as string
                                            ] = btxItemId;
                                        }
                                    }
                                }
                            }
                            const commandUniqPres =
                                BitrixListServiceStub.getBatchCommandSetItem(
                                    hook,
                                    bitrixList.bitrixId,
                                    fieldsDataUniqPres,
                                    codeForUniqPres,
                                );
                            resultBatchCommands[
                                `set_list_item_${codeForUniqPres}`
                            ] = commandUniqPres;
                        }
                    }
                }
            }
            return resultBatchCommands;
        } catch (th: any) {
            const errorMessages = {
                message: th.message,
                file: th.fileName || 'unknown', // Get from stack if possible
                line: th.lineNumber || -1, // Get from stack if possible
                trace: th.stack || 'no stack available',
            };
            console.error(
                'ERROR BitrixListFlowService.getBatchListFlow:',
                errorMessages,
            );
            // In PHP, errors were logged, and function might return partially completed $resultBatchCommands or null.
            // Here, we return commands accumulated so far, or an empty object if error was early.
            return resultBatchCommands;
        }
    }
}
