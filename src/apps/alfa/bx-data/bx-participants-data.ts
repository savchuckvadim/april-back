export enum BxParticipantsDataKeys {
    name = 'name',
    email = 'email',
    phone = 'phone',
    comment = 'comment',
    format = 'format',
    format_v2 = 'format_v2',
    is_ppk = 'is_ppk',
    accountant_gos = 'accountant_gos',
    accountant_medical = 'accountant_medical',
    zakupki = 'zakupki',
    kadry = 'kadry',
    corruption = 'corruption',
    days = 'days'
}

const participant_1 = {
    name: {
        id: "8234",
        bitrixId: "UF_CRM_1743659741" as const,
        type: "string",
        multiple: false,
        name: "Участник 1 ФИО",
        code: BxParticipantsDataKeys.name,
        group: 'general'
    },
    email: {
        id: "8236",
        bitrixId: "UF_CRM_1743659780" as const,
        type: "string",
        multiple: false,
        name: "Участник 1 E-mail",
        code: BxParticipantsDataKeys.email,
        group: 'general'
    },
    phone: {
        id: "8238",
        bitrixId: "UF_CRM_1743659794" as const,
        type: "string",
        multiple: false,
        name: "Участник 1 Телефон",
        code: BxParticipantsDataKeys.phone,
        group: 'general'
    },
    comment: {
        id: "8314",
        bitrixId: "UF_CRM_1743996669" as const,
        type: "string",
        name: "Участник 1 Комментарий",
        code: BxParticipantsDataKeys.comment,
        multiple: false,
        mandatory: false,
        group: 'general'
    },


    format: {
        id: "8270",
        bitrixId: "UF_CRM_1743993344" as const  ,
        type: "enumeration",
        multiple: false,
        name: "Участник 1 Формат участия",
        code: BxParticipantsDataKeys.format,
        list: [
            {
                bitrixId: "17746",
                name: "Очно",
                sort: "10"
            },
            {
                bitrixId: "17748",
                name: "Онлайн",
                sort: "20"
            },
            {
                bitrixId: "17914",
                name: "Пойду только на ППК",
                sort: "30"
            }
        ],
        group: 'seminar'
    },
    format_v2: {
        id: "8380",
        bitrixId: "UF_CRM_1744005060" as const,
        type: "enumeration",
        code: BxParticipantsDataKeys.format_v2,
        multiple: false,
        name: "Участник 1 Формат участия v2",
        list: [
            {
                bitrixId: "17932",
                name: "Очно",
                sort: "10"
            },
            {
                bitrixId: "17934",
                name: "Онлайн",
                sort: "20"
            },
            {
                bitrixId: "17936",
                name: "Пойду только на ППК",
                sort: "30"
            }
        ],
        group: 'seminar'
    },
    is_ppk: {
        id: "8248",
        bitrixId: "UF_CRM_1743659916" as const,
        type: "boolean",
        multiple: false,
        name: "Участник 1 является ППК",
        code: BxParticipantsDataKeys.is_ppk,
        group: 'seminar'
    },

    accountant_gos: {
        id: "8294",
        bitrixId: "UF_CRM_1743995114" as const,
        type: "enumeration",
        name: "Участник 1 Программы повышения квалификации для главных бухгалтеров и бухгалтеров бюджетной сферы",
        code: BxParticipantsDataKeys.accountant_gos,
        multiple: false,
        mandatory: false,
        list: [
            {
                bitrixId: "17754",
                "name": "«Главный бухгалтер бюджетной сферы (код B). Новые стандарты учёта и отчётности. Налоги. Планирование. Контроль», 40 часов",
                "sort": "10"
            },
            {
                "bitrixId": "17756",
                "name": "«Главный бухгалтер бюджетной сферы (код B). Новые стандарты учёта и отчётности. Налоги. Планирование. Контроль», 120 часов",
                "sort": "20"
            },
            {
                "bitrixId": "17758",
                "name": "«Главный бухгалтер бюджетной сферы (код С). Новые стандарты учета и отчетности. Налоги. Планирование. Контроль», 120 часов",
                "sort": "30"
            },
            {
                "bitrixId": "17760",
                "name": "«Бухгалтер бюджетной сферы (код А). Нефинансовые активы. Расчёты. Обязательства», 40 часов",
                "sort": "40"
            },
            {
                "bitrixId": "17762",
                "name": "«Бухгалтер бюджетной сферы (код А). Нефинансовые активы. Расчёты. Обязательства», 120 часов",
                "sort": "50"
            },
            {
                "bitrixId": "17764",
                "name": "«Учет заработной платы в организациях государственного сектора. Последние изменения, сложные практические вопросы взаимодействия кадровой службы и бухгалтерии», 60 часов",
                "sort": "60"
            },
            {
                "bitrixId": "18998",
                "name": "«Актуальные вопросы финансового контроля в бюджетной сфере», 72 часа",
                "sort": "70"
            }
        ],
        group: 'ppk'
    },
    accountant_medical: {
        id: "8298",
        bitrixId: "UF_CRM_1743995807" as const,
        code: BxParticipantsDataKeys.accountant_medical,
        type: "enumeration",
        list: [
            {
                bitrixId: "17778",
                name: "«Главный бухгалтер государственного учреждения здравоохранения (код B)», 40 часов",
                sort: "10"
            },
            {
                bitrixId: "17780",
                name: "«Главный бухгалтер государственного учреждения здравоохранения (код B)», 120 часов",
                sort: "20"
            },
            {
                bitrixId: "17784",
                name: "«Бухгалтер государственного учреждения здравоохранения (код А)». 40 часов",
                sort: "40"
            },
            {
                bitrixId: "17786",
                name: "«Бухгалтер государственного учреждения здравоохранения (код А)». 120 часов",
                sort: "50"
            }
        ],
        name: "Участник 1 Программы повышения квалификации для главных бухгалтеров и бухгалтеров государственного учреждения здравоохранения",
        multiple: false,
        mandatory: false,
        group: 'ppk'
    },
    zakupki: {
        id: "8302",
        bitrixId: "UF_CRM_1743995970",
        type: "enumeration",
        list: [
            {
                bitrixId: "17798",
                name: "«Организация закупок товаров, работ и услуг отдельными видами юридических лиц»,  60 часов",
                sort: "10"
            },
            {
                bitrixId: "17800",
                name: "«Контрактная система в сфере закупок товаров, работ, услуг для обеспечения государственных (муниципальных) нужд», 120 часов",
                sort: "20"
            },
            {
                bitrixId: "17802",
                name: "«Контрактная система в сфере закупок товаров, работ, услуг для обеспечения государственных (муниципальных) нужд», 40 часов",
                sort: "30"
            }
        ],
        name: "Участник 1 Программы повышения квалификации для специалистов по закупкам",
        code: BxParticipantsDataKeys.zakupki,
        multiple: false,
        mandatory: false,
        group: 'ppk'

    },
    kadry: {
        id: "8306",
        bitrixId: "UF_CRM_1743996051",
        type: "enumeration",
        list: [
            {
                bitrixId: "17810",
                name: "«Правовое регулирование трудовых отношений и кадрового делопроизводства: последние изменения, типичные нарушения и ответственность за их совершение», 40 часов (Код А)",
                sort: "10"
            },
            {
                bitrixId: "17812",
                name: "«Правовое регулирование трудовых отношений и кадрового делопроизводства: последние изменения, типичные нарушения и ответственность за их совершение», 40 часов (Код Е)",
                sort: "20"
            }
        ],
        name: "Участник 1 Программы повышения квалификации для специалистов по кадрам",
        code: BxParticipantsDataKeys.kadry,
        multiple: false,
        mandatory: false,
        group: 'ppk'

    },
    corruption: {
        id: "8310",
        bitrixId: "UF_CRM_1743996124",
        type: "enumeration",
        list: [
            {
                bitrixId: "17818",
                name: "«Основы профилактики коррупции» (в соответствии с профессиональным стандартом \"Специалист в сфере предупреждения коррупционных правонарушений\"), 40 часов",
                sort: "10"
            }
        ],
        name: "Участник 1 Программы повышения квалификации для специалистов по антикоррупционной деятельности",
        code: BxParticipantsDataKeys.corruption,
        multiple: false,
        mandatory: false,
        group: 'ppk'
    },

    days: {
        id: "8394",
        bitrixId: "UF_CRM_1744089697",
        type: "enumeration",
        multiple: true,
        name: "Участник 1 Дни участия v2",
        code: BxParticipantsDataKeys.days,
        mandatory: false,
        list: [
            {
                bitrixId: "17986",
                name: "2 - 3 июня Пименов В.В. «Учёт и отчётность в учреждении бюджетной сферы-2025. Анализируем задолженность, совершенствуем ЭДО, обсуждаем инвентаризацию и исправляем ошибки». Пересмотр в 2025 году \"бухгалтерской\" нормативной базы с учетом опыта проверок, суд",
                sort: "10"
            },
            {
                bitrixId: "17988",
                name: "4 июня Волгина Ю.Н. «Учёт и отчётность в учреждении бюджетной сферы-2025. Анализируем задолженность, совершенствуем ЭДО, обсуждаем инвентаризацию и исправляем ошибки». Пересмотр в 2025 году \"бухгалтерской\" нормативной базы с учетом опыта проверок, судебны",
                sort: "20"
            },
            {
                bitrixId: "17990",
                name: "2,3 и 4 июня(три дня)",
                sort: "30"
            }
        ],
        group: 'seminar'
    }

};

const participant_2 = {

    name: {
        id: "8240",
        bitrixId: "UF_CRM_1743659827" as const,
        type: "string",
        name: "Участник 2 ФИО",
        code: BxParticipantsDataKeys.name,
        multiple: false,
        mandatory: false,
        group: 'general'
    },
    email: {
        id: "8242",
        bitrixId: "UF_CRM_1743659845" as const,
        type: "string",
        name: "Участник 2 E-mail",
        code: BxParticipantsDataKeys.email,
        multiple: false,
        mandatory: false,
        group: 'general'
    },
    phone: {
        id: "8244",
        bitrixId: "UF_CRM_1743659861" as const  ,
        type: "string",
        name: "Участник 2 Телефон",
        code: BxParticipantsDataKeys.phone,
        multiple: false,
        mandatory: false,
        group: 'general'
    },
    comment: {
        id: "8316",
        bitrixId: "UF_CRM_1743996681" as const,
        type: "string",
        name: "Участник 2 Комментарий",
        code: BxParticipantsDataKeys.comment,
        multiple: false,
        mandatory: false,
        group: 'general'
    },


    format: {
        id: "8272",
        bitrixId: "UF_CRM_1743993367" as const,
        type: "enumeration",
        list: [
            {
                bitrixId: "17750",
                name: "Очно",
                sort: "10"
            },
            {
                bitrixId: "17752",
                name: "Заочно",
                sort: "20"
            },
            {
                bitrixId: "17918",
                name: "Пойду только на ППК",
                sort: "30"
            }
        ],
        name: "Участник 2 Формат участия",
        code: BxParticipantsDataKeys.format,
        multiple: false,
        mandatory: false,
        group: 'seminar'
    },
    format_v2: {
        id: "8384",
        bitrixId: "UF_CRM_1744005370" as const,
        type: "enumeration",
        list: [
            {
                bitrixId: "17944",
                name: "Очно",
                sort: "10"
            },
            {
                bitrixId: "17946",
                name: "Онлайн",
                sort: "20"
            },
            {
                bitrixId: "17948",
                name: "Пойду только на ППК",
                sort: "30"
            }
        ],
        name: "Участник 2 Формат участия v2",
        code: BxParticipantsDataKeys.format_v2,
        multiple: false,
        mandatory: false,
        group: 'seminar'
    },
    is_ppk: {
        id: "8246",
        bitrixId: "UF_CRM_1743659888" as const,
        type: "boolean",
        name: "Участник 2 ППК",
        code: BxParticipantsDataKeys.is_ppk,
        multiple: false,
        mandatory: false,
        group: 'seminar'
    },

    accountant_gos: {
        id: "8296",
        bitrixId: "UF_CRM_1743995695" as const,
        type: "enumeration",
        list: [
            {
                bitrixId: "17766",
                name: "«Главный бухгалтер бюджетной сферы (код B). Новые стандарты учёта и отчётности. Налоги. Планирование. Контроль», 40 часов",
                sort: "10"
            },
            {
                bitrixId: "17768",
                name: "«Главный бухгалтер бюджетной сферы (код B). Новые стандарты учёта и отчётности. Налоги. Планирование. Контроль», 120 часов",
                sort: "20"
            },
            {
                bitrixId: "17770",
                name: "«Главный бухгалтер бюджетной сферы (код С). Новые стандарты учета и отчетности. Налоги. Планирование. Контроль», 120 часов",
                sort: "30"
            },
            {
                bitrixId: "17772",
                name: "«Бухгалтер бюджетной сферы (код А). Нефинансовые активы. Расчёты. Обязательства», 40 часов",
                sort: "40"
            },
            {
                bitrixId: "17774",
                name: "«Бухгалтер бюджетной сферы (код А). Нефинансовые активы. Расчёты. Обязательства», 120 часов",
                sort: "50"
            },
            {
                bitrixId: "17776",
                name: "«Учет заработной платы в организациях государственного сектора. Последние изменения, сложные практические вопросы взаимодействия кадровой службы и бухгалтерии», 60 часов",
                sort: "60"
            },
            {
                bitrixId: "18994",
                name: "«Актуальные вопросы финансового контроля в бюджетной сфере», 72 часа",
                sort: "70"
            }
        ],
        name: "Участник 2 Программы повышения квалификации для главных бухгалтеров и бухгалтеров бюджетной сферы",
        code: BxParticipantsDataKeys.accountant_gos,
        multiple: false,
        mandatory: false,
        group: 'ppk'
    },
    accountant_medical: {
        id: "8300",
        bitrixId: "UF_CRM_1743995854" as const,
        type: "enumeration",
        list: [
            {
                bitrixId: "17788",
                name: "«Главный бухгалтер государственного учреждения здравоохранения (код B)», 40 часов",
                sort: "10"
            },
            {
                bitrixId: "17790",
                name: "«Главный бухгалтер государственного учреждения здравоохранения (код B)», 120 часов",
                sort: "20"
            },
            {
                bitrixId: "17794",
                name: "«Бухгалтер государственного учреждения здравоохранения (код А)». 40 часов",
                sort: "40"
            },
            {
                bitrixId: "17796",
                name: "«Бухгалтер государственного учреждения здравоохранения (код А)». 120 часов",
                sort: "50"
            }
        ],
        name: "Участник 2 Программы повышения квалификации для главных бухгалтеров и бухгалтеров государственного учреждения здравоохранения",
        code: BxParticipantsDataKeys.accountant_medical,
        multiple: false,
        mandatory: false,
        group: 'ppk'
    },
    zakupki: {
        id: "8304",
        bitrixId: "UF_CRM_1743996011" as const,
        type: "enumeration",
        list: [
            {
                bitrixId: "17804",
                name: "«Организация закупок товаров, работ и услуг отдельными видами юридических лиц»,  60 часов",
                sort: "10"
            },
            {
                bitrixId: "17806",
                name: "«Контрактная система в сфере закупок товаров, работ, услуг для обеспечения государственных (муниципальных) нужд», 120 часов",
                sort: "20"
            },
            {
                bitrixId: "17808",
                name: "«Контрактная система в сфере закупок товаров, работ, услуг для обеспечения государственных (муниципальных) нужд», 40 часов",
                sort: "30"
            }
        ],
        name: "Участник 2 Программы повышения квалификации для специалистов по закупкам",
        code: BxParticipantsDataKeys.zakupki,
        multiple: false,
        mandatory: false,
        group: 'ppk'
    },
    kadry: {
        id: "8308",
        bitrixId: "UF_CRM_1743996080" as const,
        type: "enumeration",
        list: [
            {
                bitrixId: "17814",
                name: "«Правовое регулирование трудовых отношений и кадрового делопроизводства: последние изменения, типичные нарушения и ответственность за их совершение», 40 часов (Код А)",
                sort: "10"
            },
            {
                bitrixId: "17816",
                name: "«Правовое регулирование трудовых отношений и кадрового делопроизводства: последние изменения, типичные нарушения и ответственность за их совершение», 40 часов (Код Е)",
                sort: "20"
            }
        ],
        name: "Участник 2 Программы повышения квалификации для специалистов по кадрам",
        code: BxParticipantsDataKeys.kadry,
        multiple: false,
        mandatory: false,
        group: 'ppk'
    },
    corruption: {
        id: "8312",
        bitrixId: "UF_CRM_1743996152" as const,
        type: "enumeration",
        list: [
            {
                bitrixId: "17820",
                name: "«Основы профилактики коррупции» (в соответствии с профессиональным стандартом \"Специалист в сфере предупреждения коррупционных правонарушений\"), 40 часов",
                sort: "10"
            }
        ],
        name: "Участник 2 Программы повышения квалификации для специалистов по антикоррупционной деятельности",
        code: BxParticipantsDataKeys.corruption,
        multiple: false,
        mandatory: false,
        group: 'ppk'
    },
    days: {
        id: "8398",
        bitrixId: "UF_CRM_1744090469" as const,
        type: "enumeration",
        list: [
            {
                bitrixId: "17998",
                name: "2 - 3 июня Пименов В.В. «Учёт и отчётность в учреждении бюджетной сферы-2025. Анализируем задолженность, совершенствуем ЭДО, обсуждаем инвентаризацию и исправляем ошибки». Пересмотр в 2025 году \"бухгалтерской\" нормативной базы с учетом опыта проверок, суд",
                sort: "10"
            }
        ],
        name: "Участник 2 Дни участия v2",
        code: BxParticipantsDataKeys.days,
        multiple: true,
        mandatory: false,
        group: 'seminar'
    }

};

const participant_3 = {

    name: {
        id: "8540",
        bitrixId: "UF_CRM_1747384334" as const,
        type: "string",
        name: "Участник 3 ФИО",
        code: BxParticipantsDataKeys.name,
        multiple: false,
        mandatory: false,
        group: 'general'
    },
    email: {
        id: "8556",
        bitrixId: "UF_CRM_1747384467" as const,
        type: "string",
        name: "Участник 3 E-mail",
        code: BxParticipantsDataKeys.email,
        multiple: false,
        mandatory: false,
        group: 'general'
    },
    phone: {
        id: "8572",
        bitrixId: "UF_CRM_1747384567" as const,
        type: "string",
        name: "Участник 3 Телефон",
        code: BxParticipantsDataKeys.phone,
        multiple: false,
        mandatory: false,
        group: 'general'
    },
    comment: {
        id: "9022",
        bitrixId: "UF_CRM_1747737835" as const,
        type: "string",
        name: "Участник 3 Комментарий",
        code: BxParticipantsDataKeys.comment,
        multiple: false,
        mandatory: false,
        group: 'general'
    },


    format: {
        id: "8660",
        bitrixId: "UF_CRM_1747384959" as const,
        type: "enumeration",
        list: [
            {
                bitrixId: "18152",
                name: "Очно",
                sort: "10"
            },
            {
                bitrixId: "18154",
                name: "Онлайн",
                sort: "20"
            },
            {
                bitrixId: "18156",
                name: "Пойду только на ППК",
                sort: "30"
            }
        ],
        name: "Участник 3 Формат участия",
        code: BxParticipantsDataKeys.format,
        multiple: false,
        mandatory: false,
        group: 'seminar'
    },
    format_v2: {
        id: "9038",
        bitrixId: "UF_CRM_1747738037" as const,
        type: "enumeration",
        list: [
            {
                bitrixId: "18802",
                name: "Очно",
                sort: "10"
            },
            {
                bitrixId: "18804",
                name: "Онлайн",
                sort: "20"
            },
            {
                bitrixId: "18806",
                name: "Пойду только на ППК",
                sort: "30"
            }
        ],
        name: "Участник 3 Формат участия v2",
        code: BxParticipantsDataKeys.format_v2,
        multiple: false,
        mandatory: false,
        group: 'seminar'
    },
    is_ppk: {
        id: "8588",
        bitrixId: "UF_CRM_1747384718" as const,
        type: "boolean",
        name: "Участник 3 ППК",
        code: BxParticipantsDataKeys.is_ppk,
        multiple: false,
        mandatory: false,
        group: 'seminar'
    },

    accountant_gos: {
        id: "8780",
        bitrixId: "UF_CRM_1747732322" as const,
        type: "enumeration",
        list: [
            {
                bitrixId: "18248",
                name: "«Главный бухгалтер бюджетной сферы (код B). Новые стандарты учёта и отчётности. Налоги. Планирование. Контроль», 40 часов",
                sort: "10"
            },
            {
                bitrixId: "18250",
                name: "«Главный бухгалтер бюджетной сферы (код B). Новые стандарты учёта и отчётности. Налоги. Планирование. Контроль», 120 часов",
                sort: "20"
            },
            {
                bitrixId: "18252",
                name: "«Главный бухгалтер бюджетной сферы (код С). Новые стандарты учета и отчетности. Налоги. Планирование. Контроль», 120 часов",
                sort: "30"
            },
            {
                bitrixId: "18254",
                name: "«Бухгалтер бюджетной сферы (код А). Нефинансовые активы. Расчёты. Обязательства», 40 часов",
                sort: "40"
            },
            {
                bitrixId: "18256",
                name: "«Бухгалтер бюджетной сферы (код А). Нефинансовые активы. Расчёты. Обязательства», 120 часов",
                sort: "50"
            },
            {
                bitrixId: "18258",
                name: "«Учет заработной платы в организациях государственного сектора. Последние изменения, сложные практические вопросы взаимодействия кадровой службы и бухгалтерии», 60 часов",
                sort: "60"
            },
            {
                bitrixId: "18962",
                name: "«Актуальные вопросы финансового контроля в бюджетной сфере», 72 часа",
                sort: "70"
            }
        ],
        name: "Участник 3 Программы повышения квалификации для главных бухгалтеров и бухгалтеров бюджетной сферы",
        code: BxParticipantsDataKeys.accountant_gos,
        multiple: false,
        mandatory: false,
        group: 'ppk'
    },
    accountant_medical: {
        id: "8796",
        bitrixId: "UF_CRM_1747733202" as const,
        type: "enumeration",
        list: [
            {
                bitrixId: "18344",
                name: "«Главный бухгалтер государственного учреждения здравоохранения (код B)», 40 часов",
                sort: "10"
            },
            {
                bitrixId: "18346",
                name: "«Главный бухгалтер государственного учреждения здравоохранения (код B)», 120 часов",
                sort: "20"
            },
            {
                bitrixId: "18350",
                name: "«Бухгалтер государственного учреждения здравоохранения (код А)». 40 часов",
                sort: "40"
            },
            {
                bitrixId: "18352",
                name: "«Бухгалтер государственного учреждения здравоохранения (код А)». 120 часов",
                sort: "50"
            }
        ],
        name: "Участник 3 Программы повышения квалификации для главных бухгалтеров и бухгалтеров государственного учреждения здравоохранения",
        code: BxParticipantsDataKeys.accountant_medical,
        multiple: false,
        mandatory: false,
        group: 'ppk'
    },
    zakupki: {
        id: "8926",
        bitrixId: "UF_CRM_1747736411" as const,
        type: "enumeration",
        list: [
            {
                bitrixId: "18610",
                name: "«Организация закупок товаров, работ и услуг отдельными видами юридических лиц»,  60 часов",
                sort: "10"
            },
            {
                bitrixId: "18612",
                name: "«Контрактная система в сфере закупок товаров, работ, услуг для обеспечения государственных (муниципальных) нужд», 120 часов",
                sort: "20"
            },
            {
                bitrixId: "18614",
                name: "«Контрактная система в сфере закупок товаров, работ, услуг для обеспечения государственных (муниципальных) нужд», 40 часов",
                sort: "30"
            }
        ],
        name: "Участник 3 Программы повышения квалификации для специалистов по закупкам",
        code: BxParticipantsDataKeys.zakupki,
        multiple: false,
        mandatory: false,
        group: 'ppk'
    },
    kadry: {
        id: "8952",
        bitrixId: "UF_CRM_1747736794" as const,
        type: "enumeration",
        list: [
            {
                bitrixId: "18688",
                name: "«Правовое регулирование трудовых отношений и кадрового делопроизводства: последние изменения, типичные нарушения и ответственность за их совершение», 40 часов (Код А)",
                sort: "10"
            },
            {
                bitrixId: "18690",
                name: "«Правовое регулирование трудовых отношений и кадрового делопроизводства: последние изменения, типичные нарушения и ответственность за их совершение», 40 часов (Код Е)",
                sort: "20"
            }
        ],
        name: "Участник 3 Программы повышения квалификации для специалистов по кадрам",
        code: BxParticipantsDataKeys.kadry,
        multiple: false,
        mandatory: false,
        group: 'ppk'
    },
    corruption: {
        id: "8986",
        bitrixId: "UF_CRM_1747737569" as const,
        type: "enumeration",
        list: [
            {
                bitrixId: "18762",
                name: "«Основы профилактики коррупции» (в соответствии с профессиональным стандартом \"Специалист в сфере предупреждения коррупционных правонарушений\"), 40 часов",
                sort: "10"
            }
        ],
        name: "Участник 3 Программы повышения квалификации для специалистов по антикоррупционной деятельности",
        code: BxParticipantsDataKeys.corruption,
        multiple: false,
        mandatory: false,
        group: 'ppk'
    },
    days: {
        id: "9054",
        bitrixId: "UF_CRM_1747738499" as const,
        type: "enumeration",
        list: [],
        name: "Участник 3 Дни участия v2",
        code: BxParticipantsDataKeys.days,
        multiple: true,
        mandatory: false,
        group: 'seminar'
    }

};

const participant_4 = {

    name: {
        id: "8542",
        bitrixId: "UF_CRM_1747384369" as const,
        type: "string",
        name: "Участник 4 ФИО",
                code: BxParticipantsDataKeys.name,
        multiple: false,
        mandatory: false,
        group: 'general'
    },
    email: {
        id: "8558",
        bitrixId: "UF_CRM_1747384476" as const,
        type: "string",
        name: "Участник 4 E-mail",
        code: BxParticipantsDataKeys.email,
        multiple: false,
        mandatory: false,
        group: 'general'
    },
    phone: {
        id: "8574",
        bitrixId: "UF_CRM_1747384577" as const,
        type: "string",
        name: "Участник 4 Телефон",
        code: BxParticipantsDataKeys.phone,
        multiple: false,
        mandatory: false,
        group: 'general'
    },
    comment: {
        id: "9024",
        bitrixId: "UF_CRM_1747737846" as const,
        type: "string",
        name: "Участник 4 Комментарий",
        code: BxParticipantsDataKeys.comment,
        multiple: false,
        mandatory: false,
        group: 'general'
    },


    format: {
        id: "8672",
        bitrixId: "UF_CRM_1747385104" as const,
        type: "enumeration",
        list: [
            {
                bitrixId: "18164",
                name: "Очно",
                sort: "10"
            },
            {
                bitrixId: "18166",
                name: "Онлайн",
                sort: "20"
            },
            {
                bitrixId: "18168",
                name: "Пойду только на ППК",
                sort: "30"
            }
        ],
        name: "Участник 4 Формат участия",
        code: BxParticipantsDataKeys.format,
        multiple: false,
        mandatory: false,
        group: 'seminar'
    },
    format_v2: {
        id: "9040",
        bitrixId: "UF_CRM_1747738081" as const,
        type: "enumeration",
        list: [
            {
                bitrixId: "18808",
                name: "Очно",
                sort: "10"
            },
            {
                bitrixId: "18810",
                name: "Онлайн",
                sort: "20"
            },
            {
                bitrixId: "18812",
                name: "Пойду только на ППК",
                sort: "30"
            }
        ],
        name: "Участник 4 Формат участия v2",
        code: BxParticipantsDataKeys.format_v2,
        multiple: false,
        mandatory: false,
        group: 'seminar'
    },
    is_ppk: {
        id: "8590",
        bitrixId: "UF_CRM_1747384744" as const,
        type: "boolean",
        name: "Участник 4 ППК",
        code: BxParticipantsDataKeys.is_ppk,
        multiple: false,
        mandatory: false,
        group: 'seminar'
    },

    accountant_gos: {
        id: "8782",
        bitrixId: "UF_CRM_1747732381" as const,
        type: "enumeration",
        list: [
            {
                bitrixId: "18260",
                name: "«Главный бухгалтер бюджетной сферы (код B). Новые стандарты учёта и отчётности. Налоги. Планирование. Контроль», 40 часов",
                sort: "10"
            },
            {
                bitrixId: "18262",
                name: "«Главный бухгалтер бюджетной сферы (код B). Новые стандарты учёта и отчётности. Налоги. Планирование. Контроль», 120 часов",
                sort: "20"
            },
            {
                bitrixId: "18264",
                name: "«Главный бухгалтер бюджетной сферы (код С). Новые стандарты учета и отчетности. Налоги. Планирование. Контроль», 120 часов",
                sort: "30"
            },
            {
                bitrixId: "18266",
                name: "«Бухгалтер бюджетной сферы (код А). Нефинансовые активы. Расчёты. Обязательства», 40 часов",
                sort: "40"
            },
            {
                bitrixId: "18268",
                name: "«Бухгалтер бюджетной сферы (код А). Нефинансовые активы. Расчёты. Обязательства», 120 часов",
                sort: "50"
            },
            {
                bitrixId: "18270",
                name: "«Учет заработной платы в организациях государственного сектора. Последние изменения, сложные практические вопросы взаимодействия кадровой службы и бухгалтерии», 60 часов",
                sort: "60"
            },
            {
                bitrixId: "18970",
                name: "«Актуальные вопросы финансового контроля в бюджетной сфере», 72 часа",
                sort: "70"
            }
        ],
        name: "Участник 4 Программы повышения квалификации для главных бухгалтеров и бухгалтеров бюджетной сферы",
            code: BxParticipantsDataKeys.accountant_gos,
        multiple: false,
        mandatory: false,
        group: 'ppk'
    },
    accountant_medical: {
        id: "8798",
        bitrixId: "UF_CRM_1747733273" as const,
        type: "enumeration",
        list: [
            {
                bitrixId: "18354",
                name: "«Главный бухгалтер государственного учреждения здравоохранения (код B)», 40 часов",
                sort: "10"
            },
            {
                bitrixId: "18356",
                name: "«Главный бухгалтер государственного учреждения здравоохранения (код B)», 120 часов",
                sort: "20"
            },
            {
                bitrixId: "18360",
                name: "«Бухгалтер государственного учреждения здравоохранения (код А)». 40 часов",
                sort: "40"
            },
            {
                bitrixId: "18362",
                name: "«Бухгалтер государственного учреждения здравоохранения (код А)». 120 часов",
                sort: "50"
            }
        ],
        name: "Участник 4 Программы повышения квалификации для главных бухгалтеров и бухгалтеров государственного учреждения здравоохранения",
        code: BxParticipantsDataKeys.accountant_medical,
        multiple: false,
        mandatory: false,
        group: 'ppk'
    },
    zakupki: {
        id: "8928",
        bitrixId: "UF_CRM_1747736452" as const,
        type: "enumeration",
        list: [
            {
                bitrixId: "18616",
                name: "«Организация закупок товаров, работ и услуг отдельными видами юридических лиц»,  60 часов",
                sort: "10"
            },
            {
                bitrixId: "18618",
                name: "«Контрактная система в сфере закупок товаров, работ, услуг для обеспечения государственных (муниципальных) нужд», 120 часов",
                sort: "20"
            },
            {
                bitrixId: "18620",
                name: "«Контрактная система в сфере закупок товаров, работ, услуг для обеспечения государственных (муниципальных) нужд», 40 часов",
                sort: "30"
            }
        ],
        name: "Участник 4 Программы повышения квалификации для специалистов по закупкам",
        code: BxParticipantsDataKeys.zakupki,
        multiple: false,
        mandatory: false,
        group: 'ppk'
    },
    kadry: {
        id: "8954",
        bitrixId: "UF_CRM_1747736833" as const,
        type: "enumeration",
        list: [
            {
                bitrixId: "18692",
                name: "«Правовое регулирование трудовых отношений и кадрового делопроизводства: последние изменения, типичные нарушения и ответственность за их совершение», 40 часов (Код А)",
                sort: "10"
            },
            {
                bitrixId: "18694",
                name: "«Правовое регулирование трудовых отношений и кадрового делопроизводства: последние изменения, типичные нарушения и ответственность за их совершение», 40 часов  (Код Е)",
                sort: "20"
            }
        ],
        name: "Участник 4 Программы повышения квалификации для специалистов по кадрам",
        code: BxParticipantsDataKeys.kadry,
        multiple: false,
        mandatory: false,
        group: 'ppk'
    },
    corruption: {
        id: "8988",
        bitrixId: "UF_CRM_1747737593" as const,
        type: "enumeration",
        list: [
            {
                bitrixId: "18764",
                name: "«Основы профилактики коррупции» (в соответствии с профессиональным стандартом \"Специалист в сфере предупреждения коррупционных правонарушений\"), 40 часов",
                sort: "10"
            }
        ],
        name: "Участник 4 Программы повышения квалификации для специалистов по антикоррупционной деятельности",
        code: BxParticipantsDataKeys.corruption,
        multiple: false,
        mandatory: false,
        group: 'ppk'
    },

    days: {
        id: "9056",
        bitrixId: "UF_CRM_1747738523" as const,
        type: "enumeration",
        list: [],
        name: "Участник 4 Дни участия v2",
        code: BxParticipantsDataKeys.days,
        multiple: true,
        mandatory: false,
        group: 'seminar'
    }

};

const participant_5 = {

    name: {
        id: "8544",
        bitrixId: "UF_CRM_1747384385" as const,
        type: "string",
        name: "Участник 5 ФИО",
        code: BxParticipantsDataKeys.name,
        multiple: false,
        mandatory: false,
        group: 'general'
    },
    email: {
        id: "8560",
        bitrixId: "UF_CRM_1747384486" as const,
        type: "string",
        name: "Участник 5 E-mail",
        code: BxParticipantsDataKeys.email,
        multiple: false,
        mandatory: false,
        group: 'general'
    },
    phone: {
        id: "8576",
        bitrixId: "UF_CRM_1747384586" as const,
        type: "string",
        name: "Участник 5 Телефон",
        code: BxParticipantsDataKeys.phone,
        multiple: false,
        mandatory: false,
        group: 'general'
    },
    comment: {
        id: "9026",
        bitrixId: "UF_CRM_1747737857" as const,
        type: "string",
        name: "Участник 5 Комментарий",
            code: BxParticipantsDataKeys.comment,
        multiple: false,
        mandatory: false,
        group: 'general'
    },


    format: {
        id: "8674",
        bitrixId: "UF_CRM_1747385142" as const,
        type: "enumeration",
        list: [
            {
                bitrixId: "18170",
                name: "Очно",
                sort: "10"
            },
            {
                bitrixId: "18172",
                name: "Онлайн",
                sort: "20"
            },
            {
                bitrixId: "18174",
                name: "Пойду только на ППК",
                sort: "30"
            }
        ],
        name: "Участник 5 Формат участия",
        code: BxParticipantsDataKeys.format,
        multiple: false,
        mandatory: false,
        group: 'seminar'
    },
    format_v2: {
        id: "9042",
        bitrixId: "UF_CRM_1747738118" as const,
        type: "enumeration",
        list: [
            {
                bitrixId: "18814",
                name: "Очно",
                sort: "10"
            },
            {
                bitrixId: "18816",
                name: "Онлайн",
                sort: "20"
            },
            {
                bitrixId: "18818",
                name: "Пойду только на ППК",
                sort: "30"
            }
        ],
        name: "Участник 5 Формат участия v2",
        code: BxParticipantsDataKeys.format_v2,
        multiple: false,
        mandatory: false,
        group: 'seminar'
    },
    is_ppk: {
        id: "8592",
        bitrixId: "UF_CRM_1747384762" as const,
        type: "boolean",
        name: "Участник 5 ППК",
        code: BxParticipantsDataKeys.is_ppk,
        multiple: false,
        mandatory: false,
        group: 'seminar'
    },

    accountant_gos: {
        id: "8784",
        bitrixId: "UF_CRM_1747732607" as const,
        type: "enumeration",
        list: [
            {
                bitrixId: "18272",
                name: "«Главный бухгалтер бюджетной сферы (код B). Новые стандарты учёта и отчётности. Налоги. Планирование. Контроль», 40 часов",
                sort: "10"
            },
            {
                bitrixId: "18274",
                name: "«Главный бухгалтер бюджетной сферы (код B). Новые стандарты учёта и отчётности. Налоги. Планирование. Контроль», 120 часов",
                sort: "20"
            },
            {
                bitrixId: "18276",
                name: "«Главный бухгалтер бюджетной сферы (код С). Новые стандарты учета и отчетности. Налоги. Планирование. Контроль», 120 часов",
                sort: "30"
            },
            {
                bitrixId: "18278",
                name: "«Бухгалтер бюджетной сферы (код А). Нефинансовые активы. Расчёты. Обязательства», 40 часов",
                sort: "40"
            },
            {
                bitrixId: "18280",
                name: "«Бухгалтер бюджетной сферы (код А). Нефинансовые активы. Расчёты. Обязательства», 120 часов",
                sort: "50"
            },
            {
                bitrixId: "18282",
                name: "«Учет заработной платы в организациях государственного сектора. Последние изменения, сложные практические вопросы взаимодействия кадровой службы и бухгалтерии», 60 часов",
                sort: "60"
            },
            {
                bitrixId: "18970",
                name: "«Актуальные вопросы финансового контроля в бюджетной сфере», 72 часа",
                sort: "70"
            }
        ],
        name: "Участник 5 Программы повышения квалификации для главных бухгалтеров и бухгалтеров бюджетной сферы",
        code: BxParticipantsDataKeys.accountant_gos,
        multiple: false,
        mandatory: false,
        group: 'ppk'
    },
    accountant_medical: {
        id: "8800",
        bitrixId: "UF_CRM_1747733440" as const,
        type: "enumeration",
        list: [
            {
                bitrixId: "18364",
                name: "«Главный бухгалтер государственного учреждения здравоохранения (код B)», 40 часов",
                sort: "10"
            },
            {
                bitrixId: "18366",
                name: "«Главный бухгалтер государственного учреждения здравоохранения (код B)», 120 часов",
                sort: "20"
            },
            {
                bitrixId: "18370",
                name: "«Бухгалтер государственного учреждения здравоохранения (код А)». 40 часов",
                sort: "40"
            },
            {
                bitrixId: "18372",
                name: "«Бухгалтер государственного учреждения здравоохранения (код А)». 120 часов",
                sort: "50"
            }
        ],
        name: "Участник 5 Программы повышения квалификации для главных бухгалтеров и бухгалтеров государственного учреждения здравоохранения",
            code: BxParticipantsDataKeys.accountant_medical,
        multiple: false,
        mandatory: false,
        group: 'ppk'
    },
    zakupki: {
        id: "8930",
        bitrixId: "UF_CRM_1747736493" as const,
        type: "enumeration",
        list: [
            {
                bitrixId: "18622",
                name: "«Организация закупок товаров, работ и услуг отдельными видами юридических лиц»,  60 часов",
                sort: "10"
            },
            {
                bitrixId: "18624",
                name: "«Контрактная система в сфере закупок товаров, работ, услуг для обеспечения государственных (муниципальных) нужд», 120 часов",
                sort: "20"
            },
            {
                bitrixId: "18626",
                name: "«Контрактная система в сфере закупок товаров, работ, услуг для обеспечения государственных (муниципальных) нужд», 40 часов",
                sort: "30"
            }
        ],
        name: "Участник 5 Программы повышения квалификации для специалистов по закупкам",
        code: BxParticipantsDataKeys.zakupki,
        multiple: false,
        mandatory: false,
        group: 'ppk'
    },
    kadry: {
        id: "8966",
        bitrixId: "UF_CRM_1747737358" as const,
        type: "enumeration",
        list: [
            {
                bitrixId: "18722",
                name: "«Правовое регулирование трудовых отношений и кадрового делопроизводства: последние изменения, типичные нарушения и ответственность за их совершение», 40 часов (Код А)",
                sort: "10"
            },
            {
                bitrixId: "18724",
                name: "«Правовое регулирование трудовых отношений и кадрового делопроизводства: последние изменения, типичные нарушения и ответственность за их совершение», 40 часов (Код Е)",
                sort: "20"
            }
        ],
        name: "Участник 5 Программы повышения квалификации для специалистов по кадрам",
        code: BxParticipantsDataKeys.kadry,
        multiple: false,
        mandatory: false,
        group: 'ppk'
    },
    corruption: {
        id: "8990",
        bitrixId: "UF_CRM_1747737619" as const,
        type: "enumeration",
        list: [
            {
                bitrixId: "18766",
                name: "«Основы профилактики коррупции» (в соответствии с профессиональным стандартом \"Специалист в сфере предупреждения коррупционных правонарушений\"), 40 часов",
                sort: "10"
            }
        ],
        name: "Участник 5 Программы повышения квалификации для специалистов по антикоррупционной деятельности",
        code: BxParticipantsDataKeys.corruption,
        multiple: false,
        mandatory: false,
        group: 'ppk'
    },

    days: {
        id: "9058",
        bitrixId: "UF_CRM_1747738539" as const,
        type: "enumeration",
        list: [],
        name: "Участник 5 Дни участия v2",
        code: BxParticipantsDataKeys.days,
        multiple: true,
        mandatory: false,
        group: 'seminar'
    }

};

const participant_6 = {

    name: {
        id: "8546",
        bitrixId: "UF_CRM_1747384398" as const,
        type: "string",
        name: "Участник 6 ФИО",
        code: BxParticipantsDataKeys.name,
        multiple: false,
        mandatory: false,
        group: 'general'
    },
    email: {
        id: "8562",
        bitrixId: "UF_CRM_1747384495" as const,
        type: "string",
        name: "Участник 6 E-mail",
        code: BxParticipantsDataKeys.email,
        multiple: false,
        mandatory: false,
        group: 'general'
    },
    phone: {
        id: "8578",
        bitrixId: "UF_CRM_1747384595" as const,
        type: "string",
        name: "Участник 6 Телефон",
        code: BxParticipantsDataKeys.phone,
        multiple: false,
        mandatory: false,
        group: 'general'
    },
    comment: {
        id: "9028",
        bitrixId: "UF_CRM_1747737867" as const,
        type: "string",
        name: "Участник 6 Комментарий",
            code: BxParticipantsDataKeys.comment,
        multiple: false,
        mandatory: false,
        group: 'general'
    },

    format: {
        id: "8680",
        bitrixId: "UF_CRM_1747385392" as const,
        type: "enumeration",
        list: [
            {
                bitrixId: "18188",
                name: "Очно",
                sort: "10"
            },
            {
                bitrixId: "18190",
                name: "Онлайн",
                sort: "20"
            },
            {
                bitrixId: "18192",
                name: "Пойду только на ППК",
                sort: "30"
            }
        ],
        name: "Участник 6 Формат участия",
        code: BxParticipantsDataKeys.format,
        multiple: false,
        mandatory: false,
        group: 'seminar'
    },
    format_v2: {
        id: "9044",
        bitrixId: "UF_CRM_1747738174" as const,
        type: "enumeration",
        list: [
            {
                bitrixId: "18820",
                name: "Очно",
                sort: "10"
            },
            {
                bitrixId: "18822",
                name: "Онлайн",
                sort: "20"
            },
            {
                bitrixId: "18824",
                name: "Пойду только на ППК",
                sort: "30"
            }
        ],
        name: "Участник 6 Формат участия v2",
        code: BxParticipantsDataKeys.format_v2,
        multiple: false,
        mandatory: false,
        group: 'seminar'
    },
    is_ppk: {
        id: "8594",
        bitrixId: "UF_CRM_1747384786" as const,
        type: "boolean",
        name: "Участник 6 ППК",
        code: BxParticipantsDataKeys.is_ppk,
        multiple: false,
        mandatory: false,
        group: 'seminar'
    },

    accountant_gos: {
        id: "8786",
        bitrixId: "UF_CRM_1747732710" as const,
        type: "enumeration",
        list: [
            {
                bitrixId: "18284",
                name: "«Главный бухгалтер бюджетной сферы (код B). Новые стандарты учёта и отчётности. Налоги. Планирование. Контроль», 40 часов",
                sort: "10"
            },
            {
                bitrixId: "18286",
                name: "«Главный бухгалтер бюджетной сферы (код B). Новые стандарты учёта и отчётности. Налоги. Планирование. Контроль», 120 часов",
                sort: "20"
            },
            {
                bitrixId: "18288",
                name: "«Главный бухгалтер бюджетной сферы (код С). Новые стандарты учета и отчетности. Налоги. Планирование. Контроль», 120 часов",
                sort: "30"
            },
            {
                bitrixId: "18290",
                name: "«Бухгалтер бюджетной сферы (код А). Нефинансовые активы. Расчёты. Обязательства», 40 часов",
                sort: "40"
            },
            {
                bitrixId: "18292",
                name: "«Бухгалтер бюджетной сферы (код А). Нефинансовые активы. Расчёты. Обязательства», 120 часов",
                sort: "50"
            },
            {
                bitrixId: "18294",
                name: "«Учет заработной платы в организациях государственного сектора. Последние изменения, сложные практические вопросы взаимодействия кадровой службы и бухгалтерии», 60 часов",
                sort: "60"
            },
            {
                bitrixId: "18974",
                name: "«Актуальные вопросы финансового контроля в бюджетной сфере», 72 часа",
                sort: "70"
            }
        ],
        name: "Участник 6 Программы повышения квалификации для главных бухгалтеров и бухгалтеров бюджетной сферы",
            code: BxParticipantsDataKeys.accountant_gos,
        multiple: false,
        mandatory: false,
        group: 'ppk'
    },
    accountant_medical: {
        id: "8802",
        bitrixId: "UF_CRM_1747733504" as const,
        type: "enumeration",
        list: [
            {
                bitrixId: "18374",
                name: "«Главный бухгалтер государственного учреждения здравоохранения (код B)», 40 часов",
                sort: "10"
            },
            {
                bitrixId: "18376",
                name: "«Главный бухгалтер государственного учреждения здравоохранения (код B)», 120 часов",
                sort: "20"
            },
            {
                bitrixId: "18380",
                name: "«Бухгалтер государственного учреждения здравоохранения (код А)». 40 часов",
                sort: "40"
            },
            {
                bitrixId: "18382",
                name: "«Бухгалтер государственного учреждения здравоохранения (код А)». 120 часов",
                sort: "50"
            }
        ],
        name: "Участник 6 Программы повышения квалификации для главных бухгалтеров и бухгалтеров государственного учреждения здравоохранения",
        code: BxParticipantsDataKeys.accountant_medical,
        multiple: false,
        mandatory: false,
        group: 'ppk'
    },
    zakupki: {
        id: "8932",
        bitrixId: "UF_CRM_1747736541" as const,
        type: "enumeration",
        list: [
            {
                bitrixId: "18628",
                name: "«Организация закупок товаров, работ и услуг отдельными видами юридических лиц»,  60 часов",
                sort: "10"
            },
            {
                bitrixId: "18630",
                name: "«Контрактная система в сфере закупок товаров, работ, услуг для обеспечения государственных (муниципальных) нужд», 120 часов",
                sort: "20"
            },
            {
                bitrixId: "18632",
                name: "«Контрактная система в сфере закупок товаров, работ, услуг для обеспечения государственных (муниципальных) нужд», 40 часов",
                sort: "30"
            }
        ],
        name: "Участник 6 Программы повышения квалификации для специалистов по закупкам",
        code: BxParticipantsDataKeys.zakupki,
        multiple: false,
        mandatory: false,
        group: 'ppk'
    },
    kadry: {
        id: "8968",
        bitrixId: "UF_CRM_1747737393" as const      ,
        type: "enumeration",
        list: [
            {
                bitrixId: "18726",
                name: "«Правовое регулирование трудовых отношений и кадрового делопроизводства: последние изменения, типичные нарушения и ответственность за их совершение», 40 часов (Код А)",
                sort: "10"
            },
            {
                bitrixId: "18728",
                name: "«Правовое регулирование трудовых отношений и кадрового делопроизводства: последние изменения, типичные нарушения и ответственность за их совершение», 40 часов (Код Е)",
                sort: "20"
            }
        ],
        name: "Участник 6 Программы повышения квалификации для специалистов по кадрам",
        code: BxParticipantsDataKeys.kadry,
        multiple: false,
        mandatory: false
    },
    corruption: {
        id: "8992",
        bitrixId: "UF_CRM_1747737658" as const,
        type: "enumeration",
        list: [
            {
                bitrixId: "18768",
                name: "«Основы профилактики коррупции» (в соответствии с профессиональным стандартом \"Специалист в сфере предупреждения коррупционных правонарушений\"), 40 часов",
                sort: "10"
            }
        ],
        name: "Участник 6 Программы повышения квалификации для специалистов по антикоррупционной деятельности",
        code: BxParticipantsDataKeys.corruption,
        multiple: false,
        mandatory: false,
        group: 'ppk'
    },
    days: {
        id: "9060",
        bitrixId: "UF_CRM_1747738557" as const,
        type: "enumeration",
        list: [],
        name: "Участник 6 Дни участия v2",
        code: BxParticipantsDataKeys.days,
        multiple: true,
        mandatory: false,
        group: 'seminar'
    }

};

const participant_7 = {

    name: {
        id: "8548",
        bitrixId: "UF_CRM_1747384409" as const,
        type: "string",
        name: "Участник 7 ФИО",
        code: BxParticipantsDataKeys.name,
        multiple: false,
        mandatory: false,
        group: 'general'
    },
    email: {
        id: "8564",
        bitrixId: "UF_CRM_1747384505" as const,
        type: "string",
        name: "Участник 7 E-mail",
        code: BxParticipantsDataKeys.email,
        multiple: false,
        mandatory: false,
        group: 'general'
    },
    phone: {
        id: "8580",
        bitrixId: "UF_CRM_1747384604" as const,
        type: "string",
        name: "Участник 7 Телефон",
            code: BxParticipantsDataKeys.phone,
        multiple: false,
        mandatory: false,
        group: 'general'
    },
    comment: {
        id: "9030",
        bitrixId: "UF_CRM_1747737878" as const,
        type: "string",
        name: "Участник 7 Комментарий",
        code: BxParticipantsDataKeys.comment,
        multiple: false,
        mandatory: false,
        group: 'general'
    },


    format: {
        id: "8684",
        bitrixId: "UF_CRM_1747385508" as const,
        type: "enumeration",
        list: [
            {
                bitrixId: "18200",
                name: "Очно",
                sort: "10"
            },
            {
                bitrixId: "18202",
                name: "Онлайн",
                sort: "20"
            },
            {
                bitrixId: "18204",
                name: "Пойду только на ППК",
                sort: "30"
            }
        ],
        name: "Участник 7 Формат участия",
        code: BxParticipantsDataKeys.format,
        multiple: false,
        mandatory: false,
        group: 'seminar'
    },
    format_v2: {
        id: "9046",
        bitrixId: "UF_CRM_1747738224" as const,
        type: "enumeration",
        list: [
            {
                bitrixId: "18826",
                name: "Очно",
                sort: "10"
            },
            {
                bitrixId: "18828",
                name: "Онлайн",
                sort: "20"
            },
            {
                bitrixId: "18830",
                name: "Пойду только на ППК",
                sort: "30"
            }
        ],
        name: "Участник 7 Формат участия v2",
        code: BxParticipantsDataKeys.format_v2,
        multiple: false,
        mandatory: false,
        group: 'seminar'
    },
    is_ppk: {
        id: "8612",
        bitrixId: "UF_CRM_1747384803" as const,
        type: "boolean",
        name: "Участник 7 ППК",
        code: BxParticipantsDataKeys.is_ppk,
        multiple: false,
        mandatory: false,
        group: 'seminar'
    },

    accountant_gos: {
        id: "8788",
        bitrixId: "UF_CRM_1747732788" as const,
        type: "enumeration",
        list: [
            {
                bitrixId: "18296",
                name: "«Главный бухгалтер бюджетной сферы (код B). Новые стандарты учёта и отчётности. Налоги. Планирование. Контроль», 40 часов",
                sort: "10"
            },
            {
                bitrixId: "18298",
                name: "«Главный бухгалтер бюджетной сферы (код B). Новые стандарты учёта и отчётности. Налоги. Планирование. Контроль», 120 часов",
                sort: "20"
            },
            {
                bitrixId: "18300",
                name: "«Главный бухгалтер бюджетной сферы (код С). Новые стандарты учета и отчетности. Налоги. Планирование. Контроль», 120 часов",
                sort: "30"
            },
            {
                bitrixId: "18302",
                name: "«Бухгалтер бюджетной сферы (код А). Нефинансовые активы. Расчёты. Обязательства», 40 часов",
                sort: "40"
            },
            {
                bitrixId: "18304",
                name: "«Бухгалтер бюджетной сферы (код А). Нефинансовые активы. Расчёты. Обязательства», 120 часов",
                sort: "50"
            },
            {
                bitrixId: "18306",
                name: "«Учет заработной платы в организациях государственного сектора. Последние изменения, сложные практические вопросы взаимодействия кадровой службы и бухгалтерии», 60 часов",
                sort: "60"
            },
            {
                bitrixId: "18978",
                name: "«Актуальные вопросы финансового контроля в бюджетной сфере», 72 часа",
                sort: "70"
            }
        ],
        name: "Участник 7 Программы повышения квалификации для главных бухгалтеров и бухгалтеров бюджетной сферы",
            code: BxParticipantsDataKeys.accountant_gos,
        multiple: false,
        mandatory: false,
        group: 'ppk'
    },
    accountant_medical: {
        id: "8804",
        bitrixId: "UF_CRM_1747733555" as const,
        type: "enumeration",
        list: [
            {
                bitrixId: "18384",
                name: "«Главный бухгалтер государственного учреждения здравоохранения (код B)», 40 часов",
                sort: "10"
            },
            {
                bitrixId: "18386",
                name: "«Главный бухгалтер государственного учреждения здравоохранения (код B)», 120 часов",
                sort: "20"
            },
            {
                bitrixId: "18390",
                name: "«Бухгалтер государственного учреждения здравоохранения (код А)». 40 часов",
                sort: "40"
            },
            {
                bitrixId: "18392",
                name: "«Бухгалтер государственного учреждения здравоохранения (код А)». 120 часов",
                sort: "50"
            }
        ],
        name: "Участник 7 Программы повышения квалификации для главных бухгалтеров и бухгалтеров государственного учреждения здравоохранения",
        code: BxParticipantsDataKeys.accountant_medical,
        multiple: false,
        mandatory: false,
        group: 'ppk'
    },
    zakupki: {
        id: "8934",
        bitrixId: "UF_CRM_1747736578" as const,
        type: "enumeration",
        list: [
            {
                bitrixId: "18634",
                name: "«Организация закупок товаров, работ и услуг отдельными видами юридических лиц»,  60 часов",
                sort: "10"
            },
            {
                bitrixId: "18636",
                name: "«Контрактная система в сфере закупок товаров, работ, услуг для обеспечения государственных (муниципальных) нужд», 120 часов",
                sort: "20"
            },
            {
                bitrixId: "18638",
                name: "«Контрактная система в сфере закупок товаров, работ, услуг для обеспечения государственных (муниципальных) нужд», 40 часов",
                sort: "30"
            }
        ],
        name: "Участник 7 Программы повышения квалификации для специалистов по закупкам",
        code: BxParticipantsDataKeys.zakupki,
        multiple: false,
        mandatory: false,
        group: 'ppk'
    },
    kadry: {
        id: "8970",
        bitrixId: "UF_CRM_1747737425" as const,
        type: "enumeration",
        list: [
            {
                bitrixId: "18730",
                name: "«Правовое регулирование трудовых отношений и кадрового делопроизводства: последние изменения, типичные нарушения и ответственность за их совершение», 40 часов (Код А)",
                sort: "10"
            },
            {
                bitrixId: "18732",
                name: "«Правовое регулирование трудовых отношений и кадрового делопроизводства: последние изменения, типичные нарушения и ответственность за их совершение», 40 часов (Код Е)",
                sort: "20"
            }
        ],
        name: "Участник 7 Программы повышения квалификации для специалистов по кадрам",
        code: BxParticipantsDataKeys.kadry,
        multiple: false,
        mandatory: false,
        group: 'ppk'
    },
    corruption: {
        id: "8994",
        bitrixId: "UF_CRM_1747737693" as const,
        type: "enumeration",
        list: [
            {
                bitrixId: "18770",
                name: "«Основы профилактики коррупции» (в соответствии с профессиональным стандартом \"Специалист в сфере предупреждения коррупционных правонарушений\"), 40 часов",
                sort: "10"
            }
        ],
        name: "Участник 7 Программы повышения квалификации для специалистов по антикоррупционной деятельности",
        code: BxParticipantsDataKeys.corruption,
        multiple: false,
        mandatory: false,
        group: 'ppk'
    },
    days: {
        id: "9062",
        bitrixId: "UF_CRM_1747738571" as const,
        type: "enumeration",
        list: [],
        name: "Участник 7 Дни участия v2",
        code: BxParticipantsDataKeys.days,
        multiple: true,
        mandatory: false,
        group: 'seminar'
    }

};

const participant_8 = {

    name: {
        id: "8550",
        bitrixId: "UF_CRM_1747384420" as const,
        type: "string",
        name: "Участник 8 ФИО",
        code: BxParticipantsDataKeys.name,
        multiple: false,
        mandatory: false,
        group: 'general'
    },
    email: {
        id: "8566",
        bitrixId: "UF_CRM_1747384514" as const,
        type: "string",
        name: "Участник 8 E-mail",
        code: BxParticipantsDataKeys.email,
        multiple: false,
        mandatory: false,
        group: 'general'
    },
    phone: {
        id: "8582",
        bitrixId: "UF_CRM_1747384612" as const,
        type: "string",
        name: "Участник 8 Телефон",
            code: BxParticipantsDataKeys.phone,
        multiple: false,
        mandatory: false,
        group: 'general'
    },
    comment: {
        id: "9032",
        bitrixId: "UF_CRM_1747737889" as const,
        type: "string",
        name: "Участник 8 Комментарий",
        code: BxParticipantsDataKeys.comment,
        multiple: false,
        mandatory: false,
        group: 'general'
    },

    format: {
        id: "8686",
        bitrixId: "UF_CRM_1747385550" as const,
        type: "enumeration",
        list: [
            {
                bitrixId: "18206",
                name: "Очно",
                sort: "10"
            },
            {
                bitrixId: "18208",
                name: "Онлайн",
                sort: "20"
            },
            {
                bitrixId: "18210",
                name: "Пойду только на ППК",
                sort: "30"
            }
        ],
        name: "Участник 8 Формат участия",
        code: BxParticipantsDataKeys.format,
        multiple: false,
        mandatory: false,
        group: 'seminar'
    },
    format_v2: {
        id: "9048",
        bitrixId: "UF_CRM_1747738256" as const,
        type: "enumeration",
        list: [
            {
                bitrixId: "18832",
                name: "Очно",
                sort: "10"
            },
            {
                bitrixId: "18834",
                name: "Онлайн",
                sort: "20"
            },
            {
                bitrixId: "18836",
                name: "Пойду только на ППК",
                sort: "30"
            }
        ],
        name: "Участник 8 Формат участия v2",
        code: BxParticipantsDataKeys.format_v2,
        multiple: false,
        mandatory: false,
        group: 'seminar'
    },
    is_ppk: {
        id: "8654",
        bitrixId: "UF_CRM_1747384831" as const      ,
        type: "boolean",
        name: "Участник 8 ППК",
        code: BxParticipantsDataKeys.is_ppk,
        multiple: false,
        mandatory: false,
        group: 'seminar'
    },

    accountant_gos: {
        id: "8790",
        bitrixId: "UF_CRM_1747732876" as const,
        type: "enumeration",
        list: [
            {
                bitrixId: "18308",
                name: "«Главный бухгалтер бюджетной сферы (код B). Новые стандарты учёта и отчётности. Налоги. Планирование. Контроль», 40 часов",
                sort: "10"
            },
            {
                bitrixId: "18310",
                name: "«Главный бухгалтер бюджетной сферы (код B). Новые стандарты учёта и отчётности. Налоги. Планирование. Контроль», 120 часов",
                sort: "20"
            },
            {
                bitrixId: "18312",
                name: "«Главный бухгалтер бюджетной сферы (код С). Новые стандарты учета и отчетности. Налоги. Планирование. Контроль», 120 часов",
                sort: "30"
            },
            {
                bitrixId: "18314",
                name: "«Бухгалтер бюджетной сферы (код А). Нефинансовые активы. Расчёты. Обязательства», 40 часов",
                sort: "40"
            },
            {
                bitrixId: "18316",
                name: "«Бухгалтер бюджетной сферы (код А). Нефинансовые активы. Расчёты. Обязательства», 120 часов",
                sort: "50"
            },
            {
                bitrixId: "18318",
                name: "«Учет заработной платы в организациях государственного сектора. Последние изменения, сложные практические вопросы взаимодействия кадровой службы и бухгалтерии», 60 часов",
                sort: "60"
            },
            {
                bitrixId: "18982",
                name: "«Актуальные вопросы финансового контроля в бюджетной сфере», 72 часа",
                sort: "70"
            }
        ],
        name: "Участник 8 Программы повышения квалификации для главных бухгалтеров и бухгалтеров бюджетной сферы",
            code: BxParticipantsDataKeys.accountant_gos,
        multiple: false,
        mandatory: false,
        group: 'ppk'
    },
    accountant_medical: {
        id: "8808",
        bitrixId: "UF_CRM_1747734032" as const,
        type: "enumeration",
        list: [
            {
                bitrixId: "18404",
                name: "«Главный бухгалтер государственного учреждения здравоохранения (код B)», 40 часов",
                sort: "10"
            },
            {
                bitrixId: "18406",
                name: "«Главный бухгалтер государственного учреждения здравоохранения (код B)», 120 часов",
                sort: "20"
            },
            {
                bitrixId: "18410",
                name: "«Бухгалтер государственного учреждения здравоохранения (код А)». 40 часов",
                sort: "40"
            },
            {
                bitrixId: "18412",
                name: "«Бухгалтер государственного учреждения здравоохранения (код А)». 120 часов",
                sort: "50"
            }
        ],
        name: "Участник 8 Программы повышения квалификации для главных бухгалтеров и бухгалтеров государственного учреждения здравоохранения",
        code: BxParticipantsDataKeys.accountant_medical,
        multiple: false,
        mandatory: false,
        group: 'ppk'
    },
    zakupki: {
        id: "8946",
        bitrixId: "UF_CRM_1747736644" as const,
        type: "enumeration",
        list: [
            {
                bitrixId: "18670",
                name: "«Организация закупок товаров, работ и услуг отдельными видами юридических лиц»,  60 часов",
                sort: "10"
            },
            {
                bitrixId: "18672",
                name: "«Контрактная система в сфере закупок товаров, работ, услуг для обеспечения государственных (муниципальных) нужд», 120 часов",
                sort: "20"
            },
            {
                bitrixId: "18674",
                name: "«Контрактная система в сфере закупок товаров, работ, услуг для обеспечения государственных (муниципальных) нужд», 40 часов",
                sort: "30"
            }
        ],
        name: "Участник 8 Программы повышения квалификации для специалистов по закупкам",
        code: BxParticipantsDataKeys.zakupki,
        multiple: false,
        mandatory: false,
        group: 'ppk'
    },
    kadry: {
        id: "8972",
        bitrixId: "UF_CRM_1747737461" as const,
        type: "enumeration",
        list: [
            {
                bitrixId: "18734",
                name: "«Правовое регулирование трудовых отношений и кадрового делопроизводства: последние изменения, типичные нарушения и ответственность за их совершение», 40 часов (Код А)",
                sort: "10"
            },
            {
                bitrixId: "18736",
                name: "«Правовое регулирование трудовых отношений и кадрового делопроизводства: последние изменения, типичные нарушения и ответственность за их совершение», 40 часов (Код Е)",
                sort: "20"
            }
        ],
        name: "Участник 8 Программы повышения квалификации для специалистов по кадрам",
        code: BxParticipantsDataKeys.kadry,
        multiple: false,
        mandatory: false,
        group: 'ppk'
    },
    corruption: {
        id: "8996",
        bitrixId: "UF_CRM_1747737717" as const,
        type: "enumeration",
        list: [
            {
                bitrixId: "18772",
                name: "«Основы профилактики коррупции» (в соответствии с профессиональным стандартом \"Специалист в сфере предупреждения коррупционных правонарушений\"), 40 часов",
                sort: "10"
            }
        ],
        name: "Участник 8 Программы повышения квалификации для специалистов по антикоррупционной деятельности",
        code: BxParticipantsDataKeys.corruption,
        multiple: false,
        mandatory: false,
        group: 'ppk'
    },
    days: {
        id: "9064",
        bitrixId: "UF_CRM_1747738594" as const  ,
        type: "enumeration",
        list: [],
        name: "Участник 8 Дни участия v2",
        code: BxParticipantsDataKeys.days,
        multiple: true,
        mandatory: false,
        group: 'seminar'
    }

};

const participant_9 = {

    name: {
        id: "8552",
        bitrixId: "UF_CRM_1747384430" as const,
        type: "string",
        name: "Участник 9 ФИО",
        code: BxParticipantsDataKeys.name,
        multiple: false,
        mandatory: false,
        group: 'general'
    },
    email: {
        id: "8568",
        bitrixId: "UF_CRM_1747384523" as const,
        type: "string",
        name: "Участник 9 E-mail",
        code: BxParticipantsDataKeys.email,
        multiple: false,
        mandatory: false,
        group: 'general'
    },
    phone: {
        id: "8584",
        bitrixId: "UF_CRM_1747384621" as const,
        type: "string",
        name: "Участник 9 Телефон",
                code: BxParticipantsDataKeys.phone,
        multiple: false,
        mandatory: false,
        group: 'general'
    },
    comment: {
        id: "9034",
        bitrixId: "UF_CRM_1747737900" as const,
        type: "string",
        name: "Участник 9 Комментарий",
        code: BxParticipantsDataKeys.comment,
        multiple: false,
        mandatory: false,
        group: 'general'
    },

    format: {
        id: "8688",
        bitrixId: "UF_CRM_1747385586" as const,
        type: "enumeration",
        list: [
            {
                bitrixId: "18212",
                name: "Очно",
                sort: "10"
            },
            {
                bitrixId: "18214",
                name: "Онлайн",
                sort: "20"
            },
            {
                bitrixId: "18216",
                name: "Пойду только на ППК",
                sort: "30"
            }
        ],
        name: "Участник 9 Формат участия",
        code: BxParticipantsDataKeys.format,
        multiple: false,
        mandatory: false,
        group: 'seminar'
    },
    format_v2: {
        id: "9050",
        bitrixId: "UF_CRM_1747738292" as const,
        type: "enumeration",
        list: [
            {
                bitrixId: "18838",
                name: "Очно",
                sort: "10"
            },
            {
                bitrixId: "18840",
                name: "Онлайн",
                sort: "20"
            },
            {
                bitrixId: "18842",
                name: "Пойду только на ППК",
                sort: "30"
            }
        ],
        name: "Участник 9 Формат участия v2",
        code: BxParticipantsDataKeys.format_v2,
        multiple: false,
        mandatory: false,
        group: 'seminar'
    },
    is_ppk: {
        id: "8656",
        bitrixId: "UF_CRM_1747384849" as const,
        type: "boolean",
        name: "Участник 9 ППК",
        code: BxParticipantsDataKeys.is_ppk,
        multiple: false,
        mandatory: false,
        group: 'seminar'
    },

    accountant_gos: {
        id: "8792",
        bitrixId: "UF_CRM_1747732930" as const  ,
        type: "enumeration",
        list: [
            {
                bitrixId: "18320",
                name: "«Главный бухгалтер бюджетной сферы (код B). Новые стандарты учёта и отчётности. Налоги. Планирование. Контроль», 40 часов",
                sort: "10"
            },
            {
                bitrixId: "18322",
                name: "«Главный бухгалтер бюджетной сферы (код B). Новые стандарты учёта и отчётности. Налоги. Планирование. Контроль», 120 часов",
                sort: "20"
            },
            {
                bitrixId: "18324",
                name: "«Главный бухгалтер бюджетной сферы (код С). Новые стандарты учета и отчетности. Налоги. Планирование. Контроль», 120 часов",
                sort: "30"
            },
            {
                bitrixId: "18326",
                name: "«Бухгалтер бюджетной сферы (код А). Нефинансовые активы. Расчёты. Обязательства», 40 часов",
                sort: "40"
            },
            {
                bitrixId: "18328",
                name: "«Бухгалтер бюджетной сферы (код А). Нефинансовые активы. Расчёты. Обязательства», 120 часов",
                sort: "50"
            },
            {
                bitrixId: "18330",
                name: "«Учет заработной платы в организациях государственного сектора. Последние изменения, сложные практические вопросы взаимодействия кадровой службы и бухгалтерии», 60 часов",
                sort: "60"
            },
            {
                bitrixId: "18986",
                name: "«Актуальные вопросы финансового контроля в бюджетной сфере», 72 часа",
                sort: "70"
            }
        ],
        name: "Участник 9 Программы повышения квалификации для главных бухгалтеров и бухгалтеров бюджетной сферы",
            code: BxParticipantsDataKeys.accountant_gos,
        multiple: false,
        mandatory: false,
        group: 'ppk'
    },
    accountant_medical: {
        id: "8810",
        bitrixId: "UF_CRM_1747734102" as const,
        type: "enumeration",
        list: [
            {
                bitrixId: "18414",
                name: "«Главный бухгалтер государственного учреждения здравоохранения (код B)», 40 часов",
                sort: "10"
            },
            {
                bitrixId: "18416",
                name: "«Главный бухгалтер государственного учреждения здравоохранения (код B)», 120 часов",
                sort: "20"
            },
            {
                bitrixId: "18420",
                name: "«Бухгалтер государственного учреждения здравоохранения (код А)». 40 часов",
                sort: "40"
            },
            {
                bitrixId: "18422",
                name: "«Бухгалтер государственного учреждения здравоохранения (код А)». 120 часов",
                sort: "50"
            }
        ],
        name: "Участник 9 Программы повышения квалификации для главных бухгалтеров и бухгалтеров государственного учреждения здравоохранения",
        code: BxParticipantsDataKeys.accountant_medical,
        multiple: false,
        mandatory: false,
        group: 'ppk'
    },
    zakupki: {
        id: "8948",
        bitrixId: "UF_CRM_1747736686" as const,
        type: "enumeration",
        list: [
            {
                bitrixId: "18676",
                name: "«Организация закупок товаров, работ и услуг отдельными видами юридических лиц»,  60 часов",
                sort: "10"
            },
            {
                bitrixId: "18678",
                name: "«Контрактная система в сфере закупок товаров, работ, услуг для обеспечения государственных (муниципальных) нужд», 120 часов",
                sort: "20"
            },
            {
                bitrixId: "18680",
                name: "«Контрактная система в сфере закупок товаров, работ, услуг для обеспечения государственных (муниципальных) нужд», 40 часов",
                sort: "30"
            }
        ],
        name: "Участник 9 Программы повышения квалификации для специалистов по закупкам",
        code: BxParticipantsDataKeys.zakupki,
        multiple: false,
        mandatory: false,
        group: 'ppk'
    },
    kadry: {
        id: "8982",
        bitrixId: "UF_CRM_1747737495" as const,
        type: "enumeration",
        list: [
            {
                bitrixId: "18754",
                name: "«Правовое регулирование трудовых отношений и кадрового делопроизводства: последние изменения, типичные нарушения и ответственность за их совершение», 40 часов (Код А)",
                sort: "10"
            },
            {
                bitrixId: "18756",
                name: "«Правовое регулирование трудовых отношений и кадрового делопроизводства: последние изменения, типичные нарушения и ответственность за их совершение», 40 часов (Код Е)",
                sort: "20"
            }
        ],
        name: "Участник 9 Программы повышения квалификации для специалистов по кадрам",
        code: BxParticipantsDataKeys.kadry,
        multiple: false,
        mandatory: false,
        group: 'ppk'
    },
    corruption: {
        id: "8998",
        bitrixId: "UF_CRM_1747737742" as const,
        type: "enumeration",
        list: [
            {
                bitrixId: "18774",
                name: "«Основы профилактики коррупции» (в соответствии с профессиональным стандартом \"Специалист в сфере предупреждения коррупционных правонарушений\"), 40 часов",
                sort: "10"
            }
        ],
        name: "Участник 9 Программы повышения квалификации для специалистов по антикоррупционной деятельности",
        code: BxParticipantsDataKeys.corruption,
        multiple: false,
        mandatory: false,
        group: 'ppk'
    },
    days: {
        id: "9066",
        bitrixId: "UF_CRM_1747738613" as const,
        type: "enumeration",
        list: [],
        name: "Участник 9 Дни участия v2",
        code: BxParticipantsDataKeys.days,
        multiple: true,
        mandatory: false,
        group: 'seminar'
    }

};

const participant_10 = {

    name: {
        id: "8554",
        bitrixId: "UF_CRM_1747384442" as const  ,
        type: "string",
        name: "Участник 10 ФИО",
        code: BxParticipantsDataKeys.name,
        multiple: false,
        mandatory: false,
        group: 'general'
    },
    email: {
        id: "8570",
        bitrixId: "UF_CRM_1747384532" as const,
        type: "string",
        name: "Участник 10 E-mail",
        code: BxParticipantsDataKeys.email,
        multiple: false,
        mandatory: false,
        group: 'general'
    },
    phone: {
        id: "8586",
        bitrixId: "UF_CRM_1747384631" as const,
        type: "string",
        name: "Участник 10 Телефон",
                code: BxParticipantsDataKeys.phone,
        multiple: false,
        mandatory: false,
        group: 'general'
    },
    comment: {
        id: "9036",
        bitrixId: "UF_CRM_1747737911" as const,
        type: "string",
        name: "Участник 10 Комментарий",
        code: BxParticipantsDataKeys.comment,
        multiple: false,
        mandatory: false,
        group: 'general'
    },

    format: {
        id: "8690",
        bitrixId: "UF_CRM_1747385631" as const,
        type: "enumeration",
        list: [
            {
                bitrixId: "18218",
                name: "Очно",
                sort: "10"
            },
            {
                bitrixId: "18220",
                name: "Онлайн",
                sort: "20"
            },
            {
                bitrixId: "18222",
                name: "Пойду только на ППК",
                sort: "30"
            }
        ],
        name: "Участник 10 Формат участия",
        code: BxParticipantsDataKeys.format,
        multiple: false,
        mandatory: false,
        group: 'seminar'
    },
    format_v2: {
        id: "9052",
        bitrixId: "UF_CRM_1747738329" as const,
        type: "enumeration",
        list: [
            {
                bitrixId: "18844",
                name: "Очно",
                sort: "10"
            },
            {
                bitrixId: "18846",
                name: "Онлайн",
                sort: "20"
            },
            {
                bitrixId: "18848",
                name: "Пойду только на ППК",
                sort: "30"
            }
        ],
        name: "Участник 10 Формат участия v2",
        code: BxParticipantsDataKeys.format_v2,
        multiple: false,
        mandatory: false,
        group: 'seminar'
    },
    is_ppk: {
        id: "8658",
        bitrixId: "UF_CRM_1747384866" as const,
        type: "boolean",
        name: "Участник 10 ППК",
        code: BxParticipantsDataKeys.is_ppk,
        multiple: false,
        mandatory: false,
        group: 'ppk'
    },

    accountant_gos: {
        id: "8794",
        bitrixId: "UF_CRM_1747733091" as const,
        type: "enumeration",
        list: [
            {
                bitrixId: "18332",
                name: "«Главный бухгалтер бюджетной сферы (код B). Новые стандарты учёта и отчётности. Налоги. Планирование. Контроль», 40 часов",
                sort: "10"
            },
            {
                bitrixId: "18334",
                name: "«Главный бухгалтер бюджетной сферы (код B). Новые стандарты учёта и отчётности. Налоги. Планирование. Контроль», 120 часов",
                sort: "20"
            },
            {
                bitrixId: "18336",
                name: "«Главный бухгалтер бюджетной сферы (код С). Новые стандарты учета и отчетности. Налоги. Планирование. Контроль», 120 часов",
                sort: "30"
            },
            {
                bitrixId: "18338",
                name: "«Бухгалтер бюджетной сферы (код А). Нефинансовые активы. Расчёты. Обязательства», 40 часов",
                sort: "40"
            },
            {
                bitrixId: "18340",
                name: "«Бухгалтер бюджетной сферы (код А). Нефинансовые активы. Расчёты. Обязательства», 120 часов",
                sort: "50"
            },
            {
                bitrixId: "18342",
                name: "«Учет заработной платы в организациях государственного сектора. Последние изменения, сложные практические вопросы взаимодействия кадровой службы и бухгалтерии», 60 часов",
                sort: "60"
            },
            {
                bitrixId: "18990",
                name: "«Актуальные вопросы финансового контроля в бюджетной сфере», 72 часа",
                sort: "70"
            }
        ],
        name: "Участник 10 Программы повышения квалификации для главных бухгалтеров и бухгалтеров бюджетной сферы",
            code: BxParticipantsDataKeys.accountant_gos,
        multiple: false,
        mandatory: false,
        group: 'ppk'
    },
    accountant_medical: {
        id: "8812",
        bitrixId: "UF_CRM_1747734152" as const,
        type: "enumeration",
        list: [
            {
                bitrixId: "18424",
                name: "«Главный бухгалтер государственного учреждения здравоохранения (код B)», 40 часов",
                sort: "10"
            },
            {
                bitrixId: "18426",
                name: "«Главный бухгалтер государственного учреждения здравоохранения (код B)», 120 часов",
                sort: "20"
            },
            {
                bitrixId: "18430",
                name: "«Бухгалтер государственного учреждения здравоохранения (код А)». 40 часов",
                sort: "40"
            },
            {
                bitrixId: "18432",
                name: "«Бухгалтер государственного учреждения здравоохранения (код А)». 120 часов",
                sort: "50"
            }
        ],
        name: "Участник 10 Программы повышения квалификации для главных бухгалтеров и бухгалтеров государственного учреждения здравоохранения",
        code: BxParticipantsDataKeys.accountant_medical,
        multiple: false,
        mandatory: false,
        group: 'ppk'
    },
    zakupki: {
        id: "8950",
        bitrixId: "UF_CRM_1747736731" as const,
        type: "enumeration",
        list: [
            {
                bitrixId: "18682",
                name: "«Организация закупок товаров, работ и услуг отдельными видами юридических лиц»,  60 часов",
                sort: "10"
            },
            {
                bitrixId: "18684",
                name: "«Контрактная система в сфере закупок товаров, работ, услуг для обеспечения государственных (муниципальных) нужд», 120 часов",
                sort: "20"
            },
            {
                bitrixId: "18686",
                name: "«Контрактная система в сфере закупок товаров, работ, услуг для обеспечения государственных (муниципальных) нужд», 40 часов",
                sort: "30"
            }
        ],
        name: "Участник 10 Программы повышения квалификации для специалистов по закупкам",
        code: BxParticipantsDataKeys.zakupki,
        multiple: false,
        mandatory: false,
        group: 'ppk'
    },
    kadry: {
        id: "8984",
        bitrixId: "UF_CRM_1747737527" as const,
        type: "enumeration",
        list: [
            {
                bitrixId: "18758",
                name: "«Правовое регулирование трудовых отношений и кадрового делопроизводства: последние изменения, типичные нарушения и ответственность за их совершение», 40 часов (Код А)",
                sort: "10"
            },
            {
                bitrixId: "18760",
                name: "«Правовое регулирование трудовых отношений и кадрового делопроизводства: последние изменения, типичные нарушения и ответственность за их совершение», 40 часов (Код Е)",
                sort: "20"
            }
        ],
        name: "Участник 10 Программы повышения квалификации для специалистов по кадрам",
        code: BxParticipantsDataKeys.kadry,
        multiple: false,
        mandatory: false,
        group: 'ppk'
    },
    corruption: {
        id: "9000",
        bitrixId: "UF_CRM_1747737770" as const,
        type: "enumeration",
        list: [
            {
                bitrixId: "18776",
                name: "«Основы профилактики коррупции» (в соответствии с профессиональным стандартом \"Специалист в сфере предупреждения коррупционных правонарушений\"), 40 часов",
                sort: "10"
            }
        ],
        name: "Участник 10 Программы повышения квалификации для специалистов по антикоррупционной деятельности",
        code: BxParticipantsDataKeys.corruption,
        multiple: false,
        mandatory: false,
        group: 'ppk'
    },
    days: {
        id: "9068",
        bitrixId: "UF_CRM_1747738629" as const,
        type: "enumeration",
        list: [],
        name: "Участник 10 Дни участия v2",
        code: BxParticipantsDataKeys.days,
        multiple: true,
        mandatory: false,
        group: 'seminar'
    }

};

export const BxParticipantsData = {
    1: participant_1,
    2: participant_2,
    3: participant_3,
    4: participant_4,
    5: participant_5,
    6: participant_6,
    7: participant_7,
    8: participant_8,
    9: participant_9,
    10: participant_10,
}

