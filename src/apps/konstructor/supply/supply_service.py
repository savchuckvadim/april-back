
class EventRPA:

    async def init_supply(self, request: Request):
        # Функция для получения и установки полей
        async def set_bx_field(field_code, value):
            try:
                bitrix_id = portal.get_rpa_field_by_code(
                    rpa=rpa, code_rpa_field=field_code
                ).bitrixId
                bx_fields[f"UF_RPA_{rpa.bitrixId}_{bitrix_id}"] = value
            except Exception as e:
                await TelegramBot().send_message_admin_error(
                    message=f"set_bx_field: {str(e)}\nfield: {field_code}\nvalue: {value}",
                    domain=domain,
                )

        def get_contractSpecificationState(contractSpecificationState):
            try:
                contractSpecificationState = json.loads(contractSpecificationState)
            except:
                ...

            data_contractSpecificationState = contractSpecificationState
            data_contractSpecificationState = ContractSpecificationStateDTO(
                **data_contractSpecificationState
            )
            contractSpecificationState_items = []
            for contract in data_contractSpecificationState.items:
                if "Вид поставки" in contract.name:
                    continue
                if type(contract.value) == str and len(contract.value) == 0:
                    continue
                for s_type in contract.supplies:
                    if data_supply.type != s_type.value:
                        continue
                    for c_type in contract.contractType:
                        if contractType in c_type.value:
                            contractSpecificationState_items.append(contract)

            contractSpecificationState = data_contractSpecificationState

            contractSpecificationState.items = contractSpecificationState_items
            return contractSpecificationState

        def get_contractProviderState(contractProviderState):
            try:
                contractProviderState = json.loads(contractProviderState)

            except:
                ...

            contractProviderState = ContractProviderStateDTO(**contractProviderState)
            return contractProviderState

        try:
            data = await request.form()
        except:
            raise "Error form data"

        supplyReports = data.get("supplyReport")
        try:
            supplyReports = json.loads(supplyReports)
        except:
            ...
        data_supply = data.get("supply")
        try:
            data_supply = json.loads(data_supply)
        except:
            ...

        data_supply = SupplyDTO(**data_supply)
        domain = data.get("domain")
        try:
            domain = json.loads(domain)
        except:
            ...

        document = data.get("document")

        try:
            document = json.loads(document)
        except:
            ...

        bxCompanyItems = data.get("bxCompanyItems")
        try:
            bxCompanyItems = json.loads(bxCompanyItems)
        except:
            ...
        bxrq = data.get("bxrq")
        try:
            bxrq = json.loads(bxrq)
        except:
            ...
        bxrq = ERQItem(**bxrq)
        data_bxDealItems = data.get("bxDealItems")
        try:
            data_bxDealItems = json.loads(data_bxDealItems)
        except:
            ...

        bxDealItems: list[EventDealDTO] = []
        if data_bxDealItems:
            for item in data_bxDealItems:
                try:
                    bxDealItems.append(EventDealDTO(**data_bxDealItems[item]))
                except:
                    asyncio.create_task(
                        TelegramBot().send_message_admin_error(
                            f"ERROR: bxDealItems\n\n{item}", domain="LAST"
                        )
                    )

        dealId = data.get("dealId")
        try:
            dealId = json.loads(dealId)
        except:
            ...
        try:
            event_rpaID = int(data.get("rpa_id"))
        except:
            event_rpaID = None

        companyId = data.get("companyId")
        try:
            companyId = json.loads(companyId)
        except:
            ...

        data_contract = data.get("contract", {})
        try:
            data_contract = json.loads(data_contract)
        except:
            ...

        data_contractType = data_contract.get("contract", {}).get("title")

        data_contract_coefficient = data_contract.get("contract", {}).get("coefficient")

        if data_contractType == None:
            await TelegramBot().send_message_admin_error(
                message="data_contractType == None", domain=domain
            )

        bxContacts = data.get("bxContacts")
        try:
            bxContacts = json.loads(bxContacts)
        except:
            ...

        contacts: list[ContactDTO] = []
        for bx_contact in bxContacts:
            try:
                contacts.append(ContactDTO(**bx_contact["contact"]))
            except Exception as e:
                print(str(e))
                await TelegramBot().send_message_admin_error(
                    message=f"Error contact: {bx_contact}", domain=domain
                )

        # Все что в complect checked TRUE! запушить в timeline сумма rows длительность договора
        data_complects = data.get("complect")
        try:
            data_complects = json.loads(data_complects)
        except:
            ...

        complect = []
        for data_complect in data_complects:
            try:
                complect.append(ComplectDTO(**data_complect))
            except Exception as e:
                print(str(e))
        data_rows = data.get("rows")
        try:
            data_rows = json.loads(data_rows)
        except:
            ...

        rows = []
        for data_row in data_rows:
            rows.append(RowDTO(**data_row))
        # contractProviderState < поставщик - должно быть поле. fullname  INN

        contractType = data.get("contractType")
        try:
            contractType = json.loads(contractType)
        except:
            ...

        contractSpecificationState = get_contractSpecificationState(
            data.get("contractSpecificationState")
        )

        contractProviderState = get_contractProviderState(
            data.get("contractProviderState")
        )

        # total
        data_totals = data.get("total")
        try:
            data_totals = json.loads(data_totals)
        except:
            ...

        total: list[TotalDTO] = []
        for data_total in data_totals:
            total.append(TotalDTO(**data_total))

        # contractType, includes, suuplies
        # сделка срок год/полгода **подумать** найти на основе чего-до по сроку действия договора и там что-то сделать (перезаключение стадия)

        # regions
        data_regions = data.get("regions")
        try:
            data_regions = json.loads(data_regions)
        except:
            ...

        regions = RegionDTO(**data_regions)

        try:
            managers = ManagerDTO(**bxCompanyItems)
        except Exception as e:
            print(str(e))
        try:
            del bxCompanyItems["manager_op"]
            del bxCompanyItems["manager_tmc"]
        except:
            pass
        op_companys: list[OpCompanyDTO] = []
        op_source_client_name: str = ""
        for field in bxCompanyItems:
            try:
                op_company = OpCompanyDTO(**bxCompanyItems[field])
                op_companys.append(op_company)
                if "SOURCE_SELECT" in op_company.bitrixId:
                    op_source_client_name = op_company.current.name
            except Exception as e:
                asyncio.create_task(
                    TelegramBot().send_message_admin_error(
                        f"ERROR: bxCompanyItems\n\n{item}", domain="LAST"
                    )
                )

        if not supplyReports:
            raise HTTPException(status_code=400, detail="supplyReports not found")
        if not domain:
            raise HTTPException(status_code=400, detail="domain not found")
        supply: list[ERPADTO] = []

        for deal_items in bxDealItems:
            if deal_items.current:
                if deal_items.field.type in ["datetime", "date"]:
                    date_format = "%Y-%m-%dT%H:%M:%S%z"
                    try:
                        date_obj = datetime.strptime(deal_items.current, date_format)
                        # Форматирование объекта datetime в строку без времени
                        deal_items.current = date_obj.strftime("%Y-%m-%d")
                    except:
                        pass
                supply.append(
                    ERPADTO(
                        bitrixd=deal_items.field.bitrixId,
                        type=deal_items.field.type,
                        name=deal_items.field.name,
                        value=(
                            ERPAValue(
                                id=op_company.current.bitrixId,
                                name=op_company.current.name,
                                title=op_company.current.name,
                                code=op_company.current.code,
                            )
                            if deal_items.field.type == "enumeration"
                            else deal_items.current
                        ),
                        code=deal_items.field.code,
                        group=deal_items.field.parent_type,
                    )
                )

        for op_company in op_companys:
            if op_company.current:
                if op_company.field.type == "datetime":
                    date_format = "%Y-%m-%dT%H:%M:%S%z"
                    date_obj = datetime.strptime(op_company.current, date_format)
                    # Форматирование объекта datetime в строку без времени
                    op_company.current = date_obj.strftime("%Y-%m-%d")
                supply.append(
                    ERPADTO(
                        bitrixd=op_company.field.bitrixId,
                        type=op_company.field.type,
                        name=op_company.field.name,
                        value=(
                            ERPAValue(
                                id=op_company.current.bitrixId,
                                name=op_company.current.name,
                                title=op_company.current.name,
                                code=op_company.current.code,
                            )
                            if op_company.field.type == "enumeration"
                            else op_company.current
                        ),
                        code=op_company.field.code,
                        group=op_company.field.parent_type,
                    )
                )
        for supplyReport in supplyReports:
            try:
                supply.append(ERPADTO(**supplyReport))
            except Exception as e:
                asyncio.create_task(
                    TelegramBot().send_message_admin_error(
                        message=f"supplyReport - error: \n{str(e)}\nsupplyReport: {supplyReport}",
                        domain=domain,
                    )
                )
                raise HTTPException(status_code=405, detail="supplyReport - error")

        portal = await PortalRepository().get_portal(domain)
        update_fields: list[ERPADTO] = []
        rpa = portal.get_rpa_by_code(code_rpa="supply")

        bx_company = BXCompany(domain=domain, api_url=portal.access_key)
        bx_deal = BXDeal(domain=domain, api_url=portal.access_key)

        company = await bx_company.get_company_by_field_value(
            field="ID", value=companyId
        )
        base_deal = await bx_deal.get_deal(deal_id=dealId)

        for su in supply:
            for p_field in rpa.bitrixfields:
                xx = NameFieldManager.find(p_field.code)

                if xx:
                    names = ManagerDTO.get_field_names()
                    if not names:
                        continue
                    try:
                        manager: Manager = getattr(managers, xx.value)
                    except:
                        print("Менеджеров нет\n", xx.value)
                        continue
                    if xx.value in names:
                        if manager.user_id == None:
                            if xx == NameFieldManager.MANAGER_OP:
                                try:
                                    manager.user_id = base_deal.UF_CRM_MANAGER_OP
                                except:
                                    await TelegramBot().send_message_admin_error(
                                        message="base_deal = None", domain=domain
                                    )
                            elif xx == NameFieldManager.MANAGER_TMC:
                                try:
                                    manager.user_id = base_deal.UF_CRM_MANAGER_TMC
                                except:
                                    await TelegramBot().send_message_admin_error(
                                        message="base_deal = None", domain=domain
                                    )
                        new_ = ERPADTO(
                            bitrixId=p_field.bitrixId,
                            type=manager.field.type,
                            name=manager.field.title,
                            value=f"{manager.user_id}",
                            code=p_field.code,
                            group=su.group,
                        )
                        update_fields.append(new_)
                    # break
                    # new_ = ERPADTO(bitrixId=p_field.bitrixId, type=managers.)

                if p_field.code == su.code:
                    su.bitrixId = p_field.bitrixId
                    if len(p_field.items) > 0:
                        for p_item in p_field.items:
                            if su.value == None:
                                continue
                            try:
                                if p_item.code == su.value.code:
                                    su.value.id = p_item.bitrixId
                                    break
                            except:
                                asyncio.create_task(
                                    TelegramBot().send_message_admin_error(
                                        f"ERROR: p_item.code == su.value.code\n\np_item: {p_item}\n\nsu: {su}",
                                        domain="LAST",
                                    )
                                )

                    update_fields.append(su)

        if len(supply) != len(update_fields):
            fail_fields = []
            for su in supply:
                if not su.bitrixId:
                    fail_fields.append(
                        {
                            "code": su.code,
                            "bitrixId": su.bitrixId,
                            "name": su.name,
                            "value": (
                                {
                                    "id": su.value.id,
                                    "code": su.value.code,
                                    "name": su.value.name,
                                }
                                if type(su.value) == ERPAValue
                                else su.value
                            ),
                        }
                    )

        bx_rpa = BXRPA(
            api_url=portal.access_key,
            domain=domain,
        )
        bx_fields = {}
        for field in update_fields:
            if field.value == None:
                continue
            if field.bitrixId == None:

                continue
            bx_fields[f"UF_RPA_{rpa.bitrixId}_{field.bitrixId}"] = (
                field.value.id if type(field.value) == ERPAValue else field.value
            )

        # Установка field
        # Поле title для rpa
        rpa.title = company.TITLE
        # Поле основная сделка
        await set_bx_field(field_code="rpa_crm_base_deal", value=dealId)

        # Поле контакты
        contact_ids = [contact.ID for contact in contacts]
        await set_bx_field("rpa_crm_contacts", contact_ids)

        # Поле Лиды
        bx_lead = BXLead(domain=domain, api_url=portal.access_key)
        leads = await bx_lead.get_leads_by_company_id(company_id=companyId)
        if leads:
            lead_ids = [lead.ID for lead in leads]
            await set_bx_field("rpa_supply_lids", lead_ids)

        # Поле Компания
        await set_bx_field("rpa_crm_company", companyId)

        # Поле "Тип договора"
        await set_bx_field("contract_type", data_contractType)

        # Поле "ИНН" и "Адрес"
        # Получаем поле с code = 'crm'
        field_inn = next((field for field in bxrq.fields if field.code == "inn"), None)
        await set_bx_field("company_rq_inn", field_inn.value)
        field_address = ""
        for adr_items in bxrq.address.items:
            if adr_items.type_id == 1:
                for field in adr_items.fields:
                    if field.value == "" or field.value == None:
                        continue
                    if field_address == "":
                        field_address = field.value
                    else:
                        field_address += ", " + field.value

        if field_address == None:
            asyncio.create_task(
                TelegramBot().send_message_admin_error(
                    "НЕТ АДРЕСА в bxrq.address.current"
                )
            )
        else:
            await set_bx_field("service_address", field_address)

        # Поле "Email для интернет версии"
        email = ""
        for bx_deal_item in bxDealItems:
            if bx_deal_item.field.code == "garant_client_email":
                email = bx_deal_item.current
        if email == "":  # УДАЛИМ скоро : bxDealdItems
            for item in contractSpecificationState.items:
                if "Email для интернет" in item.name:
                    email = item.value
        await set_bx_field("service_email_complect", email)

        # Поле Менеджер ТМС
        await set_bx_field(
            "manager_tmc",
            base_deal.UF_CRM_LAST_PRES_PLAN_RESPONSIBLE,
        )
        id_rpa = None
        # if domain == "april-dev.bitrix24.ru":

        if event_rpaID != None and event_rpaID > 0:
            id_rpa = event_rpaID

            result = await bx_rpa.update_supply_rpa(
                bx_fields=bx_fields,
                rpa=rpa,
                id=event_rpaID,
            )
            asyncio.create_task(
                TelegramBot().send_message_admin_error(
                    f"UPDATE RPA: {event_rpaID}", domain="LAST"
                )
            )
        else:
            result = await bx_rpa.create_supply_rpa(
                bx_fields=bx_fields,
                rpa=rpa,
            )

            id_rpa = result[0]["result"][0]["item"]["id"]
        if id_rpa == None:
            result = await bx_rpa.create_supply_rpa(
                bx_fields=bx_fields,
                rpa=rpa,
            )

            id_rpa = result[0]["result"][0]["item"]["id"]
        await bx_deal.add_timeline(
            message=f"<a href='https://{domain}/rpa/item/{rpa.bitrixId}/{id_rpa}/'>Заявка на поставку</a>",
            deal_id=dealId,
        )

        #####################################
        #               FILE                #
        #####################################
        # Извлекаем файл из данных формы
        current_invoice = None
        current_contract = None

        # ЕСЛИ В СДЕЛКЕ ЕСТЬ ФАЙЛ = downloadUrl
        for su_field in supply:
            if su_field.code == "current_contract":
                if su_field.value == None:
                    continue
                if su_field.value == "":
                    continue
                if su_field.value.get("downloadUrl"):
                    print("ЗАГРУЗИТЬ ИЗ СДЕЛКИ В RPA")
                    async with httpx.AsyncClient() as client:
                        url = "https://" + domain + su_field.value.get("downloadUrl")
                        print(url)
                        response = await client.post(url=url)
                        if response.status_code == 200:
                            # Попробуем извлечь имя файла из заголовка Content-Disposition
                            content_disposition = response.headers.get(
                                "Content-Disposition"
                            )
                            filename = None

                            if content_disposition:
                                # Извлекаем имя файла из заголовка
                                if "filename=" in content_disposition:
                                    # Извлекаем обычное имя файла
                                    filename = (
                                        content_disposition.split("filename=")[1]
                                        .split(";")[0]
                                        .strip('"')
                                    )

                                # Проверяем наличие закодированного имени файла
                                if "filename*=" in content_disposition:
                                    encoded_filename = content_disposition.split(
                                        "filename*="
                                    )[1].split(";")[0]
                                    # Декодируем имя файла
                                    filename = urllib.parse.unquote(
                                        encoded_filename.split("''")[-1]
                                    )
                            else:
                                # Если заголовка нет, используем имя файла из URL
                                filename = "Непонятно"
                            with open(
                                filename, "wb"
                            ) as file:  # Замените "downloaded_file" на желаемое имя файла
                                file.write(response.content)
                            print(f"Файл успешно скачан как: {filename}")

                            # Преобразуем файл в Base64
                            with open(filename, "rb") as file:
                                file_content = file.read()
                                base64_encoded = base64.b64encode(file_content).decode(
                                    "utf-8"
                                )
                            current_contract = {
                                "filename": filename,
                                "file_base64": base64_encoded,
                            }
                else:
                    print("загрузить и в сделку и в rpa")
            if su_field.code == "current_invoice":
                if su_field.value == None:
                    continue
                if su_field.value == "":
                    continue
                if su_field.value.get("downloadUrl"):
                    print("ЗАГРУЗИТЬ ИЗ СДЕЛКИ В RPA")
                    async with httpx.AsyncClient() as client:
                        url = "https://" + domain + su_field.value.get("downloadUrl")
                        response = await client.post(url=url)
                        if response.status_code == 200:
                            # Попробуем извлечь имя файла из заголовка Content-Disposition
                            content_disposition = response.headers.get(
                                "Content-Disposition"
                            )
                            filename = None

                            if content_disposition:
                                # Извлекаем имя файла из заголовка
                                if "filename=" in content_disposition:
                                    # Извлекаем обычное имя файла
                                    filename = (
                                        content_disposition.split("filename=")[1]
                                        .split(";")[0]
                                        .strip('"')
                                    )

                                # Проверяем наличие закодированного имени файла
                                if "filename*=" in content_disposition:
                                    encoded_filename = content_disposition.split(
                                        "filename*="
                                    )[1].split(";")[0]
                                    # Декодируем имя файла
                                    filename = urllib.parse.unquote(
                                        encoded_filename.split("''")[-1]
                                    )
                            else:
                                # Если заголовка нет, используем имя файла из URL
                                filename = "ХЗ"
                            with open(
                                filename, "wb"
                            ) as file:  # Замените "downloaded_file" на желаемое имя файла
                                file.write(response.content)
                            print(f"Файл успешно скачан как: {filename}")

                            # Преобразуем файл в Base64
                            with open(filename, "rb") as file:
                                file_content = file.read()
                                base64_encoded = base64.b64encode(file_content).decode(
                                    "utf-8"
                                )
                            current_invoice = {
                                "filename": filename,
                                "file_base64": base64_encoded,
                            }
                else:
                    print("загрузить и в сделку и в rpa")

        # Если нет в СДЕЛКИ ФАЙЛА
        if current_contract == None:
            # file_hz = data.get("file_current_contract")
            # print(type(file_hz))
            file_current_contract: UploadFile = data.get("file_current_contract")

            current_contract = {}
            if file_current_contract:
                current_contract = {"filename": file_current_contract.filename}
                # Чтение содержимого файла
                file_content = await file_current_contract.read()

                # Преобразование содержимого файла в Base64
                current_contract["file_base64"] = base64.b64encode(file_content).decode(
                    "utf-8"
                )
                # else:
                #     print("error: No file uploaded or invalid file")
                #     print(file_current_contract)

        if current_invoice == None:
            file_current_invoice: UploadFile = data.get("file_current_invoice")

            current_invoice = {}
            # if isinstance(file_current_invoice, str):
            #     # Если file_current_invoice — строка, попробуйте преобразовать её в объект UploadFile
            #     from fastapi.datastructures import UploadFile as FastAPIUploadFile
            #     from io import BytesIO

            #     file_data = BytesIO(file_current_invoice.encode())
            #     file_current_invoice = FastAPIUploadFile(
            #         filename="temp_file.docx",
            #         file=file_data,
            #         size=len(file_current_invoice),
            #     )
            if file_current_invoice:

                current_invoice = {"filename": file_current_invoice.filename}
                # Чтение содержимого файла
                file_content = await file_current_invoice.read()

                # Преобразование содержимого файла в Base64
                current_invoice["file_base64"] = base64.b64encode(file_content).decode(
                    "utf-8"
                )

        await self.update_file_rpa(
            document=document,
            id_rpa=id_rpa,
            bx_rpa=bx_rpa,
            rpa=rpa,
            current_contract=current_contract,
            current_invoice=current_invoice,
        )
        file_deal_fields = {}
        if current_contract:
            file_deal_fields["UF_CRM_CURRENT_CONTRACT"] = {
                "fileData": [
                    current_contract["filename"],
                    current_contract["file_base64"],
                ],
            }
        if current_invoice:
            file_deal_fields["UF_CRM_CURRENT_INVOICE"] = {
                "fileData": [
                    current_invoice["filename"],
                    current_invoice["file_base64"],
                ],
            }
        if len(file_deal_fields) > 0:
            asyncio.create_task(
                bx_deal.update_deal(deal_id=dealId, fields=file_deal_fields)
            )
        #####################################

        # # TimeLine
        # await self.init_timeline_complect(
        #     complects=complect, bx_rpa=bx_rpa, rpa=rpa, id_rpa=id_rpa, rows=rows
        # )

        await self.init_timeline_contractSpecificationState(
            contractSpecificationState=contractSpecificationState,
            bx_rpa=bx_rpa,
            rpa=rpa,
            id_rpa=id_rpa,
            total=total,
            regions=regions,
            complects=complect,
            coefficient=data_contract_coefficient,
            contractProviderState=contractProviderState,
            bxrq=bxrq,
            op_source_client_name=op_source_client_name,
        )

        return id_rpa

    async def init_deal(self, request: Request):
        body = await request.body()
        body_str = body.decode("utf-8")  # Декодируем байты в строку
        data = BXBase.parse_data_robot(body_str=body_str)
        data = BXRobotDTO(**data)
        portal = await PortalRepository().get_portal(domain=data.auth.domain)

        if data.document_id["0"] == "rpa":
            ids = data.document_id["2"].split(":")
            document_id = {"rpa_id": ids[1], "type_id": ids[0]}
            data.document_id = Document(**document_id)
        bx_deal = BXDeal(domain=data.auth.domain, api_url=portal.access_key)
        bx_rpa = BXRPA(domain=data.auth.domain, api_url=portal.access_key)

        rpa = await bx_rpa.get_rpa(
            type_id=data.document_id.type_id, rpa_id=data.document_id.rpa_id
        )
        p_rpa_supple = portal.get_rpa_by_code(code_rpa=CodeRPA.supply.value)

        deal_fields = {}

        # из portal rpa, собираю fields для сделки
        for p_field in p_rpa_supple.bitrixfields:
            for attr in rpa.__dict__:
                # print(f"attr: {attr}\n\np_field_code: {p_field.code}")
                if p_field.code == attr.lower():
                    deal_fields[p_field.code] = getattr(rpa, attr)
        # пробразую из rpa field в deal field
        init_deal_fields = {}
        for p_deal in portal.deal.bitrixfields:
            for d_key, d_value in deal_fields.items():
                if p_deal.code == d_key:
                    if p_deal.type == "enumeration":
                        continue
                    if p_deal.type == "enumeration":
                        # if p_deal.code == "contract_relation_type":
                        #     pass
                        for p_item in p_deal.items:
                            bx_bitrix = portal.get_bitrix_id_by_id_field_item_list(
                                p_deal.items, p_item.bitrixId
                            )
                            for rpa_field in p_rpa_supple.bitrixfields:
                                if rpa_field.code == p_deal.code:
                                    deal_item = portal.get_id_by_value_field_item_list(
                                        p_deal.items, bx_bitrix
                                    )
                                    if deal_item:
                                        init_deal_fields[
                                            f"UF_CRM_{p_deal.bitrixId}"
                                        ] = deal_item.bitrixId
                                    break
                            break
                    else:
                        init_deal_fields[f"UF_CRM_{p_deal.bitrixId}"] = d_value

        deal_category_id = portal.get_deal_category_by_code("service_base")

        rpa_crm_base_deal = init_deal_fields.get(
            f'UF_CRM_{"rpa_crm_base_deal".upper()}'
        )

        field_file = {}
        if rpa.CURRENT_CONTRACT:
            field_file["UF_CRM_CURRENT_CONTRACT"] = {
                "fileData": await self.get_file_in_field(
                    url=rpa.CURRENT_CONTRACT["urlMachine"]
                )
            }
        if rpa.CURRENT_INVOICE:
            field_file["UF_CRM_CURRENT_INVOICE"] = {
                "fileData": await self.get_file_in_field(
                    url=rpa.CURRENT_INVOICE["urlMachine"]
                )
            }

        base_deal_fields_value = await bx_deal.get_deal_fields_value(
            deal_id=rpa_crm_base_deal
        )

        # init_deal_fields = {}
        init_deal_fields["COMPANY_ID"] = rpa.RPA_CRM_COMPANY
        init_deal_fields["CONTACT_IDS"] = rpa.RPA_CRM_CONTACTS
        init_deal_fields["UF_CRM_RPA_ARM_COMPLECT_ID"] = rpa.RPA_ARM_COMPLECT_ID
        init_deal_fields["UF_CRM_RPA_ARM_CLIENT_ID"] = rpa.RPA_ARM_CLIENT_ID
        init_deal_fields["ASSIGNED_BY_ID"] = rpa.MANAGER_OS
        init_deal_fields["UF_CRM_MANAGER_EDU"] = rpa.MANAGER_EDU

        for key, value in base_deal_fields_value.items():
            if key not in init_deal_fields:
                init_deal_fields[key] = value

        # init_deal_fields["UF_CRM_LAST_PRES_PLAN_RESPONSIBLE"] = base_deal_fields_value.get('UF_CRM_LAST_PRES_PLAN_RESPONSIBLE')
        stage_code = EventService().days_stage_dela(
            EventService().days_until_renewal(rpa.CONTRACT_END),
        )
        stage_code = portal.get_stage_by_code(stage_code)
        init_deal_fields["UF_CRM_CURRENT_CONTRACT"] = ""
        init_deal_fields["UF_CRM_CURRENT_INVOICE"] = ""
        init_deal_fields["UF_CRM_CURRENT_SUPPLY"] = ""

        deal = await bx_deal.init_new_element(
            init_deal_fields=init_deal_fields,
            deal_category_id=deal_category_id.bitrixId,
            stage_code=stage_code,
        )

        deal_id = deal["result"][0]

        # insert file contract and invoice
        await bx_deal.update_deal(deal_id=deal_id, fields=init_deal_fields)
        await bx_deal.update_deal(deal_id=deal_id, fields=field_file)

        # copy productrows from base_deal
        asyncio.create_task(
            self.copy_product_rows_from_base_deal(
                base_deal_id=rpa.RPA_CRM_BASE_DEAL,
                bx_deal=bx_deal,
                deal_service_id=deal_id,
            )
        )
        # обновление ответственного у компании
        bx_company = BXCompany(
            domain=data.auth.domain,
            api_url=portal.access_key,
        )
        await bx_company.update_company(
            company_id=rpa.RPA_CRM_COMPANY,
            fields={
                "ASSIGNED_BY_ID": rpa.MANAGER_OS,
                "UF_CRM_USER_CARDNUM": rpa.RPA_ARM_CLIENT_ID,
            },
        )

        # обновление ответственного у всех контактов
        bx_contact = BXContact(
            domain=data.auth.domain,
            api_url=portal.access_key,
        )
        for contact in rpa.RPA_CRM_CONTACTS:
            await bx_contact.update_contact(
                contact_id=contact,
                fields={"ASSIGNED_BY_ID": rpa.MANAGER_OS},
            )
        asyncio.create_task(
            bx_deal.add_timeline(
                message=f"<a href='https://{data.auth.domain}/rpa/item/{p_rpa_supple.bitrixId}/{data.document_id.rpa_id}/'>Заявка на поставку</a>",
                deal_id=deal_id,
            )
        )
        asyncio.create_task(
            bx_rpa.add_timeline(
                text=f"<a href='https://{data.auth.domain}/crm/deal/details/{deal_id}/'>Поставка</a>",
                typeId=p_rpa_supple.bitrixId,
                itemId=data.document_id.rpa_id,
            )
        )

        # Задачи для ork
        asyncio.create_task(
            self.init_task_manager_ork_first_education(
                portal=portal,
                domain=data.auth.domain,
                rpa=rpa,
                deal_service_id=deal_id,
            )
        )
        asyncio.create_task(
            self.init_task_manager_ork_supply(
                portal=portal,
                domain=data.auth.domain,
                rpa=rpa,
                deal_service_id=deal_id,
            )
        )

        async with httpx.AsyncClient() as client:
            url = os.getenv("URL_COPY_DEAL")
            headers = {
                "X-Requested-With": "XMLHttpRequest",
                "X-API-KEY": os.getenv("ONLINE_API_KEY"),
            }
            items = {
                "dealId": rpa.RPA_CRM_BASE_DEAL,
                "newDealId": deal_id,
                "userId": init_deal_fields["ASSIGNED_BY_ID"],
                "domain": data.auth.domain,
            }
            response = await client.post(url, headers=headers, json=items)

        await TelegramBot().send_message_admin_error(
            message=f"Created Deal: {deal_id}", domain=data.auth.domain
        )
        return portal

    async def update_file_rpa(
        self,
        document: str,
        id_rpa: int,
        bx_rpa: BXRPA,
        rpa: PRPADTO,
        current_contract,
        current_invoice,
    ):
        """Добавляет в поле "Текущий договор" договор. CURRENT_SUPPLY"""
        print(f"rpa_id: {id}")
        # Расшифровка URL

        decoded_url = urllib.parse.unquote(document)
        file_name = decoded_url.split("/")
        file_name = file_name[-1]
        async with httpx.AsyncClient() as client:
            # Отправляем GET-запрос по указанному URL
            response = await client.get(document)

            # Проверяем, успешен ли запрос
            response.raise_for_status()
            data_json = response.json()

        bx_fields = {}
        bx_fields[f"UF_RPA_{rpa.bitrixId}_CURRENT_SUPPLY"] = {
            "n0": data_json["filename"],
            "n1": data_json["file_base64"],
        }
        if current_contract:
            bx_fields[f"UF_RPA_{rpa.bitrixId}_CURRENT_CONTRACT"] = {
                "n0": current_contract["filename"],
                "n1": current_contract["file_base64"],
            }
        if current_invoice:
            bx_fields[f"UF_RPA_{rpa.bitrixId}_CURRENT_INVOICE"] = {
                "n0": current_invoice["filename"],
                "n1": current_invoice["file_base64"],
            }
        asyncio.create_task(
            bx_rpa.update_supply_rpa(bx_fields=bx_fields, rpa=rpa, id=id_rpa)
        )
        return

    async def init_timeline_complect(
        self,
        complects: list[ComplectDTO],
        bx_rpa: BXRPA,
        rpa: PRPADTO,
        id_rpa: int,
        rows: list[RowDTO],
    ):
        """не используется"""
        text = ""
        summ = 0

        for complect in complects:
            text += f"<h4>{complect.groupsName}:</h4>"
            text += "<ul>\n"
            for complect_value in complect.value:
                text += f"    <li>{complect_value.name}</li>\n"
            text += "</ul>\n"
        for row in rows:
            summ += row.price.sum

        text += (
            f"<h3>Сумма:</h3> Всего: {summ} руб.\nВ месяц: {rows[0].price.current} руб."
        )
        await bx_rpa.add_timeline(
            text=text,
            title="Комплект договора",
            typeId=rpa.bitrixId,
            itemId=id_rpa,
        )
        return

    async def init_timeline_contractSpecificationState(
        self,
        contractSpecificationState: ContractSpecificationStateDTO,
        bx_rpa: BXRPA,
        rpa: PRPADTO,
        id_rpa: int,
        total: list[TotalDTO],
        regions: RegionDTO,
        complects: list[ComplectDTO],
        coefficient: int,
        contractProviderState: ContractProviderStateDTO,
        bxrq: ERQItem,
        op_source_client_name: str,
    ):
        text = ""
        summ = 0
        period = None
        month_summ = 0  # summ / total.price.measure.type

        if op_source_client_name != "":
            text = f"<h4>Источник:</h4><ul><li>{op_source_client_name}</li></ul>"
            text += f"<h4>Поставщик:</h4><ul><li>{contractProviderState.current.rq.shortname}</li></ul>"
        else:
            text = f"<h4>Поставщик:</h4><ul><li>{contractProviderState.current.rq.shortname}</li></ul>"

        if bxrq.preset_id > 1:
            field_fullname = next(
                (field for field in bxrq.fields if field.code == "fullname"), None
            )
        if bxrq.preset_id  == 1:
            field_fullname = next(
                (field for field in bxrq.fields if field.code == "personName"), None
            )
       
        field_inn = next((field for field in bxrq.fields if field.code == "inn"), None)
        field_primaryAdresss = ""
        for adr_items in bxrq.address.items:
            if adr_items.type_id == 1:
                for field in adr_items.fields:
                    if field.value == "" or field.value == None:
                        continue
                    if field_primaryAdresss == "":
                        field_primaryAdresss = field.value
                    else:
                        field_primaryAdresss += ", " + field.value
        asyncio.create_task(
            TelegramBot().send_message_admin_error(
                "init_timeline_contractSpecificationState > : ",
                field_primaryAdresss,
            )
        )
        if bxrq.preset_id == 1:
            text += f"<h4>Покупатель: </h4>"

            text += f"<ul>"
            text += f"<li><b>Название: </b>{field_fullname.value}</li>"
            text += f"<li><b>ИНН: </b>{field_inn.value}</li>"
            text += f"<li><b>Факт. адрес: </b>{field_primaryAdresss}</li>"

            text += f"</ul>"

        for contract in contractSpecificationState.items:
            if "Бесплатные информационные блоки" in contract.name:
                continue
            elif "Энциклопедии Решений" in contract.name:
                continue
            elif "Пакеты Энциклопедий Решений" in contract.name:
                continue
            elif "Состав Пакетов Энциклопедий Решений" in contract.name:
                continue

            text += f"<h4>{contract.name}:</h4>"
            if "Наименование" in contract.name:
                for total_name in total:
                    summ += total_name.price.sum
                    month_summ = (
                        total_name.price.quantity * total_name.price.measure.type
                    )
                    text += f"<ul>{total_name.name}. {total_name.supply.name}</ul>"
                    period = total_name.price.measure.type

            elif "Информационные блоки" in contract.name:

                value = str(contract.value).split("\n")
                text += "<ul>\n"
                for n_value in value:
                    if len(n_value) > 0:
                        text += f"<li>    {n_value}</li>"
                text += "<br>"

                # Пакеты энциклопедий
                packets = []  # {"name", "values"}

                for contract_specific in contractSpecificationState.items:
                    value = str(contract_specific.value).split("\n")
                    if contract_specific.code == "specification_ers_packets":

                        specification_ers_packets = []
                        for n_value in value:
                            if len(n_value) > 0:
                                specification_ers_packets.append(n_value)
                        packets.append(
                            {
                                "name": contract_specific.name,
                                "code": "specification_ers_packets",
                                "value": specification_ers_packets,
                            },
                        )
                    elif contract_specific.code == "specification_ers_in_packets":
                        specification_ers_in_packets = []
                        for n_value in value:
                            if len(n_value) > 0:
                                specification_ers_in_packets.append(n_value)
                        for packet in packets:
                            if packet.get("code") == "specification_ers_packets":
                                packet["items"] = specification_ers_in_packets
                    elif contract_specific.code == "specification_ers":

                        specification_ers = []
                        for n_value in value:
                            if len(n_value) > 0:
                                specification_ers.append(n_value)
                        packets.append(
                            {
                                "name": contract_specific.name,
                                "value": specification_ers,
                            },
                        )
                if len(packets) > 0:
                    for packet in packets:
                        if packet.get("code"):
                            for value in packet["value"]:
                                text += f"<li>{value}</li>"
                            text += "<ul>"
                            for item in packet["items"]:
                                text += f"<li>{item}</li>"
                            text += "</ul>"
                        else:
                            text += f"<li>{packet['name']}:</li><ul>"
                            for value in packet["value"]:
                                text += f"<li>{value}</li>"
                            text += f"</ul>"

                # региональные инфоблоки
                if len(regions.inComplect) == 0 and len(regions.noWidth) == 0:
                    continue
                reg_info = "<li>Региональные инфоблоки\n<ul>"
                for region in regions.inComplect:
                    if region.infoblock in contract.value:
                        continue
                    reg_info += f"<li> {region.infoblock}</li>"

                for region in regions.noWidth:
                    if region.infoblock in contract.value:
                        continue
                    reg_info += f"<li> {region.infoblock}</li>"
                if "</li>" in reg_info:
                    reg_info += "</ul></li>"
                    text += reg_info
                    text += "<br>"

                text += "</ul>\n"

            else:

                value = str(contract.value).split("\n")
                text += "<ul>\n"
                for n_value in value:
                    if len(n_value) > 0:
                        text += f"<li>    {n_value}</li>"
                text += "</ul>\n"
            # if "Срок действия лицензии, количество лицензий" in contract.name:
            #     period = contract.value.split("Срок действия лицензии:")[1]

        if period == None:
            period = "неизвестно"
        text_summ = f"<li>Всего за {month_summ} мес.: {summ:.2f} руб.</li>"
        month_summ = summ / month_summ
        text += f"<h3>Сумма:</h3>"
        text += "<ul>"
        text += text_summ
        text += f"<li>В месяц: {month_summ:.2f} руб.</li>"
        text += "</ul>"
        await bx_rpa.add_timeline(
            text=text,
            title="Комлект Гарант",
            typeId=rpa.bitrixId,
            itemId=id_rpa,
        )
        return

    async def init_task_accountant(self, request: Request):

        body = await request.body()
        body_str = body.decode("utf-8")  # Декодируем байты в строку
        data = BXBase.parse_data_robot(body_str=body_str)
        data = BXRobotDTO(**data)
        if data.document_id["0"] == "rpa":
            ids = data.document_id["2"].split(":")
            document_id = {"rpa_id": ids[1], "type_id": ids[0]}
            data.document_id = Document(**document_id)

        portal = await PortalRepository().get_portal(domain=data.auth.domain)
        bx_rpa = BXRPA(
            domain=data.auth.domain,
            api_url=portal.access_key,
        )

        rpa = await bx_rpa.get_rpa(
            type_id=data.document_id.type_id,
            rpa_id=data.document_id.rpa_id,
        )
        bx_task = BXTask(
            domain=data.auth.domain,
            api_url=portal.access_key,
        )

        date_format = "%Y-%m-%dT%H:%M:%S%z"

        date_obj = datetime.strptime(rpa.CONTRACT_START, date_format)
        rpa.CONTRACT_START = date_obj.strftime("%d.%m.%Y")
        date_obj = datetime.strptime(rpa.FIRST_PAY_DATE, date_format)
        first_pay_day = date_obj.strftime("%d.%m.%Y")
        date_obj = datetime.strptime(rpa.CONTRACT_END, date_format)
        rpa.CONTRACT_END = date_obj.strftime("%d.%m.%Y")

        date_obj = datetime.strptime(rpa.SUPPLY_DATE, date_format)
        supply_date = date_obj.strftime("%d.%m.%Y")
        rpa.SUPPLY_DATE = date_obj.replace(hour=8, minute=0)
        rpa.SUPPLY_DATE = rpa.SUPPLY_DATE.strftime("%d.%m.%Y %H:%M")

        field = {"TITLE": rpa.NAME}
        description = f"""Действие договора с {rpa.CONTRACT_START} до {rpa.CONTRACT_END}\n
Дата поставки: {supply_date}\n
Дата первой оплаты: {first_pay_day}\n\n
ссылка на RPA: <a href="https://{data.auth.domain}/rpa/item/{data.document_id.type_id}/{data.document_id.rpa_id}/">Заявка на поставку</a>"""
        field["DESCRIPTION"] = description
        field["DEADLINE"] = rpa.SUPPLY_DATE
        field["UF_CRM_TASK"] = [
            f"CO_{rpa.RPA_CRM_COMPANY}",
        ]
        for user in rpa.users:
            if not user.workPosition:
                continue
            if "бухгалтер".lower() in user.workPosition.lower().strip():
                field["RESPONSIBLE_ID"] = user.id
                break

        if not field.get("RESPONSIBLE_ID"):
            field["RESPONSIBLE_ID"] = rpa.updatedBy
        task = await bx_task.create(field)
        text_timeline_rpa = f"<a href='https://{data.auth.domain}/company/personal/user/{task.responsibleId}/tasks/task/view/{task.id}/'>Задача для бухгалтера</a>"
        await bx_rpa.add_timeline(
            text=text_timeline_rpa,
            typeId=data.document_id.type_id,
            itemId=data.document_id.rpa_id,
        )
        return task.id

    async def init_task_manager_ork_first_education(
        self, portal: PortalDTO, domain, rpa: RPAData, deal_service_id: int
    ):
        """Создает задачу первичное обучение"""
        bx_task = BXTask(
            domain=domain,
            api_url=portal.access_key,
        )
        try:
            # Преобразование строки в объект datetime
            dt = datetime.fromisoformat(rpa.SUPPLY_DATE)
            if dt.hour == 0:
                dt = dt.replace(hour=11)
            rpa.SUPPLY_DATE = dt.strftime("%d.%m.%Y %H:%M")

        except Exception as e:
            asyncio.create_task(
                TelegramBot().send_message_admin_error(
                    message=f"init_task_manager_ork_first_education:\n\nrpa.SUPPLY_DATE: {rpa.SUPPLY_DATE}",
                    domain=domain,
                ),
            )
        field = {"TITLE": f"Первичное обучение: {rpa.name}"}

        owner_comment = "\n".join(rpa.RPA_OWNER_COMMENT)
        tmc_comment = "\n".join(rpa.RPA_TMC_COMMENT)

        description = f"""Описание ситуации: {rpa.SITUATION_COMMENTS}\n\n
Комментарий к заявке Руководитель: \n{owner_comment}\n\n
Комментарий к заявке РОП: \n{tmc_comment}\n\n"""
        field["DESCRIPTION"] = description
        field["DEADLINE"] = rpa.CLIENT_CALL_DATE
        field["UF_CRM_TASK"] = [
            f"CO_{rpa.RPA_CRM_COMPANY}",
            f"D_{deal_service_id}",
        ]
        field["RESPONSIBLE_ID"] = rpa.MANAGER_OS
        task = await bx_task.create(field)
        return task.id

    async def init_task_manager_ork_supply(
        self, portal: PortalDTO, domain, rpa: RPAData, deal_service_id: int
    ):
        """Создает задачу Поставка"""
        bx_task = BXTask(
            domain=domain,
            api_url=portal.access_key,
        )
        try:
            # Преобразование строки в объект datetime
            asyncio.create_task(
                TelegramBot().send_message_admin_error(
                    message=f"init_task_manager_ork_supply:\n\nrpa.SUPPLY_DATE ДО ПРЕОБРАЗОВАНИЙ: {rpa.SUPPLY_DATE}",
                    domain=domain,
                ),
            )
            dt = datetime.fromisoformat(rpa.SUPPLY_DATE)

            if dt.hour == 0:
                dt = dt.replace(hour=11)
            rpa.SUPPLY_DATE = dt.strftime("%d.%m.%Y %H:%M")
        except:
            asyncio.create_task(
                TelegramBot().send_message_admin_error(
                    message=f"init_task_manager_ork_supply:\n\nrpa.SUPPLY_DATE: {rpa.SUPPLY_DATE}",
                    domain=domain,
                ),
            )

        field = {"TITLE": rpa.name}

        owner_comment = "\n".join(rpa.RPA_OWNER_COMMENT)
        tmc_comment = "\n".join(rpa.RPA_TMC_COMMENT)

        description = f"""Описание ситуации: {rpa.SITUATION_COMMENTS}\n\n
Комментарий к заявке Руководитель: \n{owner_comment}\n\n
Комментарий к заявке РОП: \n{tmc_comment}\n\n"""
        field["DESCRIPTION"] = description
        field["DEADLINE"] = rpa.SUPPLY_DATE
        field["UF_CRM_TASK"] = [
            f"CO_{rpa.RPA_CRM_COMPANY}",
            f"D_{deal_service_id}",
        ]
        field["RESPONSIBLE_ID"] = rpa.MANAGER_OS
        task = await bx_task.create(field)
        return task.id

    async def copy_product_rows_from_base_deal(
        self, base_deal_id: int, bx_deal: BXDeal, deal_service_id: int
    ):
        product_rows = await bx_deal.get_product_rows(base_deal_id=base_deal_id)
        for row in product_rows:
            row.OWNER_ID = deal_service_id
        res = await bx_deal.set_product_rows(
            deal_service_id=deal_service_id, product_rows=product_rows
        )
        return res

    async def get_file_in_field(self, url):
        """rpa.CURRENT_CONTRACT["urlMachine"]"""
        async with httpx.AsyncClient() as client:
            response = await client.get(url)
            response.raise_for_status()  # Проверяем на наличие ошибок

            # Преобразуем содержимое файла в Base64

            if "content-disposition" in response.headers:
                content_disposition = response.headers["content-disposition"]
                match = re.search(r"filename\*=(.+?)(;|$)", content_disposition)
                if match:
                    filename_star = match.group(1).strip()
                    # Убираем префикс "utf-8''"
                    encoded_string = filename_star.split("''", 1)[1]
                    filename = urllib.parse.unquote(encoded_string)

            # Преобразуем содержимое файла в Base64
            file_content_base64 = base64.b64encode(response.content).decode("utf-8")
        return [filename, file_content_base64]

    async def get_rpa(self, domain: str, deal_id: int):
        portal = await PortalRepository().get_portal(domain=domain)
        type_id = portal.get_rpa_by_code("supply")
        bx_rpa = BXRPA(domain=domain, api_url=portal.access_key)
        stage_start = portal.get_stage_rpa_by_code(
            rpa_code="supply", stage_code="rpa_supply_new"
        )
        stage_end = portal.get_stage_rpa_by_code(
            rpa_code="supply", stage_code="rpa_supply_manager_edu"
        )
        return await bx_rpa.get_rpa_by_deal_id(
            type_id=type_id.bitrixId,
            deal_id=deal_id,
            stage_start=stage_start,
            stage_end=stage_end,
        )
