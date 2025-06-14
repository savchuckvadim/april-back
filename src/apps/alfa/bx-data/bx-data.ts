import { participants } from "./bx-participants-data";


export const dealData = {
    inn: {
        bitrixId: 'UF_CRM_1695372881',
        name: 'ИНН',
        type: 'string',

    },
    companyName: {
        bitrixId: 'UF_CRM_1743414243',
        name: 'Наименование компании',
        type: 'string',
    },
    directorPosition: {
        bitrixId: 'UF_CRM_1743414340',
        name: 'Должность директора',
        type: 'string',
    },
    directorName: {
        bitrixId: 'UF_CRM_1743414391',
        name: 'ФИО директора',
        type: 'string',
        code: 'directorName'
    },
    directorBased: {
        bitrixId: '',
        name: 'Руководитель действует на основании',
        type: 'string',
        code: 'directorBased'
    },
    directorPhone: {
        bitrixId: 'UF_CRM_1743414493',
        name: 'Телефон директора',
        code: 'directorPhone'
    },
    contacts: {
        up_doc: {
            bitrixId: 'UF_CRM_1743414644',
            name: 'Контактное лицо для направления комплекта документов \"Учетная политика\" (ФИО, мобильный телефон, e-mail)',
            type: 'string',
            code: 'contact_up_doc'
        },
        exchange_doc_email: {
            bitrixId: 'UF_CRM_1744112127',
            name: 'Контактное лицо для обмена документами (E-mail))',
            type: 'string',
            code: 'exchange_doc_email'
        },
        exchange_doc_phone: {
            bitrixId: 'UF_CRM_1744112153',
            name: 'Контактное лицо для обмена документами (Телефон)',
            type: 'string',
            code: 'exchange_doc_phone'
        },
    },
    organization: {
        type: {
            id: "8430",
            bitrixId: "UF_CRM_1744358047",
            type: "enumeration",
            list: [
                {
                    bitrixId: "18030",
                    name: "Физическое лицо",
                    sort: "10"
                },
                {
                    bitrixId: "18032",
                    name: "Юридическое лицо",
                    sort: "20"
                }
            ],
            name: "Вы являетесь физическим или юридическим лицом?",
            code: 'organization_type',
            multiple: false,
            mandatory: false
        },
        fiz: {
            fio: {
                id: "8432",
                bitrixId: "UF_CRM_1744358668",
                type: "string",
                name: "ФИО (Физлцо)",
                code: 'fiz_fio',
                multiple: false,
                mandatory: false
            }
        }
    },

    seminar: {
        format: {
            id: "8322",
            bitrixId: "UF_CRM_1743997299",
            type: "enumeration",
            list: [
                {
                    bitrixId: "17822",
                    name: "Семинар",
                    sort: "10"
                },
                {
                    bitrixId: "17824",
                    name: "ППК",
                    sort: "20"
                },
                {
                    bitrixId: "17826",
                    name: "Семинар + ППК",
                    sort: "30"
                },
                {
                    bitrixId: "17828",
                    name: "УП",
                    sort: "40"
                }
            ],
            name: "Форма регистрации",
            code: null,
            multiple: false,
            mandatory: false
        },
        up_packet: {
            id: "8468",
            bitrixId: "UF_CRM_1744363400",
            type: "enumeration",
            code: 'up_packet',
            list: [
                {
                    bitrixId: "18038",
                    name: "Учетная политика 2025",
                    sort: "10"
                },
                {
                    bitrixId: "18040",
                    name: "Учетная политика 2024/2025",
                    sort: "20"
                }
            ],
            name: "Пакет",
            multiple: false,
        }
    },
    participants: participants

} as const;





// Example usage:
// const bitrixResponse = await fetchBitrixData();
// const updatedDealData = updateDealDataFromBitrixResponse(bitrixResponse);
