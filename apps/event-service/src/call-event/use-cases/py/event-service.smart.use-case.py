import asyncio
import calendar
from datetime import datetime, timedelta, timezone

from src.entities.bitrix.BXSmartItemDTO import BXSmartItemDTO
from src.repositories.bitrix.BXTask import BXTask
from src.entities.bitrix.BXTaskDTO import BXTaskDTO
from src.entities.portal.PSmartDTO import PSmartDTO
from src.repositories.bitrix.BXDeal import BXDeal
from src.repositories.bitrix.BXList import BXList
from src.entities.event.CallingEventDTO import CallingEventDTO
from src.repositories.bitrix.BXCompany import BXCompany
from src.entities.bitrix.BXContactDTO import BXContactDTO
from src.repositories.bitrix.BXContact import BXContact
from src.repositories.bitrix.BXSmart import BXSmart
from src.portal.Portal import Portal
from src.repositories.portal.PortalRepository import PortalRepository
from tgbot import TelegramBot
import src.utils


class ClientField:
    def __init__(self):
        self.bx_id: int = 0
        self.fields: Field = Field()


class Field:
    def __init__(self):
        self.count_communication_fact: int = 0
        self.count_communication_incoming: int = 0
        self.count_communication_outgoing: int = 0
        self.count_presentation: int = 0
        self.count_edu: int = 0
        self.count_first_edu: int = 0
        self.count_signal: int = 0
        self.count_success_signal: int = 0
        self.count_call: int = 0
        self.count_face: int = 0
        self.date_last_edu: str = ""
        self.date_next_edu: str = ""
        self.responsible_first_edu: list = []
        self.responsible_edu: list = []
        self.responsible_presentation: list = []
        self.date_last_call: str = ""
        self.date_next_call: str = ""
        self.type_client: str = ""
        self.position: str = ""
        self.phone: str = ""
        self.email: str = ""

        self.count_communication_plan: float = 0
        self.degree_need: float = 0


class EventSmartReportNew:
    portal = Portal
    domain: str
    company_id: int
    deal_id: int
    task_company: list[BXTaskDTO]
    contacts: list[BXContactDTO]

    async def new_event(
        self,
        calling_event: CallingEventDTO,
    ):
        self.domain = calling_event.domain
        self.company_id = calling_event.bx.companyId
        self.deal_id = calling_event.bx.dealId
        self.portal = await PortalRepository().get_portal(domain=self.domain)

        bx_contact = BXContact(
            domain=self.domain,
            api_url=self.portal.access_key,
        )

        self.contacts = await bx_contact.get_contacts_by_company_id(
            company_id=self.company_id
        )

        bx_smart = BXSmart(domain=self.domain, api_url=self.portal.access_key)
        p_smart = self.portal.get_smart_by_code(code="service_month")

        bx_company = BXCompany(domain=self.domain, api_url=self.portal.access_key)
        company = await bx_company.get_company_by_id(company_id=self.company_id)

        bx_task = BXTask(domain=self.domain, api_url=self.portal.access_key)
        self.task_company = await bx_task.get_task_by_company_id(self.company_id)

        bx_list = BXList(domain=self.domain, api_url=self.portal.access_key)
        p_list_ork_history = self.portal.get_list_by_code(code="ork_history")

        list_ork_history_filter = {
            self.portal.get_id_by_code_field_list(
                list=p_list_ork_history, code="crm"
            ).bitrixCamelId: [f"CO_{self.company_id}"]
        }
        list_ork_history_select = self.portal.get_list_fields_select_all(
            list=p_list_ork_history
        )
        list_ork_history = await bx_list.get_elements_list(
            filter=list_ork_history_filter,
            code_list="ork_history",
            select=list_ork_history_select,
        )

        # Получаем текущее время с учетом часового пояса
        now = datetime.now(timezone(timedelta(hours=3)))

        year = now.year
        month = now.month
        first_date, thirtieth_date = src.utils.get_first_last_day_month(year, month)

        get_smarts = []
        for contact in self.contacts:
            contact.UF_CRM_ORK_CALL_FREQUENCY = contact.calc_planned_communications(
                value=contact.UF_CRM_ORK_CALL_FREQUENCY
            )

            contact.UF_CRM_ORK_NEEDS = contact.calc_degree_needs(
                value=contact.UF_CRM_ORK_NEEDS,
            )
            get_smarts.append(
                (
                    p_smart.entityTypeId,
                    {
                        f"ufCrm{p_smart.bitrixId}SmrsCrmContact": [contact.ID],
                        ">=createdTime": first_date,
                        "<=createdTime": thirtieth_date,
                    },
                )
            )

            bx_smart.bx.add_cmd_batch(
                cmd=f"get_smart_contact_{contact.ID}",
                method="crm.item.list",
                query={
                    "entityTypeId": p_smart.entityTypeId,
                    "filter": {
                        f"ufCrm{p_smart.bitrixId}SmrsCrmContact": [contact.ID],
                        ">=createdTime": first_date,
                        "<=createdTime": thirtieth_date,
                    },
                },
            )

        bx_deal = BXDeal(domain=self.domain, api_url=self.portal.access_key)
        deal_fields = await self.job_in_deal(bx_deal, p_smart)

        bx_smart.bx.add_cmd_batch(
            cmd=f"get_smart_company_{self.company_id}",
            method="crm.item.list",
            query={
                "entityTypeId": p_smart.entityTypeId,
                "filter": {
                    f"ufCrm{p_smart.bitrixId}SmrsCrmCompany": self.company_id,
                    ">=createdTime": first_date,
                    "<=createdTime": thirtieth_date,
                },
            },
        )
        smarts: list[BXSmartItemDTO] = []
        # for get_smart in get_smarts:
        #     smart = await bx_smart.get_smarts(get_smart[0], get_smart[1])
        #     if smart:
        #         for s in smart:
        #             smarts.append(s)

        smarts = await bx_smart.get_smarts_batch()

        # smarts = await bx_smart.get_smarts(
        #     rpa_type_id=p_smart.entityTypeId, filter=filter
        # )
        if type(smarts) == str:
            return smarts

        """Создать новые элементы списка"""
        fields_element = {}

        # CRM
        crm = self.portal.get_smart_field_by_code(p_smart=p_smart, code="crm")
        fields_element[crm.bitrixId] = [f"CO_{self.company_id}"]

        # Компания
        f_company = self.portal.get_smart_field_by_code(
            p_smart=p_smart, code="crm_company"
        )
        fields_element[f_company.bitrixId] = self.company_id

        # Контакт
        f_contact = self.portal.get_smart_field_by_code(
            p_smart=p_smart, code="crm_contact"
        )

        # Тип клиента
        f_type_client = self.portal.get_smart_field_by_code(
            p_smart=p_smart, code="type_client"
        )
        # Должность
        f_position = self.portal.get_smart_field_by_code(
            p_smart=p_smart, code="position"
        )
        # Телефон
        f_phone = self.portal.get_smart_field_by_code(p_smart=p_smart, code="phone")
        # Email
        f_email = self.portal.get_smart_field_by_code(p_smart=p_smart, code="email")

        # Сотрудник
        f_responsible = self.portal.get_smart_field_by_code(
            p_smart=p_smart, code="responsible"
        )
        fields_element[f_responsible.bitrixId] = (
            calling_event.departament.currentUser.ID
        )

        # Количество первичных обучений
        f_count_first_edu = self.portal.get_smart_field_by_code(
            p_smart=p_smart, code="count_first_edu"
        )
        # Кто проводил
        f_responsible_first_edu = self.portal.get_smart_field_by_code(
            p_smart=p_smart, code="responsible_first_edu"
        )

        # Количество Обучений
        f_edu_count = self.portal.get_smart_field_by_code(
            p_smart=p_smart, code="count_edu"
        )
        # Кто проводил
        f_responsible_edu = self.portal.get_smart_field_by_code(
            p_smart=p_smart, code="responsible_edu"
        )

        # Дата Последнего Обучения
        f_date_last_edu = self.portal.get_smart_field_by_code(
            p_smart=p_smart, code="date_last_edu"
        )
        # Дата Следующего обучения
        f_date_next_edu = self.portal.get_smart_field_by_code(
            p_smart=p_smart, code="date_next_edu"
        )

        # Количество Презентаций
        f_pres_count = self.portal.get_smart_field_by_code(
            p_smart=p_smart, code="count_presentation"
        )

        # Кто провел последнюю
        f_responsible_presentation = self.portal.get_smart_field_by_code(
            p_smart=p_smart, code="responsible_presentation"
        )

        # Общее количество результативных Коммуникаций

        f_count_communication_fact = self.portal.get_smart_field_by_code(
            p_smart=p_smart, code="count_communication_fact"
        )

        f_count_communication_incoming = self.portal.get_smart_field_by_code(
            p_smart=p_smart, code="count_communication_incoming"
        )

        f_count_communication_outgoing = self.portal.get_smart_field_by_code(
            p_smart=p_smart, code="count_communication_outgoing"
        )

        f_count_signal = self.portal.get_smart_field_by_code(
            p_smart=p_smart, code="count_signal"
        )

        # Количество Отработанных СС
        f_count_success_signal = self.portal.get_smart_field_by_code(
            p_smart=p_smart, code="count_success_signal"
        )

        # Тип коммуникации: Звонок
        f_count_call = self.portal.get_smart_field_by_code(
            p_smart=p_smart, code="count_call"
        )

        f_date_last_call = self.portal.get_smart_field_by_code(
            p_smart=p_smart, code="date_last_call"
        )

        f_date_next_call = self.portal.get_smart_field_by_code(
            p_smart=p_smart, code="date_next_call"
        )

        # Тип коммуникации: Выезд
        f_count_face = self.portal.get_smart_field_by_code(
            p_smart=p_smart, code="count_face"
        )

        # Плановое количество Коммуникаций
        f_count_communication_plan = self.portal.get_smart_field_by_code(
            p_smart=p_smart, code="count_communication_plan"
        )

        # Степень удовлетворенности потребностей
        f_degree_need = self.portal.get_smart_field_by_code(
            p_smart=p_smart, code="degree_need"
        )

        clients_field: list[ClientField] = []

        count_communication_plan = 0
        for contact in self.contacts:
            count_communication_plan += (
                contact.UF_CRM_ORK_CALL_FREQUENCY
                if contact.UF_CRM_ORK_CALL_FREQUENCY != 0
                else 0
            )
            client = ClientField()
            client.bx_id = contact.ID
            clients_field.append(client)

        client = ClientField()
        client.bx_id = company.ID
        client.fields.count_communication_plan = count_communication_plan
        clients_field.append(client)

        for element in list_ork_history:
            client = self.find_field_list(
                element=element, p_list_ork_history=p_list_ork_history
            )
            if not any(
                client_field.bx_id == client.bx_id for client_field in clients_field
            ):
                clients_field.append(client)
            else:
                for client_field in clients_field:
                    if client_field.bx_id == client.bx_id:

                        client_field.fields.count_communication_fact += (
                            client.fields.count_communication_fact
                        )

                        client_field.fields.count_communication_incoming += (
                            client.fields.count_communication_incoming
                        )
                        client_field.fields.count_communication_outgoing += (
                            client.fields.count_communication_outgoing
                        )
                        client_field.fields.count_presentation += (
                            client.fields.count_presentation
                        )
                        client_field.fields.count_edu += client.fields.count_edu
                        client_field.fields.count_first_edu += (
                            client.fields.count_first_edu
                        )
                        client_field.fields.count_signal += client.fields.count_signal
                        client_field.fields.count_success_signal += (
                            client.fields.count_success_signal
                        )
                        client_field.fields.count_call += client.fields.count_call
                        client_field.fields.count_face += client.fields.count_face

                        client_field.fields.date_last_edu = (
                            client.fields.date_last_edu
                        )  # TODO если пусто то запиши
                        client_field.fields.date_next_edu = client.fields.date_next_edu

                        client_field.fields.responsible_first_edu = (
                            client.fields.responsible_first_edu
                        )
                        if len(client.fields.responsible_edu):
                            client_field.fields.responsible_edu.extend(
                                client.fields.responsible_edu
                            )
                        if len(client.fields.responsible_presentation):
                            client_field.fields.responsible_presentation.extend(
                                client.fields.responsible_presentation
                            )

                        client_field.fields.date_last_call = (
                            client.fields.date_last_call
                        )
                        client_field.fields.date_next_call = (
                            client.fields.date_next_call
                        )

                        client_field.fields.type_client = client.fields.type_client
                        client_field.fields.position = client.fields.position
                        client_field.fields.phone = client.fields.position
                        client_field.fields.email = client.fields.email

        for client in clients_field:
            title = None
            assignedById = None
            contactId = None
            client_id = None
            client_type = ""

            for contact in self.contacts:
                if contact.ID == int(client.bx_id):
                    title = f"Контакт: {contact.NAME}"
                    assignedById = contact.ASSIGNED_BY_ID
                    contactId = contact.ID
                    client_id = contact.ID
                    client_type = "contact"

                    fields_element[f_type_client.bitrixId] = contact.TYPE_ID
                    fields_element[f_position.bitrixId] = contact.POST
                    fields_element[f_phone.bitrixId] = contact.PHONE
                    fields_element[f_email.bitrixId] = contact.EMAIL
                    fields_element[f_count_communication_plan.bitrixId] = (
                        contact.UF_CRM_ORK_CALL_FREQUENCY
                    )
                    fields_element[f_degree_need.bitrixId] = contact.UF_CRM_ORK_NEEDS

                    client.fields.count_communication_plan = (
                        contact.UF_CRM_ORK_CALL_FREQUENCY
                        if contact.UF_CRM_ORK_CALL_FREQUENCY != 0
                        else 0
                    )

                    client.fields.degree_need = contact.UF_CRM_ORK_NEEDS

            # тогда это компания
            if not title:
                title = f"Компания: {company.TITLE}"
                assignedById = company.ASSIGNED_BY_ID
                contactId = [f"C_{contact.ID}" for contact in self.contacts]
                fields_element[crm.bitrixId].append(contactId)
                client_id = company.ID
                client_type = "company"
                if len(self.contacts):
                    client.fields.count_communication_plan /= len(self.contacts)

                for c_f_contact in clients_field:
                    if c_f_contact.bx_id == client.bx_id:
                        continue

                    client.fields.count_communication_fact += (
                        c_f_contact.fields.count_communication_fact
                    )

                    client.fields.count_communication_incoming += (
                        c_f_contact.fields.count_communication_incoming
                    )
                    client.fields.count_communication_outgoing += (
                        c_f_contact.fields.count_communication_outgoing
                    )
                    client.fields.count_presentation += (
                        c_f_contact.fields.count_presentation
                    )
                    client.fields.count_edu += c_f_contact.fields.count_edu
                    client.fields.count_first_edu += c_f_contact.fields.count_first_edu
                    client.fields.count_signal += c_f_contact.fields.count_signal
                    client.fields.count_success_signal += (
                        c_f_contact.fields.count_success_signal
                    )
                    client.fields.count_call += c_f_contact.fields.count_call
                    client.fields.count_face += c_f_contact.fields.count_face

                    client.fields.date_last_edu = self.compare_dates(
                        client.fields.date_last_edu,
                        c_f_contact.fields.date_last_edu,
                        reverse=True,
                    )
                    client.fields.date_next_edu = self.calc_date_call_next(
                        title="обучение"
                    )

                    c_f_items = set(c_f_contact.fields.responsible_first_edu)

                    client.fields.responsible_first_edu.extend(
                        item
                        for item in c_f_items
                        if item not in client.fields.responsible_first_edu
                    )

                    # Получаем уникальные элементы из c_f_contact.fields.responsible_first_edu
                    c_f_items = set(c_f_contact.fields.responsible_edu)

                    client.fields.responsible_edu.extend(
                        item
                        for item in c_f_items
                        if item not in client.fields.responsible_edu
                    )

                    c_f_items = set(c_f_contact.fields.responsible_presentation)

                    client.fields.responsible_presentation.extend(
                        item
                        for item in c_f_items
                        if item not in client.fields.responsible_presentation
                    )

                    client.fields.date_last_call = self.compare_dates(
                        client.fields.date_last_call,
                        c_f_contact.fields.date_last_call,
                        reverse=True,
                    )
                    client.fields.date_next_call = self.calc_date_call_next()

                    total_need = sum(
                        contact.UF_CRM_ORK_NEEDS for contact in self.contacts
                    )
                    client.fields.degree_need = total_need
                    if self.contacts:
                        client.fields.degree_need /= len(self.contacts)

            params = {
                "entityTypeId": p_smart.entityTypeId,
                "fields": {
                    "title": title,
                    "assignedById": assignedById,
                    "contactId": contactId,
                    f_contact.bitrixId: contactId,
                },
            }

            fields_element[f_count_communication_fact.bitrixId] = (
                client.fields.count_communication_fact
            )
            fields_element[f_count_communication_incoming.bitrixId] = (
                client.fields.count_communication_incoming
            )
            fields_element[f_count_communication_outgoing.bitrixId] = (
                client.fields.count_communication_outgoing
            )

            fields_element[f_pres_count.bitrixId] = client.fields.count_presentation
            fields_element[f_count_first_edu.bitrixId] = client.fields.count_first_edu
            fields_element[f_edu_count.bitrixId] = client.fields.count_edu
            fields_element[f_count_signal.bitrixId] = client.fields.count_signal
            fields_element[f_count_success_signal.bitrixId] = (
                client.fields.count_success_signal
            )
            fields_element[f_count_call.bitrixId] = client.fields.count_call
            fields_element[f_count_face.bitrixId] = client.fields.count_face

            fields_element[f_count_communication_plan.bitrixId] = (
                client.fields.count_communication_plan
            )

            fields_element[f_date_last_call.bitrixId] = client.fields.date_last_call

            fields_element[f_date_next_call.bitrixId] = (
                self.calc_date_call_next()
                if client.bx_id == self.company_id
                else self.calc_date_call_next(cont=client.bx_id)
            )

            fields_element[f_date_last_edu.bitrixId] = client.fields.date_last_edu

            fields_element[f_date_next_edu.bitrixId] = (
                self.calc_date_call_next(title="обучение")
                if client.bx_id == self.company_id
                else self.calc_date_call_next(title="обучение", cont=client.bx_id)
            )

            fields_element[f_responsible_edu.bitrixId] = client.fields.responsible_edu
            fields_element[f_responsible_first_edu.bitrixId] = (
                client.fields.responsible_first_edu
            )
            fields_element[f_responsible_presentation.bitrixId] = (
                client.fields.responsible_presentation
            )

            fields_element[f_degree_need.bitrixId] = f"{client.fields.degree_need} %"

            if client.bx_id == company.ID:
                params["fields"].update(deal_fields)

            params["fields"].update(fields_element)

            if smarts:
                # есть такие и нужно обновить
                # проверить все ли contactt и company имеются в smarte
                for smart in smarts:
                    if title == smart.title:
                        params["id"] = smart.id
                        break
                if not params.get("id"):
                    bx_smart.bx.add_cmd_batch(
                        cmd=f"add_element_{client_type}_{client_id}",
                        method="crm.item.add",
                        query=params,
                    )
                else:
                    bx_smart.bx.add_cmd_batch(
                        cmd=f"update_element_{client_type}_{smart.id}",
                        method="crm.item.update",
                        query=params,
                    )
            else:
                # нужно создать
                bx_smart.bx.add_cmd_batch(
                    cmd=f"add_element_{client_type}_{client_id}",
                    method="crm.item.add",
                    query=params,
                )

        res = await bx_smart.bx.call_batch()
        return res

    async def job_in_deal(self, bx_deal: BXDeal, p_smart: PSmartDTO):

        field_deal_filter = {
            "COMPANY_ID": self.company_id,
            "CATEGORY_ID": self.portal.get_deal_category_by_code(
                code="service_base"
            ).bitrixId,
        }
        select_deal = self.portal.get_deal_fields_select_all(code="service_base")
        deal = await bx_deal.get_deal_by_fields(
            fields=field_deal_filter, select=select_deal
        )

        if not deal:
            return {}
        deal = deal[0]

        fields = {}
        fields[
            self.portal.get_smart_field_by_code(
                p_smart=p_smart, code="date_last_call"
            ).bitrixId
        ] = deal.UF_CRM_CALL_LAST_DATE
        fields[
            self.portal.get_smart_field_by_code(
                p_smart=p_smart, code="date_next_call"
            ).bitrixId
        ] = deal.UF_CRM_CALL_NEXT_DATE
        fields[
            self.portal.get_smart_field_by_code(
                p_smart=p_smart, code="date_last_edu"
            ).bitrixId
        ] = deal.UF_CRM_ORK_LAST_EDU_DATE
        fields[
            self.portal.get_smart_field_by_code(
                p_smart=p_smart, code="date_next_edu"
            ).bitrixId
        ] = deal.UF_CRM_ORK_NEXT_EDU_DATE
        # конкурент
        deal_concurent = deal.UF_CRM_OP_CONCURENTS
        deal_concurent_item = ""
        if deal_concurent:
            deal_concurent_item = self.portal.get_deal_field_item_by_bitrixID(
                bitrixId=int(deal_concurent)
            )
        fields[
            self.portal.get_smart_field_by_code(
                p_smart=p_smart, code="concurent"
            ).bitrixId
        ] = (deal_concurent_item.name if deal_concurent_item else "")
        fields[
            self.portal.get_smart_field_by_code(
                p_smart=p_smart, code="supply_date"
            ).bitrixId
        ] = deal.UF_CRM_SUPPLY_DATE
        fields[
            self.portal.get_smart_field_by_code(
                p_smart=p_smart, code="contract_start"
            ).bitrixId
        ] = deal.UF_CRM_CONTRACT_START
        fields[
            self.portal.get_smart_field_by_code(
                p_smart=p_smart, code="contract_end"
            ).bitrixId
        ] = deal.UF_CRM_CONTRACT_END

        product_row_deal = await self.product_row_deal(bx_deal=bx_deal)

        fields[
            self.portal.get_smart_field_by_code(
                p_smart=p_smart, code="complect_name"
            ).bitrixId
        ] = product_row_deal

        del_key = []
        for key, value in fields.items():
            if value == None:
                del_key.append(key)
            keys_date = ["date", "contractstart", "contractend"]
            if any(date_value in key.lower() for date_value in keys_date):
                if value:
                    date = datetime.fromisoformat(value)
                    fields[key] = date.strftime("%d.%m.%Y %H:%M")

        for key in del_key:
            del fields[key]

        return fields

    async def product_row_deal(self, bx_deal: BXDeal) -> list:
        product_row_deal = await bx_deal.get_product_rows(base_deal_id=self.deal_id)

        product_fields = []
        for row in product_row_deal:
            product_fields.append(row.PRODUCT_NAME)
        return product_fields

    def compare_dates(self, date_last, date_next, reverse=None):
        # Определяем формат даты
        date_format = "%d.%m.%Y %H:%M:%S"

        # Преобразуем строки в объекты datetime
        try:
            date1 = datetime.strptime(date_last, date_format)
        except:
            if reverse:
                return date_next
            return date_last, date_next
        try:
            date2 = datetime.strptime(date_next, date_format)
        except:
            return date_last

        if not reverse:
            # Сравниваем даты
            if date1 > date2:
                return date_last, ""
            else:
                return date_last, date_next

        # Сравниваем даты
        if date1 < date2:
            return date_next
        else:
            return date_last

    def find_field_list(self, element, p_list_ork_history) -> ClientField:

        # компания
        field_ork_crm_company = self.portal.get_id_by_code_field_list(
            list=p_list_ork_history, code="ork_crm_company"
        )
        # контакт
        field_ork_crm_contact = self.portal.get_id_by_code_field_list(
            list=p_list_ork_history, code="ork_crm_contact"
        )

        # ответственынй
        field_responsible = self.portal.get_id_by_code_field_list(
            list=p_list_ork_history, code="responsible"
        )

        # Тип события
        field_ork_event_type = self.portal.get_id_by_code_field_list(
            list=p_list_ork_history, code="ork_event_type"
        )

        # Тип события: Первичное обучение
        field_item_et_ork_edu_first = self.portal.get_id_by_value_field_item_list(
            items=field_ork_event_type.items, code="et_ork_edu_first"
        )
        # Тип события: Обучение
        field_item_et_et_ork_edu = self.portal.get_id_by_value_field_item_list(
            items=field_ork_event_type.items, code="et_ork_edu"
        )
        # Тип события: Презентация
        field_item_et_et_ork_presentation = self.portal.get_id_by_value_field_item_list(
            items=field_ork_event_type.items, code="et_ork_presentation"
        )

        # items "Событие"
        field_ork_event_action = self.portal.get_id_by_code_field_list(
            list=p_list_ork_history, code="ork_event_action"
        )

        # Состоялся
        field_ork_event_action_item_done = self.portal.get_id_by_value_field_item_list(
            items=field_ork_event_action.items, code="ea_ork_done"
        )
        # Запланирован
        field_ork_event_action_item_plan = self.portal.get_id_by_value_field_item_list(
            items=field_ork_event_action.items, code="ea_ork_plan"
        )

        # Количество Входящих Результативных коммуникаций
        field_count_communication = self.portal.get_id_by_code_field_list(
            list=p_list_ork_history, code="ork_event_initiative"
        )
        field_ork_event_initiative_incoming = (
            self.portal.get_id_by_value_field_item_list(
                items=field_count_communication.items, code="ei_ork_incoming"
            )
        )

        # Количество Исходящих Результативных Коммуникаций
        field_ork_event_initiative_outgoing = (
            self.portal.get_id_by_value_field_item_list(
                items=field_count_communication.items, code="ei_ork_outgoing"
            )
        )
        # Дата последнего Звонка
        field_ork_event_date = self.portal.get_id_by_code_field_list(
            list=p_list_ork_history, code="ork_event_date"
        )

        # Количество СС
        field_et_ork_signal = self.portal.get_id_by_value_field_item_list(
            items=field_ork_event_type.items, code="et_ork_signal"
        )

        # Тип коммуникации
        field_event_communication = self.portal.get_id_by_code_field_list(
            list=p_list_ork_history, code="event_communication"
        )

        # Тип коммуникации: Выезд
        field_event_communication_item_face = (
            self.portal.get_id_by_value_field_item_list(
                items=field_event_communication.items, code="ec_ork_face"
            )
        )
        # Тип коммуникации: Звонок
        field_event_communication_item_call = (
            self.portal.get_id_by_value_field_item_list(
                items=field_event_communication.items, code="ec_ork_call"
            )
        )
        # Дата следующего Звонка
        field_ork_next_call_date = self.portal.get_id_by_code_field_list(
            list=p_list_ork_history, code="ork_plan_date"
        )

        client_field = ClientField()

        for key, value in element.items():
            if key == field_ork_event_action.bitrixCamelId:
                # Если "Событие" = Состоялся
                if int(value) == field_ork_event_action_item_done.bitrixId:
                    client_field.fields.count_communication_fact += 1

                    for e_key, e_value in element.items():

                        # Исходящий / Входящий
                        if e_key == field_count_communication.bitrixCamelId:
                            if (
                                int(e_value)
                                == field_ork_event_initiative_incoming.bitrixId
                            ):
                                client_field.fields.count_communication_incoming += 1
                            elif (
                                int(e_value)
                                == field_ork_event_initiative_outgoing.bitrixId
                            ):
                                client_field.fields.count_communication_incoming += 1

                        # Тип события
                        elif e_key == field_ork_event_type.bitrixCamelId:
                            # Презентация
                            if (
                                int(e_value)
                                == field_item_et_et_ork_presentation.bitrixId
                            ):
                                client_field.fields.count_presentation += 1

                                if not any(
                                    item in element[field_responsible.bitrixCamelId]
                                    for item in client_field.fields.responsible_presentation
                                ):
                                    client_field.fields.responsible_presentation.append(
                                        element[field_responsible.bitrixCamelId]
                                    )
                            # Тип события: Первичное обучение
                            elif int(e_value) == field_item_et_ork_edu_first.bitrixId:
                                client_field.fields.count_first_edu += 1

                                if not any(
                                    item in element[field_responsible.bitrixCamelId]
                                    for item in client_field.fields.responsible_first_edu
                                ):
                                    client_field.fields.responsible_first_edu.append(
                                        element[field_responsible.bitrixCamelId]
                                    )
                            # Тип события: Обучение
                            elif int(e_value) == field_item_et_et_ork_edu.bitrixId:

                                client_field.fields.count_edu += 1
                                client_field.fields.date_last_edu = element[
                                    field_ork_event_date.bitrixCamelId
                                ]

                                if not any(
                                    responsible_edu_item
                                    in element[field_responsible.bitrixCamelId]
                                    for responsible_edu_item in client_field.fields.responsible_edu
                                ):
                                    client_field.fields.responsible_edu.append(
                                        element[field_responsible.bitrixCamelId]
                                    )
                            # Количество Отработанных СС
                            elif int(e_value) == field_et_ork_signal.bitrixId:
                                client_field.fields.count_success_signal += 1

                        # Тип коммуникации
                        elif e_key == field_event_communication.bitrixCamelId:
                            if (
                                int(e_value)
                                == field_event_communication_item_call.bitrixId
                            ):
                                client_field.fields.count_call += 1
                            elif (
                                int(e_value)
                                == field_event_communication_item_face.bitrixId
                            ):
                                client_field.fields.count_face += 1
                        # Дата последнего Звонка
                        elif e_key == field_ork_event_date.bitrixCamelId:
                            client_field.fields.date_last_call = e_value
                        # Дата следующего Звонка
                        elif e_key == field_ork_next_call_date.bitrixCamelId:
                            client_field.fields.date_next_edu = e_value
                            client_field.fields.date_next_call = e_value

                # Если "Событие" = Запланирован
                elif int(value) == field_ork_event_action_item_plan.bitrixId:

                    for e_key, e_value in element.items():
                        # Тип события
                        if e_key == field_ork_event_type.bitrixCamelId:
                            # Количество СС
                            if int(e_value) == field_et_ork_signal.bitrixId:
                                client_field.fields.count_signal += 1
                            # Тип события: Обучение
                            elif (
                                int(e_value) == field_item_et_ork_edu_first.bitrixId
                            ) or int(e_value) == field_item_et_et_ork_edu.bitrixId:
                                if element.get(field_ork_next_call_date.bitrixCamelId):
                                    client_field.fields.date_next_edu = element[
                                        field_ork_next_call_date.bitrixCamelId
                                    ]

        if element.get(field_ork_crm_contact.bitrixCamelId):
            # contact
            client_field.bx_id = int(element.get(field_ork_crm_contact.bitrixCamelId))
        else:
            company = element.get(field_ork_crm_company.bitrixCamelId).split("CO_")
            if len(company) > 1:
                client_field.bx_id = int(company[1])
            else:
                client_field.bx_id = int(company[0])
        return client_field

    def calc_date_call_next(self, title: str = None, cont=None):
        if not self.task_company:
            return ""

        dates = []
        for task in self.task_company:
            if title:
                if title.lower() in task.title.lower():
                    dates.append(task.deadline)
                continue
            if cont:
                for contact in self.contacts:
                    if cont == contact.ID:
                        if title:
                            if title.lower() in task.title.lower():
                                dates.append(task.deadline)
                        else:
                            dates.append(task.deadline)
                continue
            dates.append(task.deadline)

        if not dates:
            return ""
        # Находим наименьшую дату
        earliest = min(dates)

        # Возвращаем наименьшую дату в формате строки
        return earliest.strftime("%d.%m.%Y %H:%M")
