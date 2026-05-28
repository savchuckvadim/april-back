<?php

    static function getBatchListFlow(
        $hook,
        $bitrixLists,
        $eventType, // xo warm presentation, offer invoice
        $eventTypeName, //звонок по решению по оплате
        $eventAction,  // plan done //если будет репорт и при этом не было переноса придет done или nodone - типа состоялся или нет
        // $eventName,
        $deadline,
        $created,
        $responsible,
        $suresponsible,
        $companyId,
        $comment,
        $workStatus, //inJob
        $resultStatus,  // result noresult   .. without expired new !
        $noresultReason,
        $failReason,
        $failType,
        $dealIds,
        $currentBaseDealId,
        $nowDate = null,
        $hotName = null,
        $contactId,
        $resultBatchCommands // = []

    ) {
        try {



            if (empty($nowDate)) {
                date_default_timezone_set('Europe/Moscow');
                $currentNowDate = new DateTime();
                $nowDate = $currentNowDate->format('d.m.Y H:i:s');
            }

            $eventActionName = 'Запланирован';
            $evTypeName = 'Звонок';
            $nextCommunication = $deadline;
            $isUniqPresPlan = false;
            $isUniqPresReport = false;
            // Log::channel('telegram')->info('APRIL_HOOK list deadline', [
            //     'cold list result nextCommunication ' . $nextCommunication
            // ]);
            $crmValue = ['n0' => 'CO_' . $companyId];
            $dealIndex = 1;
            if (!empty($contactId)) {
                $dealIndex = 2;
                $crmValue['n1'] = 'C_' . $contactId;
            }

            if (!empty($dealIds)) {

                foreach ($dealIds as $key => $dealId) {
                    $crmValue['n' . $key + $dealIndex] = 'D_' . $dealId;
                }
            }


            if ($eventType == 'xo' || $eventType == 'cold') {
                $evTypeName = 'Холодный звонок';
            } else if ($eventType == 'warm' || $eventType == 'call' || $eventType == 'supply') {
                $evTypeName = 'Звонок';
            } else if ($eventType == 'presentation') {
                $evTypeName = 'Презентация';
                $eventActionName = 'Запланирована';
            } else if ($eventType == 'hot' || $eventType == 'inProgress' || $eventType == 'in_progress') {
                $evTypeName = 'Звонок по решению';
            } else if ($eventType == 'money' || $eventType == 'moneyAwait' || $eventType == 'money_await') {
                $evTypeName = 'Звонок по оплате';
            }






            if ($eventAction == 'expired') {
                $eventAction = 'pound';
                $eventActionName = 'Перенос';
            } else    if ($eventAction == 'done') {

                $eventActionName = 'Состоялся';
                if ($eventType == 'presentation') {
                    $eventActionName = 'Состоялась';

                    $isUniqPresReport = true;
                }
            } else    if ($eventAction == 'plan') {


                if ($eventType == 'presentation') {

                    $isUniqPresPlan = true;
                }
            } else    if ($eventAction == 'nodone') {
                $nextCommunication = null;
                $eventActionName = 'Не Состоялся';
                $eventAction = 'act_noresult_fail';


                if ($eventType == 'presentation') {
                    $eventActionName = 'Не Состоялась';
                }
                if ($workStatus['code'] === 'fail') {
                    $eventActionName .= ': Отказ';
                }
            }

            if ($eventAction  !== 'plan') {
                if ($workStatus['code'] !== 'inJob' && $workStatus['code'] !== 'setAside') {
                    $nextCommunication = null;
                }
            }
            // Log::channel('telegram')->info('HOOK TST', ['eventAction' => $eventAction]);
            if (empty($hotName)) {

                $hotName = $evTypeName . ' ' . $eventActionName;
            }

            if ($eventType == 'success') {
                $hotName = 'Продажа';
            } else   if ($eventType == 'fail') {
                $hotName = 'Отказ';
            }
            $xoFields = [
                [
                    'code' => 'event_date',
                    'name' => 'Дата',
                    'value' => $nowDate,
                ],
                // [
                //     'code' => 'name',
                //     'name' => 'Название',
                //     'value' => $evTypeName . ' ' . $eventActionName
                // ],
                [
                    'code' => 'event_title',
                    'name' => 'Название',
                    'value' => $hotName
                ],
                [
                    'code' => 'plan_date',
                    'name' => 'Дата Следующей коммуникации',
                    'value' => $nextCommunication
                ],
                [
                    'code' => 'author',
                    'name' => 'Автор',
                    'value' => $created,
                ],
                [
                    'code' => 'responsible',
                    'name' => 'Ответственный',
                    'value' => $responsible,
                ],
                [
                    'code' => 'su',
                    'name' => 'Соисполнитель',
                    'value' => $suresponsible,
                ],
                [
                    'code' => 'crm',
                    'name' => 'crm',
                    'value' => $crmValue
                ],
                [
                    'code' => 'crm_company',
                    'name' => 'crm_company',
                    'value' => ['n0' => 'CO_' . $companyId],
                ],


                [
                    'code' => 'manager_comment',
                    'name' => 'Комментарий',
                    'value' => $comment,
                ],
                [
                    'code' => 'event_type',
                    'name' => 'Тип События',
                    'list' =>  [
                        'code'  => BitrixListFlowService::getEventType(
                            $eventType
                        ),
                        'name' => $eventTypeName,

                    ],
                ],
                [
                    'code' => 'event_action',
                    'name' => 'Событие Действие',
                    'list' =>  [
                        'code' => $eventAction,
                        // 'name' => $eventActionName //Запланирован/на
                    ],
                ],

                [
                    'code' => 'op_work_status',
                    'name' => 'Статус Работы',
                    'list' =>  [
                        'code' => BitrixListFlowService::getCurrentWorkStatusCode(
                            $workStatus,
                            $eventType
                        ),  //'in_work',
                        // 'name' =>  'В работе' //'В работе'
                    ],
                ],
                [
                    'code' => 'op_result_status',
                    'name' => 'Результативность',
                    'list' =>  [
                        'code' => BitrixListFlowService::getResultStatus(
                            $resultStatus,
                        ),  //'in_work',
                        // 'name' =>  'В работе' //'В работе'
                    ],
                ],


            ];
            if (!empty($contactId)) {

                $contact =  [
                    'code' => 'crm_contact',
                    'name' => 'crm_contact',
                    'value' => ['n0' => 'C_' . $contactId],
                ];
                array_push($xoFields, $contact);
            }
            if ($resultStatus !== 'result' && $resultStatus !== 'new') {
                if (!empty($noresultReason)) {
                    if (!empty($noresultReason['code'])) {
                        $noresultReasoneItem = [
                            'code' => 'op_noresult_reason',
                            'name' => 'Тип Нерезультативности',
                            'list' =>  [
                                'code' => $noresultReason['code'],
                                // 'name' =>  'В работе' //'В работе'
                            ],
                        ];
                        array_push($xoFields, $noresultReasoneItem);
                    }
                }
            } else {
                $noresultReasoneItem = [
                    'code' => 'op_noresult_reason',
                    'name' => 'Тип Нерезультативности',
                    'list' =>  [
                        'code' => null,
                        // 'name' =>  'В работе' //'В работе'
                    ],
                ];
                array_push($xoFields, $noresultReasoneItem);
            }
            if (!empty($workStatus)) {
                if (!empty($workStatus['code'])) {
                    $workStatusCode = $workStatus['code'];


                    if ($workStatusCode === 'fail') {  //если провал
                        if (!empty($failType)) {
                            if (!empty($failType['code'])) {
                                $failTypeItemItem = [
                                    'code' => 'op_prospects_type',
                                    'name' => 'Перспективность',
                                    'list' =>  [
                                        'code' => BitrixListFlowService::getPerspectStatus(
                                            $failType['code']
                                        ),
                                    ],
                                ];
                                array_push($xoFields, $failTypeItemItem);



                                if ($failType['code'] == 'failure') { //если тип провала - отказ
                                    if (!empty($failReason)) {
                                        if (!empty($failReason['code'])) {
                                            $failReasonItem = [
                                                'code' => 'op_fail_reason',
                                                'name' => 'ОП Причина Отказа',
                                                'list' =>  [
                                                    'code' => BitrixListFlowService::getFailType(
                                                        $failReason['code']
                                                    ),
                                                ],
                                            ];
                                            array_push($xoFields, $failReasonItem);
                                        }
                                    }
                                }
                            }
                        }
                    } else {

                        // если не отказ - перспективная
                        $failTypeItemItem = [
                            'code' => 'op_prospects_type',
                            'name' => 'Перспективность',
                            'list' =>  [
                                'code' => 'op_prospects_good',
                                // 'name' =>  'В работе' //'В работе'
                            ],
                        ];
                        array_push($xoFields, $failTypeItemItem);
                    }
                }
            }
            $fieldsData = [
                'NAME' => $hotName
            ];

            foreach ($bitrixLists as $bitrixList) {
                if ($bitrixList['type'] === 'kpi' || $bitrixList['type'] === 'history') {
                    if ($bitrixList['group'] === 'sales') {
                        foreach ($xoFields as $xoValue) {
                            $currentDataField = [];
                            $fieldCode = $bitrixList['group'] . '_' . $bitrixList['type'] . '_' . $xoValue['code'];
                            $btxId = BitrixListFlowService::getBtxListCurrentData($bitrixList, $fieldCode, null);
                            if (!empty($xoValue)) {



                                if (!empty($xoValue['value'])) {
                                    $fieldsData[$btxId] = $xoValue['value'];
                                    $currentDataField[$btxId] = $xoValue['value'];
                                }

                                if (!empty($xoValue['list'])) {
                                    $btxItemId = BitrixListFlowService::getBtxListCurrentData($bitrixList, $fieldCode, $xoValue['list']['code']);
                                    $currentDataField[$btxId] = [

                                        $btxItemId =>  $xoValue['list']['code']
                                    ];

                                    $fieldsData[$btxId] =  $btxItemId;
                                }
                            }
                            // array_push($fieldsData, $currentDataField);
                        }
                        $uniqueHash = md5(uniqid(rand(), true));
                        $code = $uniqueHash;
                        $uniqueSecondHash = md5(uniqid(rand(), true));
                        $fullCode = $bitrixList['type'] . '_' . $companyId . '_' . $code;
                        $command =  BitrixListService::getBatchCommandSetItem(
                            $hook,
                            $bitrixList['bitrixId'],
                            $fieldsData,
                            $fullCode
                        );
                        $resultBatchCommands['set_list_item_' . $fullCode] = $command;
                    }
                }
            }



            //for uniq pres
            if ($resultStatus === 'result' || $resultStatus === 'new') {

                if ($isUniqPresPlan || $isUniqPresReport) {
                    $xoFields[9]['list']['code'] = 'presentation_uniq';

                    if ($isUniqPresPlan) {

                        $code = $companyId . '_' . $currentBaseDealId . '_plan';
                    }

                    if ($isUniqPresReport) {
                        $code = $companyId . '_' . $currentBaseDealId . '_done';

                        if ($responsible !== $suresponsible) { // значит ответственный - ТМЦ и на него надо сделать отдельный уникальный запись об отчете
                            $code = $companyId . '_' . $currentBaseDealId . '_done_' . $responsible;
                        }
                    }

                    foreach ($bitrixLists as $bitrixList) {
                        if ($bitrixList['type'] === 'kpi' && $bitrixList['group'] === 'sales') {

                            foreach ($xoFields as $xoValue) {
                                $currentDataField = [];
                                $fieldCode = $bitrixList['group'] . '_' . $bitrixList['type'] . '_' . $xoValue['code'];
                                $btxId = BitrixListFlowService::getBtxListCurrentData($bitrixList, $fieldCode, null);
                                if (!empty($xoValue)) {



                                    if (!empty($xoValue['value'])) {
                                        $fieldsData[$btxId] = $xoValue['value'];
                                        $currentDataField[$btxId] = $xoValue['value'];
                                    }

                                    if (!empty($xoValue['list'])) {
                                        $btxItemId = BitrixListFlowService::getBtxListCurrentData($bitrixList, $fieldCode, $xoValue['list']['code']);
                                        $currentDataField[$btxId] = [

                                            $btxItemId =>  $xoValue['list']['code']
                                        ];

                                        $fieldsData[$btxId] =  $btxItemId;
                                    }
                                }
                                // array_push($fieldsData, $currentDataField);
                            }


                            $command =  BitrixListService::getBatchCommandSetItem(
                                $hook,
                                $bitrixList['bitrixId'],
                                $fieldsData,
                                $code
                            );
                            $resultBatchCommands['set_list_item_' . $code] = $command;
                            // print_r("<br>");
                            // print_r("<resultBatchCommands bxlflowservice>");
                            // print_r("<br>");
                            // print_r($resultBatchCommands);
                        }
                    }
                }



                //for presentation_contact_uniq
                if (!empty($contactId)) {
                    if ($isUniqPresPlan || $isUniqPresReport) {
                        $xoFields[9]['list']['code'] = 'presentation_contact_uniq';

                        if ($isUniqPresPlan) {

                            $code = $companyId . '_' . $currentBaseDealId . '_ ' . $contactId . '_plan';
                        }

                        if ($isUniqPresReport) {
                            $code = $companyId . '_' . $currentBaseDealId .  '_ ' . $contactId . '_done';

                            if ($responsible !== $suresponsible) { // значит ответственный - ТМЦ и на него надо сделать отдельный уникальный запись об отчете
                                $code = $companyId . '_' . $currentBaseDealId .  '_ ' . $contactId . '_done_' . $responsible;
                            }
                        }

                        foreach ($bitrixLists as $bitrixList) {
                            if ($bitrixList['type'] === 'kpi' && $bitrixList['group'] === 'sales') {

                                foreach ($xoFields as $xoValue) {
                                    $currentDataField = [];
                                    $fieldCode = $bitrixList['group'] . '_' . $bitrixList['type'] . '_' . $xoValue['code'];
                                    $btxId = BitrixListFlowService::getBtxListCurrentData($bitrixList, $fieldCode, null);
                                    if (!empty($xoValue)) {



                                        if (!empty($xoValue['value'])) {
                                            $fieldsData[$btxId] = $xoValue['value'];
                                            $currentDataField[$btxId] = $xoValue['value'];
                                        }

                                        if (!empty($xoValue['list'])) {
                                            $btxItemId = BitrixListFlowService::getBtxListCurrentData($bitrixList, $fieldCode, $xoValue['list']['code']);
                                            $currentDataField[$btxId] = [

                                                $btxItemId =>  $xoValue['list']['code']
                                            ];

                                            $fieldsData[$btxId] =  $btxItemId;
                                        }
                                    }
                                    // array_push($fieldsData, $currentDataField);
                                }


                                $command =  BitrixListService::getBatchCommandSetItem(
                                    $hook,
                                    $bitrixList['bitrixId'],
                                    $fieldsData,
                                    $code
                                );
                                $resultBatchCommands['set_list_item_' . $code] = $command;
                                // print_r("<br>");
                                // print_r("<resultBatchCommands bxlflowservice>");
                                // print_r("<br>");
                                // print_r($resultBatchCommands);
                            }
                        }
                    }
                }
            }

            return $resultBatchCommands;
        } catch (\Throwable $th) {
            $errorMessages =  [
                'message'   => $th->getMessage(),
                'file'      => $th->getFile(),
                'line'      => $th->getLine(),
                'trace'     => $th->getTraceAsString(),
            ];
            Log::error('ERROR COLD: getListsFlow',  $errorMessages);

            Log::channel('telegram')->error('APRIL_HOOK getListsFlow', $errorMessages);
        }


/**
 * Использование
 */


        $batchCommands = BitrixListFlowService::getBatchListFlow(  //report - отчет по текущему событию
            $this->hook,
            $this->bitrixLists,
            'xo',
            'Холодный обзвон',
            'plan',
            // $this->stringType,
            $planDeadline,
            $this->createdId,
            $this->responsibleId,
            $this->responsibleId,
            $this->entityId,
            'Холодный обзвон ' . $this->name,
            $workStatus,
            'result', // result noresult expired,
            null,
            null,
            null,
            $planDeals,
            null,  //current base deal id for uniq pres count
            null, // $nowDate, // $date,
            null, // /$hotName
            null, //$contactId,
            $batchCommands
        );
