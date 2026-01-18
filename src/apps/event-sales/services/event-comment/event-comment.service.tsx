import { EnumWorkStatusCode, EnumEventItemResultType } from "../../types/report-types";
import dayjs from 'dayjs';
import 'dayjs/locale/ru';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import localizedFormat from 'dayjs/plugin/localizedFormat';

dayjs.extend(customParseFormat);
dayjs.extend(localizedFormat);
dayjs.locale('ru');

export interface IGetComment {
    deadline: string;
    comment: string;
    currentPlanEventTypeName: 'Звонок' | 'Презентация' | 'Холодный звонок' | 'Звонок по решению' | 'Звонок по оплате' | 'Перенесен';
    currentReportEventName?: string;
    isPlanned: boolean;
    isNoCall: boolean;
    isExpired: boolean;
    resultStatus?: EnumEventItemResultType;
    workStatus?: EnumWorkStatusCode;
}
export class EventCommentService {
    constructor(

    ) { }

    async getComment(data: IGetComment): Promise<string> {
        const {
            deadline,
            comment,
            currentPlanEventTypeName,
            currentReportEventName,
            isPlanned,
            isNoCall,
            isExpired,
            resultStatus,
            workStatus
        } = data;


        let planComment = '';
        let planEventTypeName = this.removeEmojisIntl(currentPlanEventTypeName);

        let formattedDate = '  ';
        if (deadline) {
            // Parse date from format 'DD.MM.YYYY HH:mm:ss' and format in Russian locale: "1 ноября 12:30"
            const parsedDate = dayjs(deadline, 'DD.MM.YYYY HH:mm:ss', true);
            if (parsedDate.isValid()) {
                formattedDate = parsedDate.format('D MMMM HH:mm');
            }
        }

        if (isPlanned && !isNoCall) {
            if (!isExpired) {
                // если не перенос, то отчитываемся по прошедшему событию
                planComment = 'Запланирован';
                if (this.removeEmojisIntl(currentPlanEventTypeName) === 'Презентация') {
                    planComment = 'Запланирована';
                }
            } else {
                // не состоялся и двигается крайний срок
                planComment = 'Перенесен';
                if (currentReportEventName) {
                    planEventTypeName = currentReportEventName;
                }

                if (currentReportEventName === 'Презентация') {
                    planComment = 'Перенесена';
                }
            }
            planComment = `${planComment} ${planEventTypeName} на ${formattedDate}`;
        } else {
            let reportComment = 'Состоялся';
            if (resultStatus && resultStatus !== EnumEventItemResultType.RESULT) {
                reportComment = 'Не состоялся';
            }

            if (currentReportEventName) {
                if (currentReportEventName === 'Презентация') {
                    if (reportComment === 'Состоялся') {
                        reportComment = 'Состоялась';
                    } else if (reportComment === 'Не состоялся') {
                        reportComment = 'Не состоялась';
                    }
                }
                planComment = `${reportComment} ${currentReportEventName}`;
            } else {
                planComment = reportComment;
            }
        }

        if (workStatus) {
            if (workStatus === EnumWorkStatusCode.fail) {
                // если провал
                planComment = `ОП ОТКАЗ ${planComment}\n${comment}`;
            } else {
                planComment = `ОП ${planComment}\n${comment}`;
            }
        }

        return planComment;
    }



    protected removeEmojisIntl(string: string): string {
        if (!string) return string;

        // Comprehensive emoji removal regex covering all major Unicode emoji ranges
        // This includes:
        // - Symbols & Pictographs (1F000-1FAFF) - covers all pictographs including extended ranges
        // - Miscellaneous Symbols (2600-26FF)
        // - Flags (1F1E6-1F1FF)
        // - Skin tone modifiers (1F3FB-1F3FF)
        // - Variation selector-16 (FE0F) - makes emojis colorful
        // - Zero-width joiner (200D) - used in compound emojis
        // - Dingbats (2700-27BF)
        // - Enclosed characters (24C2-1F251)

        return string
            .replace(
                /[\u{1F000}-\u{1FAFF}\u{2600}-\u{26FF}\u{1F1E6}-\u{1F1FF}\u{1F3FB}-\u{1F3FF}\u{FE0F}\u{200D}\u{2700}-\u{27BF}\u{24C2}-\u{1F251}]/gu,
                '',
            )
            .trim();
    }


}
