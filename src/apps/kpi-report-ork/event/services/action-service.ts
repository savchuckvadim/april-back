import { Injectable } from '@nestjs/common';
import { IFieldItem } from 'src/modules/portal/interfaces/portal.interface';
import { Filter } from '../dto/kpi.dto';
import { FilterCode, FilterInnerCode } from '../type/ork-report-event.type';
import { EnumOrkEventAction, EnumOrkEventType } from '@/modules/ork-history-bx-list';


@Injectable()
export class ActionOrkEventService {
    getActionWithTypeData(actionType: IFieldItem, action: IFieldItem): Filter {
        const result: Record<string, any> = {};

        const atCode = actionType.code as EnumOrkEventType;
        const acCode = action.code as EnumOrkEventAction;

        switch (acCode) {
            case EnumOrkEventAction.ea_ork_plan:
            case EnumOrkEventAction.ea_ork_done: {
                const { actionName } = this.getFeminineActionForm(acCode);
                if (
                    [
                        EnumOrkEventType.et_ork_call_collect,
                        EnumOrkEventType.et_ork_info,
                        EnumOrkEventType.et_ork_info_garant,
                        EnumOrkEventType.et_ork_call_money,
                        EnumOrkEventType.et_ork_call_doc,
                        EnumOrkEventType.et_ork_edu,
                        EnumOrkEventType.et_ork_edu_uniq,
                        EnumOrkEventType.et_ork_edu_first,
                    ].includes(atCode)
                ) {
                    result.innerCode = `${atCode}_${acCode}`;
                    result.name = atCode === EnumOrkEventType.et_ork_call_collect
                        ? `Звонок по задолженности`
                        : atCode === EnumOrkEventType.et_ork_info
                            ? `Информация` : atCode === EnumOrkEventType.et_ork_info_garant
                                ? `Инфоповод Гарант`
                                : atCode === EnumOrkEventType.et_ork_call_money
                                    ? `Звонок по оплате`
                                    : atCode === EnumOrkEventType.et_ork_edu
                                        ? `Обучение`
                                        : atCode === EnumOrkEventType.et_ork_edu_uniq
                                            ? `Обучение(уникальное)`
                                            : atCode === EnumOrkEventType.et_ork_edu_first ? `Обучение первичное`
                                                : atCode === EnumOrkEventType.et_ork_call_doc
                                                    ? `Звонок по документам`
                                                    : `Звонок`;
                } else if (
                    [
                        EnumOrkEventType.et_ork_presentation,
                        EnumOrkEventType.et_ork_presentation_uniq,

                    ].includes(atCode)
                ) {
                    result.innerCode = `${atCode}_${acCode}` as FilterInnerCode;
                    const { actionTypeName } = atCode === EnumOrkEventType.et_ork_presentation_uniq ? { actionTypeName: 'През. уникальная' } : { actionTypeName: 'Презентация' }
                    // this.getFeminineActionTypeForm(atCode);
                    result.name = ` ${actionTypeName}`;
                } else if (
                    [EnumOrkEventType.ev_success, EnumOrkEventType.et_ork_fail].includes(atCode) &&
                    acCode !== EnumOrkEventAction.ea_ork_plan
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

            case EnumOrkEventAction.ea_ork_act_send: {
                if (
                    [
                        EnumOrkEventType.et_ork_offer,
                        EnumOrkEventType.et_ork_contract,
                        EnumOrkEventType.et_ork_invoice,
                        EnumOrkEventType.et_ork_doc_akt,
                        EnumOrkEventType.et_ork_contract,
                    ].includes(atCode)
                ) {
                    result.code = `${atCode}_${acCode}` as FilterCode;
                    result.innerCode = `${atCode}_${acCode}` as FilterInnerCode;

                    result.name = actionType.name;

                    if (atCode === EnumOrkEventType.et_ork_offer) {
                        result.name = 'КП';
                    }

                    result.actionItem = action;
                    result.actionTypeItem = actionType;
                }

                break;
            }

            default:
                break;
        }
        result.order = this.getActionOrder(result.innerCode as FilterInnerCode);
        return result as Filter;
    }

    // 🔤 Аналог функции для женского рода
    private getFeminineActionForm(actionCode: string): { actionName: string } {
        // TODO: адаптируй под свою логику
        // Пример: если value = "проведён", вернуть "проведена"
        // Тут можно подключить отдельный словарь или API
        let actionName = 'Совершен';

        if (actionCode.includes('plan')) {
            actionName = 'План';
        }

        return { actionName };
    }

    private getFeminineActionTypeForm(actionTypeCode: string): {
        actionTypeName: string;
    } {
        // TODO: адаптируй под свою логику
        // Пример: если value = "проведён", вернуть "проведена"
        // Тут можно подключить отдельный словарь или API

        let actionTypeName = '';

        if (actionTypeCode === 'presentation') {
            actionTypeName = 'Презентация';
        } else if (actionTypeCode === 'presentation_uniq') {
            actionTypeName = 'През. уникальная';
        } else if (actionTypeCode === 'presentation_contact_uniq') {
            actionTypeName = 'През. по контакту';
        }

        return { actionTypeName };
    }

    private getActionOrder(actionCode: FilterInnerCode): number {
        switch (actionCode as FilterInnerCode) {
            case 'et_ork_call_ea_ork_plan':
                return 1;
            case 'et_ork_call_ea_ork_done':
                return 2;
            case 'et_ork_call_doc_ea_ork_pound':
                return 3;
            case 'et_ork_call_doc_ea_ork_act_noresult_fail':
                return 4;
            case 'et_ork_call_doc_ea_ork_plan':
                return 5;
            case 'et_ork_call_doc_ea_ork_done':
                return 6;
            case 'et_ork_call_doc_ea_ork_pound':
                return 7;
            case 'et_ork_call_ea_ork_act_noresult_fail':
                return 8;
            case 'et_ork_call_doc_ea_ork_plan':
                return 9;
            case 'et_ork_call_doc_ea_ork_done':
                return 10;
            case 'et_ork_call_doc_ea_ork_pound':
                return 11;
            case 'et_ork_call_doc_ea_ork_act_noresult_fail':
                return 12;
            case 'et_ork_call_doc_ea_ork_plan':
                return 13;
            case 'et_ork_call_doc_ea_ork_done':
                return 14;
            case 'et_ork_call_doc_ea_ork_pound':
                return 15;
            case 'et_ork_call_doc_ea_ork_act_noresult_fail':
                return 16;
            case 'et_ork_call_money_ea_ork_plan':
                return 17;
            case 'et_ork_call_money_ea_ork_done':
                return 18;
            case 'et_ork_call_money_ea_ork_pound':
                return 19;
            case 'et_ork_call_money_ea_ork_act_noresult_fail':
                return 20;
            case 'et_ork_call_collect_ea_ork_plan':
                return 21;
            case 'et_ork_call_collect_ea_ork_done':
                return 22;
            case 'et_ork_call_collect_ea_ork_pound':
                return 23;
            case 'et_ork_call_collect_ea_ork_act_noresult_fail':
                return 24;
            case 'et_ork_info_garant_ea_ork_plan':
                return 25;
            case 'et_ork_info_garant_ea_ork_done':
                return 26;
            case 'et_ork_info_garant_ea_ork_pound':
                return 27;
            case 'et_ork_info_garant_ea_ork_act_noresult_fail':
                return 28;
            case 'et_ork_presentation_ea_ork_plan':
                return 29;
            case 'et_ork_presentation_ea_ork_done':
                return 30;
            case 'et_ork_presentation_ea_ork_pound':
                return 31;
            case 'et_ork_presentation_ea_ork_act_noresult_fail':
                return 32;
            case 'et_ork_presentation_uniq_ea_ork_plan':
                return 33;
            case 'et_ork_presentation_uniq_ea_ork_done':
                return 34;
            case 'et_ork_presentation_uniq_ea_ork_pound':
                return 35;
            case 'et_ork_presentation_uniq_ea_ork_act_noresult_fail':
                return 36;
            case 'et_ork_edu_first_ea_ork_plan':
                return 37;
            case 'et_ork_edu_first_ea_ork_done':
                return 38;
            case 'et_ork_edu_first_ea_ork_pound':
                return 39;
            case 'et_ork_edu_first_ea_ork_act_noresult_fail':
                return 40;
            default:
                return 50;
        }
    }
}
