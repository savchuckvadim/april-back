import { EnumOrkEventAction, EnumOrkEventCommunication, EnumOrkEventInitiative, EnumOrkEventType, EnumOrkFieldCode, OrkFields } from "@/modules/ork-history-bx-list"




export enum EnumCommunicationCode {
    incoming_call_plan = `${EnumOrkEventCommunication.ec_ork_call}_${EnumOrkEventInitiative.ei_ork_incoming}_${EnumOrkEventAction.ea_ork_plan}`, //Входящий звонок запланирован
    incoming_edo_plan = `${EnumOrkEventCommunication.ec_ork_edo}_${EnumOrkEventInitiative.ei_ork_incoming}_${EnumOrkEventAction.ea_ork_plan}`,  //Входящий ЭДО запланирован
    incoming_face_plan = `${EnumOrkEventCommunication.ec_ork_face}_${EnumOrkEventInitiative.ei_ork_incoming}_${EnumOrkEventAction.ea_ork_plan}`, //Входящий выезд запланирован
    incoming_mail_plan = `${EnumOrkEventCommunication.ec_ork_mail}_${EnumOrkEventInitiative.ei_ork_incoming}_${EnumOrkEventAction.ea_ork_plan}`, //Входящий письмо запланирован
    incoming_signal_plan = `${EnumOrkEventCommunication.ec_ork_signal}_${EnumOrkEventInitiative.ei_ork_incoming}_${EnumOrkEventAction.ea_ork_plan}`, //Входящий СС запланирован
    outgoing_call_plan = `${EnumOrkEventCommunication.ec_ork_call}_${EnumOrkEventInitiative.ei_ork_outgoing}_${EnumOrkEventAction.ea_ork_plan}`, //Исходящий звонок запланирован
    outgoing_edo_plan = `${EnumOrkEventCommunication.ec_ork_edo}_${EnumOrkEventInitiative.ei_ork_outgoing}_${EnumOrkEventAction.ea_ork_plan}`, //Исходящий ЭДО заплани
    outgoing_face_plan = `${EnumOrkEventCommunication.ec_ork_face}_${EnumOrkEventInitiative.ei_ork_outgoing}_${EnumOrkEventAction.ea_ork_plan}`, //Исходящий выезд запланирован
    outgoing_mail_plan = `${EnumOrkEventCommunication.ec_ork_mail}_${EnumOrkEventInitiative.ei_ork_outgoing}_${EnumOrkEventAction.ea_ork_plan}`, //Исходящий письмо запланирован
    outgoing_signal_plan = `${EnumOrkEventCommunication.ec_ork_signal}_${EnumOrkEventInitiative.ei_ork_outgoing}_${EnumOrkEventAction.ea_ork_plan}`, //Исходящий СС запланирован

    incoming_call_done = `${EnumOrkEventCommunication.ec_ork_call}_${EnumOrkEventInitiative.ei_ork_incoming}_${EnumOrkEventAction.ea_ork_done}`, //Входящий звонок запланирован
    incoming_edo_done = `${EnumOrkEventCommunication.ec_ork_edo}_${EnumOrkEventInitiative.ei_ork_incoming}_${EnumOrkEventAction.ea_ork_done}`,  //Входящий ЭДО запланирован
    incoming_face_done = `${EnumOrkEventCommunication.ec_ork_face}_${EnumOrkEventInitiative.ei_ork_incoming}_${EnumOrkEventAction.ea_ork_done}`, //Входящий выезд запланирован
    incoming_mail_done = `${EnumOrkEventCommunication.ec_ork_mail}_${EnumOrkEventInitiative.ei_ork_incoming}_${EnumOrkEventAction.ea_ork_done}`, //Входящий письмо запланирован
    incoming_signal_done = `${EnumOrkEventCommunication.ec_ork_signal}_${EnumOrkEventInitiative.ei_ork_incoming}_${EnumOrkEventAction.ea_ork_done}`, //Входящий СС запланирован
    outgoing_call_done = `${EnumOrkEventCommunication.ec_ork_call}_${EnumOrkEventInitiative.ei_ork_outgoing}_${EnumOrkEventAction.ea_ork_done}`, //Исходящий звонок запланирован
    outgoing_edo_done = `${EnumOrkEventCommunication.ec_ork_edo}_${EnumOrkEventInitiative.ei_ork_outgoing}_${EnumOrkEventAction.ea_ork_done}`, //Исходящий ЭДО заплани
    outgoing_face_done = `${EnumOrkEventCommunication.ec_ork_face}_${EnumOrkEventInitiative.ei_ork_outgoing}_${EnumOrkEventAction.ea_ork_done}`, //Исходящий выезд запланирован
    outgoing_mail_done = `${EnumOrkEventCommunication.ec_ork_mail}_${EnumOrkEventInitiative.ei_ork_outgoing}_${EnumOrkEventAction.ea_ork_done}`, //Исходящий письмо запланирован
    outgoing_signal_done = `${EnumOrkEventCommunication.ec_ork_signal}_${EnumOrkEventInitiative.ei_ork_outgoing}_${EnumOrkEventAction.ea_ork_done}`, //Исходящий СС запланирован

}

// Звонок/Выезд/Письмо/Эдо/СС Входящий/Исзодящий Запланирован/Состояля

export const OrkReportCommunicationItems = {
    [OrkFields.ork_event_action.items.ea_ork_plan.code as EnumOrkEventAction]: { //запланирован
        [OrkFields.ork_event_initiative.items.ei_ork_incoming.code as EnumOrkEventInitiative]: { //Входящий
            [OrkFields.event_communication.items.ec_ork_call.code as EnumOrkEventCommunication]: { //звонок
                name: 'Входящий звонок запланирован',
                code: EnumCommunicationCode.incoming_call_plan ,
                type: 'call',
                isActive: false,

            },
            [OrkFields.event_communication.items.ec_ork_face.code as EnumOrkEventCommunication]: { //выезд
                name: 'Прием клиента в офисе запланирован',
                code: EnumCommunicationCode.incoming_face_plan,
                type: 'face',
                isActive: true,

            },
            [OrkFields.event_communication.items.ec_ork_mail.code as EnumOrkEventCommunication]: { //письмо
                name: 'Входящий письмо запланирован',
                code: EnumCommunicationCode.incoming_mail_plan,
                type: 'mail',
                isActive: false,
            },
            [OrkFields.event_communication.items.ec_ork_edo.code as EnumOrkEventCommunication]: { //эдо
                name: 'Входящий документ ЭДО запланирован',
                code: EnumCommunicationCode.incoming_edo_plan,
                type: 'edo',
                isActive: true,
            },
            [OrkFields.event_communication.items.ec_ork_signal.code as EnumOrkEventCommunication]: { //СС
                name: 'Входящий СС запланирован',
                code: EnumCommunicationCode.incoming_signal_plan,
                type: 'signal',
                isActive: true,
            },
        },
        [OrkFields.ork_event_initiative.items.ei_ork_outgoing.code as EnumOrkEventInitiative]: { //Исходящий
            [OrkFields.event_communication.items.ec_ork_call.code as EnumOrkEventCommunication]: { //звонок
                name: 'Исходящий звонок запланирован',
                code: EnumCommunicationCode.outgoing_call_plan,
                type: 'call',
                isActive: true,
            },
            [OrkFields.event_communication.items.ec_ork_face.code as EnumOrkEventCommunication]: { //выезд
                name: 'Исходящий выезд запланирован',
                code: EnumCommunicationCode.outgoing_face_plan,
                type: 'face',
                isActive: true,
            },
            [OrkFields.event_communication.items.ec_ork_mail.code as EnumOrkEventCommunication]: { //письмо
                name: 'Исходящее письмо запланирован',
                code: EnumCommunicationCode.outgoing_mail_plan,
                type: 'mail',
                isActive: true,
            },
            [OrkFields.event_communication.items.ec_ork_edo.code as EnumOrkEventCommunication]: { //эдо
                name: 'Исходящий ЭДО запланирован',
                code: EnumCommunicationCode.outgoing_edo_plan,
                type: 'edo',
                isActive: false,
            },
            [OrkFields.event_communication.items.ec_ork_signal.code as EnumOrkEventCommunication]: { //СС
                name: 'Исходящий СС запланирован',
                code: EnumCommunicationCode.outgoing_signal_plan,
                type: 'signal',
                isActive: false,
            },
        },
    },
    [OrkFields.ork_event_action.items.ea_ork_done.code as EnumOrkEventAction]: { //состоялся
        [OrkFields.ork_event_initiative.items.ei_ork_incoming.code as EnumOrkEventInitiative]: { //Входящий
            [OrkFields.event_communication.items.ec_ork_call.code as EnumOrkEventCommunication]: { //звонок
                name: 'Входящий звонок состоялся',
                code: EnumCommunicationCode.incoming_call_done,
                type: 'call',
                isActive: true,
            },
            [OrkFields.event_communication.items.ec_ork_face.code as EnumOrkEventCommunication]: { //выезд
                name: 'Приём клиента в офисе состоялся',
                code: EnumCommunicationCode.incoming_face_done,
                type: 'face',
                isActive: true,
            },
            [OrkFields.event_communication.items.ec_ork_mail.code as EnumOrkEventCommunication]: { //письмо
                name: 'Входящее письмо',
                code: EnumCommunicationCode.incoming_mail_done,
                type: 'mail',
                isActive: true,
            },
            [OrkFields.event_communication.items.ec_ork_edo.code as EnumOrkEventCommunication]: { //эдо
                name: 'Входящий ЭДО',
                code: EnumCommunicationCode.incoming_edo_done,
                type: 'edo',
                isActive: true,
            },
            [OrkFields.event_communication.items.ec_ork_signal.code as EnumOrkEventCommunication]: { //СС
                name: 'Входящий СС состоялся',
                code: EnumCommunicationCode.incoming_signal_done,
                type: 'signal',
                isActive: true,
            },
        },
        [OrkFields.ork_event_initiative.items.ei_ork_outgoing.code as EnumOrkEventInitiative]: { //Исходящий
            [OrkFields.event_communication.items.ec_ork_call.code as EnumOrkEventCommunication]: { //звонок
                name: 'Исходящий звонок состоялся',
                    code: EnumCommunicationCode.outgoing_call_done,
                type: 'call',
                isActive: true,
            },
            [OrkFields.event_communication.items.ec_ork_face.code as EnumOrkEventCommunication]: { //выезд
                name: 'Исходящий выезд состоялся',
                code: EnumCommunicationCode.outgoing_face_done,
                type: 'face',
                isActive: true,
            },
            [OrkFields.event_communication.items.ec_ork_mail.code as EnumOrkEventCommunication]: { //письмо
                name: 'Исходящee письмо отправлено',
                code: EnumCommunicationCode.outgoing_mail_done,
                type: 'mail',
                isActive: true,
            },
            [OrkFields.event_communication.items.ec_ork_edo.code as EnumOrkEventCommunication]: { //эдо
                name: 'Исходящий ЭДО состоялся',
                code: EnumCommunicationCode.outgoing_edo_done,
                type: 'edo',
                isActive: true,
            },
          
        }
    }
}
