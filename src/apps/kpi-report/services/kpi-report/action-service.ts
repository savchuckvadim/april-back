import { Injectable } from "@nestjs/common";
import { IFieldItem } from "src/modules/portal/interfaces/portal.interface";
import { Filter, FilterCode, FilterInnerCode } from "../../dto/kpi.dto";




@Injectable()
export class ActionService {
    getActionWithTypeData(actionType: IFieldItem, action: IFieldItem): Filter {
        const result: any = {};

        const atCode = actionType.code;
        const acCode = action.code;

        switch (acCode) {
            case 'plan':
            case 'done': {
                const { actionName } = this.getFeminineActionForm(acCode);
                if (['xo', 'call', 'call_in_progress', 'call_in_money'].includes(atCode)) {
                    result.innerCode = `call_${acCode}`;
                    result.name = `Звонок`;

                } else if (['presentation', 'presentation_uniq', 'presentation_contact_uniq'].includes(atCode)) {
                    result.innerCode = `${atCode}_${acCode}` as FilterInnerCode;
                    const { actionTypeName } = this.getFeminineActionTypeForm(atCode);
                    result.name = ` ${actionTypeName}`;

                } else if (
                    ['ev_success', 'ev_fail'].includes(atCode) &&
                    acCode !== 'plan'
                ) {
                    result.innerCode = `${atCode}_${acCode}` as FilterInnerCode;
                    result.name = actionType.name;
                } else {
                    break;
                }
                if (actionName) {
                    result.name = `${actionName} ${result.name}`;
                }
                result.code = `${atCode}_${acCode}` as FilterCode;
                result.actionItem = action;
                result.actionTypeItem = actionType;
                break;
            }

            case 'act_send': {
                if (
                    [
                        'ev_offer',
                        'ev_offer_pres',
                        'ev_invoice',
                        'ev_invoice_pres',
                        'ev_contract'
                    ].includes(atCode)
                ) {
                    result.code = `${atCode}_${acCode}` as FilterCode;
                    result.innerCode = `${atCode}_${acCode}` as FilterInnerCode;

                    result.name = actionType.name;

                    if (atCode === 'ev_offer') {
                        result.name = 'КП';
                    } else if (atCode === 'ev_offer_pres') {
                        result.name = 'КП после презентации';
                    }

                    result.actionItem = action;
                    result.actionTypeItem = actionType;
                }

                break;
            }

            default:
                break;
        }
        result.order = this.getActionOrder(result.innerCode);
        return result as Filter;
    }

    // 🔤 Аналог функции для женского рода
    private getFeminineActionForm(actionCode: string,): { actionName: string, } {
        // TODO: адаптируй под свою логику
        // Пример: если value = "проведён", вернуть "проведена"
        // Тут можно подключить отдельный словарь или API
        let actionName = ''

        if (actionCode === 'plan') {
            actionName = 'План'
        }

        return { actionName };
    }

    private getFeminineActionTypeForm(actionTypeCode: string): { actionTypeName: string } {
        // TODO: адаптируй под свою логику
        // Пример: если value = "проведён", вернуть "проведена"
        // Тут можно подключить отдельный словарь или API

        let actionTypeName = ''

        if (actionTypeCode === 'presentation') {
            actionTypeName = 'Презентация'
        } else if (actionTypeCode === 'presentation_uniq') {
            actionTypeName = 'През. уникальная'
        } else if (actionTypeCode === 'presentation_contact_uniq') {
            actionTypeName = 'През. по контакту'
        }

        return { actionTypeName };
    }

    private getActionOrder(actionCode: FilterInnerCode): number {
        switch (actionCode) {
            case 'call_plan':
                return 1;
            case 'call_done':
                return 2;
            case 'presentation_plan':
                return 3;
            case 'presentation_done':
                return 4;
            case 'presentation_uniq_plan':
                return 5;
            case 'presentation_uniq_done':
                return 6;
            case 'presentation_contact_uniq_plan':
                return 7;
            case 'presentation_contact_uniq_done':
                return 8;
            case 'ev_offer_act_send':
                return 9;
            case 'ev_offer_pres_act_send':
                return 10;
            case 'ev_invoice_act_send':
                return 11;
            case 'ev_invoice_pres_act_send':
                return 12;
            case 'ev_contract_act_send':
                return 13;
            case 'ev_success_done':
                return 14;
            case 'ev_fail_done':
                return 15;
            default:
                return 0;
        }
    }
}
