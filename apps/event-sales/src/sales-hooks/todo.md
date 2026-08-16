при конвертации в lead to work
надо переносмит все дела изtimeline
сейчас перносятся задачи с преобразованием -это супер
есть ли возможность перенести все
или скопировать забайндить
или хотя бы последние  сто ?
как сделать чтоб при переносе все перенеслось ?

давайнаверное еще в timeline
делать запись и закреплять
ссылка на лид из которого
переехали. ?


и еще как сделать в битрикс чтоб при создании такой связи
появлялась в сделке связь с этим слидом? конвертить?
если есть компания лид надо сконвертить в компанию


при преобразовании надо проверять заполнено ли в лиде

Корневая сделка Продажи
Сделка:
TEST342

Статус Лида
Работа со сделкой
- заполняется - это супер!


последние созданные поля

Хвост	presentation		string		op_presentation_xvost	OP_PRESENTATION_XVOST			OP_PRESENTATION_XVOST		660	ИСТИНА	ЛОЖЬ
Пять К	presentation		string		op_presentation_5k	OP_PRESENTATION_5K			OP_PRESENTATION_5K		660	ИСТИНА	ЛОЖЬ
КЛИЕНТ: Что хочет ?	lead		string		op_5k_client_what	OP_5K_CLIENT_WHAT					661	ИСТИНА	ЛОЖЬ
КЛИЕНТ: Готов Работать ?	lead		string		op_5k_client_ready	OP_5K_CLIENT_READY					662	ИСТИНА	ЛОЖЬ
КЛИЕНТ: Укладываемся в цену?	lead		string		op_5k_client_price	OP_5K_CLIENT_PRICE					663	ИСТИНА	ЛОЖЬ
КОМПАНИЯ: Кто принимает решение?	lead		string		op_5k_company_who	OP_5K_COMPANY_WHO					664	ИСТИНА	ЛОЖЬ
КОМПАНИЯ: Как принимается решение?	lead		string		op_5k_company_how	OP_5K_COMPANY_HOW					665	ИСТИНА	ЛОЖЬ
КОМПАНИЯ: Правильно ли подобрали Цену и  Комплект ?	lead		string		op_5k_company_right	OP_5K_COMPANY_RIGHT					666	ИСТИНА	ЛОЖЬ
"КОЛЛЕГИ: Кто будет работать с системой
Будут ли обсуждать ?"	lead		string		op_5k_command	OP_5K_COMMAND					667	ИСТИНА	ЛОЖЬ
КОНКУРЕНТ: По каким критериям нас сравнивают?	lead		string		op_5k_concurent	OP_5K_CONCURENT					668	ИСТИНА	ЛОЖЬ
КРИТЕРИЙ ВЫБОРА: Что важно при выборе СПС?	lead		string		op_5k_criteri	OP_5K_CRITERI					669	ИСТИНА	ЛОЖЬ
Skap Loging	skap		multiple		skap_logins			SKAP_LOGINS			700	ИСТИНА	ИСТИНА
Время Назначения заяки	lead		datetime		op_lead_assigned_at	OP_LEAD_ASSIGNED_AT			OP_LEAD_ASSIGNED_AT		701	ИСТИНА	ЛОЖЬ
ОП Вид работы по лиду	lead          		enumeration             		op_lead_work_kind	OP_LEAD_WORK_KIND




ОП Вид работы по лиду	op_lead_work_kind	Лид	op_lead_work_kind_lead	lead	10	N	ИСТИНА	ИСТИНА
    op_lead_work_kind	Заявка	op_lead_work_kind_request	lead	20	N	ИСТИНА	ИСТИНА
    op_lead_work_kind	Неопределен	op_lead_work_kind_undef	lead	30	N	ИСТИНА	ИСТИНА






Загрузить 6 методичек из storage/app/ai-rag/drafts/converted/ через админку «База знаний» — kind указан в шапке каждой: hvost-5k и demo-accountant → call-analysis-presentation; decision--script → call-analysis-decision; cold--checklist → call-analysis-cold; site-leads → call-analysis-call и копией в call-analysis-cold; classify--type-features → call-classify (это главный удар по точности типов). База общая или per-domain — если методики одинаковы для gsr и garant, грузите в общую.
Включить withCheckPresentation в Settings тех порталов, где отчётность «5К и хвост» обязательна — разбор презентаций станет жёстче именно там.
