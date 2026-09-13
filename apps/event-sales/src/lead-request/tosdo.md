ОП Название ХО	xo		string		xo_name	XO_NAME	XO_NAME		XO_NAME		575	ИСТИНА	ЛОЖЬ
ОП Дата Холодного обзвона	xo		datetime		xo_date	XO_DATE	XO_DATE		XO_DATE		575	ИСТИНА	ЛОЖЬ
ОП Ответственный ХО	xo		employee		xo_responsible	XO_RESPONSIBLE	XO_RESPONSIBLE		XO_RESPONSIBLE		575	ИСТИНА	ЛОЖЬ
ОП Постановщик ХО	xo		employee		xo_created	XO_CREATED	XO_CREATED		XO_CREATED		575	ИСТИНА	ЛОЖЬ
ставится до отправки хука	xo		datetime	ставится до отправки хука	op_xo_revive_queued_at	OP_XO_REVIVE_QUEUED_AT	OP_XO_REVIVE_QUEUED_AT		OP_XO_REVIVE_QUEUED_AT		575	ИСТИНА	ЛОЖЬ
после приёма буфером	xo		datetime	после приёма буфером	op_xo_revive_sent_at 	OP_XO_REVIVE_SENT_AT 	OP_XO_REVIVE_SENT_AT 		OP_XO_REVIVE_SENT_AT 		575	ИСТИНА	ЛОЖЬ
ОП ХО lead stage mode(new | cold)	xo		string		op_xo_lead_stage_mode	OP_XO_LEAD_STAGE_MODE	OP_XO_LEAD_STAGE_MODE		OP_XO_LEAD_STAGE_MODE		575	ИСТИНА	ЛОЖЬ
ОП ХО холодный обзвон?	xo		boolean		op_xo_is_xo	OP_XO_IS_XO	OP_XO_IS_XO		OP_XO_IS_XO		575	ИСТИНА	ЛОЖЬ
ОП ХО с очищением?	xo		boolean		op_xo_is_force	OP_XO_IS_FORCE	OP_XO_IS_FORCE		OP_XO_IS_FORCE		575	ИСТИНА	ЛОЖЬ



Только в сделке - это не признак крона это "отправка на доработку" - типа как этап сделки
на каких то порталах юудет это + стадия сделки
на каких то только это но значить будет одно и то же

На доработке ?	refine		boolean		op_is_in_refine				OP_IS_IN_REFINE		701	ИСТИНА	ЛОЖЬ
На доработке с	refine		date		op_refined_at				OP_REFINED_AT		701	ИСТИНА	ЛОЖЬ
Почему на доработке - причина	refine		string		op_refined_reason				OP_REFINED_REASON		701	ИСТИНА	ЛОЖЬ
