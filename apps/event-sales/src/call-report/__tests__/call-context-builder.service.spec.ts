import { CallContextBuilderService } from '../services/call-context-builder.service';

const row = (overrides?: Record<string, unknown>) => ({
    id: '115',
    domain: 'test.bitrix24.ru',
    activityId: '901',
    entityType: 'deal',
    entityId: '555',
    callStartedAt: new Date('2026-07-30T10:00:00Z'),
    text: 'текст',
    ...overrides,
});

const makeDeps = (options?: {
    dealStage?: string | null;
    /** CATEGORY_ID сделки; по умолчанию 5 (воронка презентаций в pbx). */
    dealCategory?: number;
    leadStatus?: string;
    /** Дополнительные поля лида (для детекта «лид — заявка»). */
    leadFields?: Record<string, unknown>;
    /** Контакт сделки и его карточка (для подсказки специализации). */
    dealContactId?: number;
    contactPost?: string;
    contactName?: string;
    contactComments?: string;
    /** Компания сделки и её карточка. */
    dealCompanyId?: number;
    companyTitle?: string;
    companyComments?: string;
    /** Записи «ОП История» (UF_CRM_OP_MHISTORY) в строке сделки. */
    dealOpHistory?: string[];
    /** Раскладка связей: сделка «ОП Основная», найденная по клиенту. */
    mainDealId?: number;
    /** Стадия/воронка этой основной сделки — источник приора. */
    mainDealStage?: string;
    mainDealCategory?: number;
    direction?: string;
    phoneMatches?: Record<string, number[]>;
    history?: { id: string; callStartedAt: Date | null }[];
    resumeByTranscription?: Record<string, string>;
    /** Названия наших организаций из настроек портала. */
    ownOrgNames?: string[];
    /** Настройки портала недоступны — паспорт без имён (fail-open). */
    settingsError?: boolean;
    /** Тип звонка из уже сделанной записи классификатора этой строки. */
    classifiedType?: string;
}) => {
    const api = {
        call: jest.fn((method: string, data?: Record<string, unknown>) => {
            if (method === 'crm.deal.get') {
                // Дочитывание основной сделки из раскладки связей — по её id.
                if (
                    options?.mainDealId &&
                    Number(data?.id) === options.mainDealId
                ) {
                    return Promise.resolve({
                        result: {
                            STAGE_ID: options.mainDealStage ?? 'PREPARATION',
                            CATEGORY_ID: options.mainDealCategory ?? 0,
                        },
                    });
                }
                return Promise.resolve(
                    options?.dealStage === null
                        ? {}
                        : {
                              result: {
                                  STAGE_ID: options?.dealStage ?? 'C5:PREP',
                                  CATEGORY_ID: options?.dealCategory ?? 5,
                                  CONTACT_ID: options?.dealContactId,
                                  COMPANY_ID: options?.dealCompanyId,
                                  UF_CRM_OP_MHISTORY: options?.dealOpHistory,
                              },
                          },
                );
            }
            if (method === 'crm.contact.get') {
                return Promise.resolve({
                    result: {
                        POST: options?.contactPost,
                        NAME: options?.contactName,
                        COMMENTS: options?.contactComments,
                    },
                });
            }
            if (method === 'crm.company.get') {
                return Promise.resolve({
                    result: {
                        TITLE: options?.companyTitle,
                        COMMENTS: options?.companyComments,
                    },
                });
            }
            if (method === 'crm.lead.get') {
                return Promise.resolve({
                    result: {
                        STATUS_ID: options?.leadStatus ?? 'NEW',
                        ...options?.leadFields,
                    },
                });
            }
            if (method === 'crm.duplicate.findbycomm') {
                return Promise.resolve({
                    result: options?.phoneMatches ?? {},
                });
            }
            return Promise.resolve({});
        }),
    };
    const bitrix = {
        api,
        activity: {
            getAllFresh: jest.fn().mockResolvedValue({
                activities: [
                    {
                        ID: '901',
                        DIRECTION: options?.direction ?? '2',
                        COMMUNICATIONS: [{ VALUE: '+79997776655' }],
                    },
                ],
            }),
        },
    };
    // Слепок портала: из наших полей заведено только op_mhistory —
    // детект заявки работает по UF-полям лидогена и SOURCE_ID лида.
    const portalModel = {
        getEntityFieldByCode: jest.fn((entity: string, code: string) =>
            code === 'op_mhistory' ? { code } : null,
        ),
        getFieldBitrixId: jest.fn().mockReturnValue('UF_CRM_OP_MHISTORY'),
        // Воронки pbx: основная (0) и презентаций (5) — для обратного
        // резолва CATEGORY_ID/STAGE_ID в коды и приора типа звонка.
        getDealCategories: jest.fn().mockReturnValue([
            {
                bitrixId: '0',
                code: 'sales_base',
                stages: [
                    { code: 'sales_pres', bitrixId: 'PREPARATION' },
                    { code: 'sales_double', bitrixId: 'APOLOGY' },
                ],
            },
            {
                bitrixId: '5',
                code: 'sales_presentation',
                stages: [
                    {
                        code: 'sales_presentation_presentation',
                        bitrixId: 'C5:EXECUTING',
                    },
                ],
            },
        ]),
    };
    const pbxService = {
        init: jest.fn().mockResolvedValue({ bitrix, PortalModel: portalModel }),
    };
    // Кэш паспорта: по умолчанию промах (get→null), запись — no-op.
    const redisClient = {
        get: jest.fn().mockResolvedValue(null),
        set: jest.fn().mockResolvedValue('OK'),
    };
    const redisService = { getClient: () => redisClient };
    const transcriptionStore = {
        findRecentByEntity: jest.fn().mockResolvedValue(options?.history ?? []),
    };
    const aiService = {
        findByTranscriptionIds: jest.fn().mockResolvedValue([
            ...(options?.classifiedType
                ? [
                      {
                          transcription_id: '115',
                          type: 'call-classify',
                          result: options.classifiedType,
                      },
                  ]
                : []),
            ...Object.entries(options?.resumeByTranscription ?? {}).map(
                ([transcriptionId, resume]) => ({
                    transcription_id: transcriptionId,
                    type: 'call-resume',
                    result: resume,
                }),
            ),
        ]),
    };
    // Раскладка связей: даёт правильную сделку «ОП Основная» для приора.
    const dealFamily = {
        resolve: jest.fn().mockResolvedValue({
            mainDealId: options?.mainDealId,
        }),
    };
    // Настройки портала: нужны только названия своих организаций (по
    // умолчанию их нет — прежнее поведение промпта).
    const reportSettings = {
        resolve: options?.settingsError
            ? jest.fn().mockRejectedValue(new Error('db down'))
            : jest.fn().mockResolvedValue({
                  ownOrgNames: options?.ownOrgNames ?? [],
              }),
    };
    const service = new CallContextBuilderService(
        pbxService as never,
        transcriptionStore as never,
        aiService as never,
        redisService as never,
        dealFamily as never,
        reportSettings as never,
    );
    return {
        service,
        api,
        transcriptionStore,
        redisClient,
        dealFamily,
        reportSettings,
    };
};

describe('CallContextBuilderService', () => {
    it('кэш: готовый паспорт из Redis отдаётся без походов в CRM; свежий — кэшируется', async () => {
        const { service, api, redisClient } = makeDeps();
        redisClient.get.mockResolvedValueOnce(
            JSON.stringify({ certainty: 'rich', stageId: 'C5:CACHED' }),
        );
        const cached = await service.build(row() as never);
        expect(cached.stageId).toBe('C5:CACHED');
        expect(api.call).not.toHaveBeenCalled();

        // Промах кэша → сборка + запись в кэш с TTL.
        const fresh = await service.build(row() as never);
        expect(fresh.certainty).toBe('rich');
        expect(redisClient.set).toHaveBeenCalledWith(
            'call-report:passport:115',
            expect.any(String),
            'EX',
            expect.any(Number),
        );
    });

    it('сделка со стадией → certainty=rich, стадия и воронка в паспорте', async () => {
        const { service } = makeDeps({ dealStage: 'C5:EXECUTING' });
        const passport = await service.build(row() as never);
        expect(passport.certainty).toBe('rich');
        expect(passport.stageId).toBe('C5:EXECUTING');
        expect(passport.categoryId).toBe('5');
        expect(passport.direction).toBe('outgoing');
        // Обратный резолв в pbx-коды + сильный приор «презентация».
        expect(passport.dealCategoryCode).toBe('sales_presentation');
        expect(passport.dealStageCode).toBe('sales_presentation_presentation');
        expect(passport.callTypePrior).toEqual(
            expect.objectContaining({
                callType: 'presentation',
                strength: 'strong',
            }),
        );
        expect(service.renderClassifyHint(passport)).toContain(
            "'presentation'",
        );
    });

    /**
     * Прод-случай alfacentr 08.09.2026: звонок сделан из сделки ЧУЖОЙ
     * воронки, коды не резолвились, приора не было — и тип скатывался в
     * «Другое». Теперь коды берутся у правильной сделки «ОП Основная» из
     * раскладки связей, даже если та стоит в финале отказа.
     */
    it('чужая воронка владельца: коды и приор берутся у сделки «ОП Основная» из раскладки', async () => {
        const { service, dealFamily } = makeDeps({
            dealCategory: 28,
            dealStage: 'SERVICE:NEW',
            dealCompanyId: 232232,
            mainDealId: 232,
            mainDealCategory: 0,
            mainDealStage: 'APOLOGY',
        });

        const passport = await service.build(row() as never);

        expect(dealFamily.resolve).toHaveBeenCalledWith(
            'test.bitrix24.ru',
            555,
            expect.objectContaining({ companyId: 232232 }),
        );
        // Стадия/воронка сырыми остаются от владельца звонка (факт CRM),
        // а pbx-коды — от правильной основной сделки.
        expect(passport.categoryId).toBe('28');
        expect(passport.dealCategoryCode).toBe('sales_base');
        expect(passport.dealStageCode).toBe('sales_double');
        expect(passport.callTypePrior).toEqual(
            expect.objectContaining({ callType: 'call', strength: 'weak' }),
        );
    });

    it('чужая воронка и основной сделки нет — приора нет, паспорт собирается', async () => {
        const { service } = makeDeps({
            dealCategory: 28,
            dealStage: 'SERVICE:NEW',
        });

        const passport = await service.build(row() as never);

        expect(passport.dealCategoryCode).toBeNull();
        expect(passport.callTypePrior).toBeNull();
        expect(passport.certainty).toBe('rich');
    });

    it('сделка в воронке, которой нет в pbx — коды и приор пусты, подсказка только «сделка»', async () => {
        const { service } = makeDeps({ dealStage: 'C9:NEW', dealCategory: 9 });
        const passport = await service.build(row() as never);
        expect(passport.dealCategoryCode).toBeNull();
        expect(passport.callTypePrior).toBeNull();
        expect(service.renderClassifyHint(passport)).toContain(
            'привязан к сделке',
        );
        expect(service.renderClassifyHint(passport)).not.toContain(
            'ОЖИДАЕМЫЙ ТИП',
        );
    });

    it('лид → certainty=lead со статусом; identity не ищется', async () => {
        const { service, api } = makeDeps({ leadStatus: 'IN_PROCESS' });
        const passport = await service.build(
            row({ entityType: 'lead', entityId: '77' }) as never,
        );
        expect(passport.certainty).toBe('lead');
        expect(passport.leadStatusId).toBe('IN_PROCESS');
        expect(api.call).not.toHaveBeenCalledWith(
            'crm.duplicate.findbycomm',
            expect.anything(),
        );
        // Признаков заявки нет → «холодный» и слабый приор cold в подсказке.
        expect(passport.leadWorkKind).toBe('cold');
        expect(passport.callTypePrior).toEqual(
            expect.objectContaining({ callType: 'cold', strength: 'weak' }),
        );
        expect(service.renderClassifyHint(passport)).toContain("'cold'");
    });

    // Долг 29 волны C: шаг 0 раскладки («ОП История» этого звонка) для
    // звонков по лиду недостижим без лида-владельца, владельца и типа.
    it('звонок по лиду: раскладка получает лид, владельца, момент и тип; коды — от основной сделки из записи', async () => {
        const { service, dealFamily, api } = makeDeps({
            mainDealId: 232,
            mainDealCategory: 0,
            mainDealStage: 'PREPARATION',
            classifiedType: 'presentation',
        });

        const passport = await service.build(
            row({ entityType: 'lead', entityId: '77', userId: '222' }) as never,
        );

        expect(dealFamily.resolve).toHaveBeenCalledWith(
            'test.bitrix24.ru',
            undefined,
            {
                companyId: undefined,
                contactId: undefined,
                callStartedAt: new Date('2026-07-30T10:00:00Z'),
                leadId: 77,
                callerId: '222',
                callType: 'presentation',
            },
        );
        // Семья пришла из записи списка: основная сделка дочитывается по
        // id, дотяжка по клиенту (crm.deal.list) не вызывается.
        expect(api.call).toHaveBeenCalledWith('crm.deal.get', { id: 232 });
        expect(api.call).not.toHaveBeenCalledWith(
            'crm.deal.list',
            expect.anything(),
        );
        expect(passport.certainty).toBe('lead');
        expect(passport.dealCategoryCode).toBe('sales_base');
        expect(passport.dealStageCode).toBe('sales_pres');
        // Приор лида — по виду работы лида; коды сделки его не переписывают.
        expect(passport.callTypePrior).toEqual(
            expect.objectContaining({ callType: 'cold', strength: 'weak' }),
        );
    });

    it('до классификации тип неизвестен — раскладка получает лид и момент без типа', async () => {
        const { service, dealFamily } = makeDeps();
        const passport = await service.build(
            row({ entityType: 'lead', entityId: '77' }) as never,
        );
        expect(dealFamily.resolve).toHaveBeenCalledWith(
            'test.bitrix24.ru',
            undefined,
            expect.objectContaining({ leadId: 77, callType: undefined }),
        );
        // Основной сделки в записи нет — коды пусты, паспорт лидовый.
        expect(passport.dealCategoryCode).toBeNull();
        expect(passport.certainty).toBe('lead');
    });

    it('персона контакта сделки (имя, должность, заметки) попадает в паспорт', async () => {
        const { service } = makeDeps({
            dealContactId: 44,
            contactPost: 'Главный бухгалтер',
            contactName: 'Мария',
            contactComments: '<p>Работает в 1С,  [b]просила счёт[/b]</p>',
        });
        const passport = await service.build(row() as never);
        expect(passport.contactPosition).toBe('Главный бухгалтер');
        expect(passport.contactName).toBe('Мария');
        // Разметка вычищена, пробелы схлопнуты.
        expect(passport.crmNotes).toBe('Работает в 1С, просила счёт');
        const prompt = service.renderForPrompt(passport);
        expect(prompt).toContain('Собеседник по данным CRM: Мария');
        expect(prompt).toContain('должность «Главный бухгалтер»');
        expect(prompt).toContain('Заметки менеджера из CRM');
    });

    it('компания и контакт сделки сохраняются для долива связей', async () => {
        const { service } = makeDeps({ dealContactId: 44, dealCompanyId: 33 });
        const passport = await service.build(row() as never);
        expect(passport.crmContactId).toBe(44);
        expect(passport.crmCompanyId).toBe(33);
    });

    it('записи «ОП История» сделки попадают в паспорт (хвост, без разметки)', async () => {
        const { service } = makeDeps({
            dealOpHistory: [
                '01.05 первый контакт',
                '12.05 <b>просили перезвонить</b>',
            ],
        });
        const passport = await service.build(row() as never);
        expect(passport.opHistory).toEqual([
            '01.05 первый контакт',
            '12.05 просили перезвонить',
        ]);
        expect(service.renderForPrompt(passport)).toContain(
            '«ОП История» из CRM',
        );
    });

    it('карточка компании сделки: название и заметки в паспорте', async () => {
        const { service } = makeDeps({
            dealCompanyId: 33,
            companyTitle: 'ООО «Гарант-Сервис Ростов»',
            companyComments:
                'Продление в ноябре, <b>работают с Консультантом</b>',
        });
        const passport = await service.build(row() as never);
        expect(passport.companyTitle).toBe('ООО «Гарант-Сервис Ростов»');
        expect(passport.companyNotes).toBe(
            'Продление в ноябре, работают с Консультантом',
        );
        const prompt = service.renderForPrompt(passport);
        expect(prompt).toContain('Компания клиента по данным CRM');
        expect(prompt).toContain('Заметки менеджера о компании');
    });

    it('должность из POST лида; пустая строка → null', async () => {
        const { service } = makeDeps({
            leadFields: { POST: '  Юрист  ' },
        });
        const passport = await service.build(
            row({ entityType: 'lead', entityId: '77' }) as never,
        );
        expect(passport.contactPosition).toBe('Юрист');

        const { service: bare } = makeDeps({ leadFields: { POST: '' } });
        const emptyPassport = await bare.build(
            row({ entityType: 'lead', entityId: '77' }) as never,
        );
        expect(emptyPassport.contactPosition).toBeNull();
    });

    it('лид с полем лидогена → заявка: строка в паспорте и подсказка классификатору', async () => {
        const { service } = makeDeps({
            leadFields: { UF_CRM_REG_NUMBER: 'A-771' },
        });
        const passport = await service.build(
            row({ entityType: 'lead', entityId: '77' }) as never,
        );
        expect(passport.leadWorkKind).toBe('request');
        expect(service.renderForPrompt(passport)).toContain('ВХОДЯЩЕЙ ЗАЯВКОЙ');
        expect(service.renderClassifyHint(passport)).toContain('site_lead');
    });

    it('без CRM-привязки → naked + suspected identity по номеру', async () => {
        const { service } = makeDeps({
            phoneMatches: { CONTACT: [3012905], DEAL: [] },
        });
        const passport = await service.build(
            row({ entityType: null, entityId: null }) as never,
        );
        expect(passport.certainty).toBe('naked');
        expect(passport.identity).toEqual([
            {
                entityType: 'CONTACT',
                entityId: 3012905,
                confidence: 'suspected',
            },
        ]);
        // Паспорт — подсказка, не приговор: в промпте это помечено как догадка.
        expect(service.renderForPrompt(passport)).toContain('suspected');
        expect(service.renderForPrompt(passport)).toContain(
            'НЕ штрафуй за «неуместность»',
        );
    });

    it('история сущности попадает в паспорт с резюме прошлых звонков', async () => {
        const { service } = makeDeps({
            history: [
                { id: '90', callStartedAt: new Date('2026-07-20T09:00:00Z') },
            ],
            resumeByTranscription: { '90': 'Обещали выслать КП в среду' },
        });
        const passport = await service.build(row() as never);
        expect(passport.history).toHaveLength(1);
        expect(passport.history[0].resume).toContain('КП');
        expect(service.renderForPrompt(passport)).toContain(
            'невыполненные обещания',
        );
    });

    it('Bitrix недоступен → паспорт деградирует в naked, но собирает историю', async () => {
        const { service } = makeDeps({
            history: [{ id: '90', callStartedAt: null }],
        });
        (service as unknown as { pbxService: { init: jest.Mock } }).pbxService =
            { init: jest.fn().mockRejectedValue(new Error('portal down')) };
        const passport = await service.build(row() as never);
        expect(passport.certainty).toBe('naked');
        expect(passport.history).toHaveLength(1);
    });
});

/**
 * НАЗВАНИЯ НАШИХ ОРГАНИЗАЦИЙ (прод alfacentr 08.09.2026): модель писала
 * «менеджер представляется через стороннюю организацию „Альфа-центр“» и
 * снижала за это оценку, хотя «Альфа-центр» — сама компания-клиент портала.
 */
describe('CallContextBuilderService: свои названия организаций', () => {
    it('имена из настройки попадают в паспорт и в промпт запретом снижать оценку', async () => {
        const { service } = makeDeps({
            ownOrgNames: ['Альфа-центр', 'Апрель'],
        });

        const passport = await service.build(row() as never);

        expect(passport.ownOrgNames).toEqual(['Альфа-центр', 'Апрель']);
        const prompt = service.renderForPrompt(passport);
        expect(prompt).toContain('«Альфа-центр»');
        expect(prompt).toContain('«Апрель»');
        // Явная формулировка: догадываться модель не должна.
        expect(prompt).toContain('Это МЫ');
        expect(prompt).toContain('стороннюю организацию');
        expect(prompt).toContain('ЗАПРЕЩЕНО');
    });

    it('имя из списка знает и классификатор — это представление, а не чужая фирма', async () => {
        const { service } = makeDeps({ ownOrgNames: ['Альфа-центр'] });

        const passport = await service.build(row() as never);

        expect(service.renderClassifyHint(passport)).toContain('«Альфа-центр»');
    });

    it('пустой список — прежнее поведение: в промпте про названия ни строчки', async () => {
        const { service } = makeDeps();

        const passport = await service.build(row() as never);

        expect(passport.ownOrgNames).toEqual([]);
        const prompt = service.renderForPrompt(passport);
        expect(prompt).not.toContain('НАШИ СОБСТВЕННЫЕ НАЗВАНИЯ');
        expect(service.renderClassifyHint(passport) ?? '').not.toContain(
            'наша компания на этом портале',
        );
    });

    it('настройки недоступны → паспорт без имён, разбор не падает (fail-open)', async () => {
        const { service } = makeDeps({ settingsError: true });

        const passport = await service.build(row() as never);

        expect(passport.ownOrgNames).toEqual([]);
        expect(passport.certainty).toBe('rich');
    });
});
