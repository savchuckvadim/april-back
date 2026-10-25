import { Injectable } from '@nestjs/common';
import { NameUtil } from '@lib/shared/lib/utils/name';
import { WordUtil } from '@lib/shared/lib/utils/word';
import { RqCaseKind } from '../dto/case.dto';

/**
 * Родительный падеж для полей реквизита (`director_case`, `position_case`,
 * `based_case`). Замена эндпоинта `case` легаси event-service (pymorphy2):
 * ФИО — через lvovich, слова и фразы — через russian-nouns-js.
 */
@Injectable()
export class RqCaseService {
    decline(value: string, kind: RqCaseKind = RqCaseKind.WORD): string {
        const trimmed = value.trim();
        if (!trimmed) return '';
        return kind === RqCaseKind.PERSON
            ? NameUtil.declineWord(trimmed)
            : WordUtil.declineWord(trimmed);
    }
}
