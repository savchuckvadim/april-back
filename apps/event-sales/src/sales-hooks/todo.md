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






0	0	Новая	P	NEW	#eef0e6	sales_new	deal	sales	1	Y
1	0	Холодные	P	COLD	#3bc8f5	sales_cold	deal	sales	2	N
2	0	Переговоры	P	WARM	#0ec96f	sales_warm	deal	sales	3	N
3	0	Презентация	P	PRESENTATION	#fff300	sales_pres	deal	sales	4	N
4	0	Доработка	P	REFINE	#f3b01d	sales_refine	deal	sales	5	N
5	0	Документы	P	OFFER_CREATE	#8e5cbf	sales_offer_create	deal	sales	6	N
6	0	Отправлены	P	DOCUMENT_SEND	#683699	sales_document_send	deal	sales	7	N
7	0	В решении	P	IN_PROSRESS	#f0008c	sales_in_progress	deal	sales	8	N
8	0	В оплате	P	MONEY_AWAIT	#a0005c	sales_money_await	deal	sales	9	N
9	0	Поставка	P	SUPPLY_INIT	#0070bf	sales_supply	deal	sales	10	N
10	0	Успех	S	WON	#00ff00	sales_success	deal	sales	11	N
11	0	Отказ	F	LOSE	#e7354a	sales_fail	deal	sales	12	N
12	0	Не состоялась	F	APOLOGY	#2d0b0d	sales_double	deal	sales	13	N
13	0	Не ЦА	F	NOT_CA	#2d0b0d	sales_not_ca	deal	sales	14	N
