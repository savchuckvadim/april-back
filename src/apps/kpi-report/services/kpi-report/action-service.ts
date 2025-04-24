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
                if (['xo', 'call', 'call_in_progress', 'call_in_money'].includes(atCode)) {
                    result.innerCode = `call_${acCode}`;
                    result.name = `Звонок ${action.name}`;

                } else if (['presentation', 'presentation_uniq'].includes(atCode)) {
                    result.innerCode = `${atCode}_${acCode}` as FilterInnerCode;
                    result.name = `${actionType.name} ${this.getFeminineForm(action.name)}`;

                } else if (
                    ['ev_success', 'ev_fail'].includes(atCode) &&
                    acCode !== 'plan'
                ) {
                    result.innerCode = `${atCode}_${acCode}` as FilterInnerCode;
                    result.name = actionType.name;
                } else {
                    break;
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

        return result as Filter;
    }

    // 🔤 Аналог функции для женского рода
    private getFeminineForm(value: string): string {
        // TODO: адаптируй под свою логику
        // Пример: если value = "проведён", вернуть "проведена"
        // Тут можно подключить отдельный словарь или API
        return value;
    }
}
