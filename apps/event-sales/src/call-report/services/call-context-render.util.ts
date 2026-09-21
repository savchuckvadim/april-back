import {
    renderOwnOrgNamesBlock,
    renderOwnOrgNamesHint,
} from '../contracts/own-org-names.contract';
import type { CallPassport } from './call-context-builder.service';
import { renderCallTypePrior } from './call-type-prior.util';

/**
 * Текстовые представления паспорта звонка (слой 0) для промптов — чистые
 * функции без DI: user-часть глубокого разбора и короткая CRM-подсказка
 * классификатору. Сборка самого паспорта — в CallContextBuilderService,
 * здесь только рендер.
 */

const trim = (value: string, max: number): string =>
    value.length > max ? `${value.slice(0, max)}…` : value;

/** Текстовый блок паспорта для user-части промпта разбора. */
export function renderPassportForPrompt(passport: CallPassport): string {
    const lines: string[] = ['', 'КОНТЕКСТ ИЗ CRM (паспорт звонка):'];
    if (passport.certainty === 'rich') {
        lines.push(
            `- Звонок по СДЕЛКЕ #${passport.entityId}, стадия ${passport.stageId ?? '—'}` +
                (passport.categoryId
                    ? `, воронка ${passport.categoryId}`
                    : '') +
                '. Этап переговоров известен ДОСТОВЕРНО — оценивай уместность разделов относительно него.',
        );
    } else if (passport.certainty === 'lead') {
        lines.push(
            `- Звонок по ЛИДУ #${passport.entityId}, статус ${passport.leadStatusId ?? '—'}. ` +
                'Стадии переговоров нет — этап определяй по содержанию разговора, уместность оценивай мягко.',
        );
        if (passport.leadWorkKind === 'request') {
            lines.push(
                '- Лид создан ВХОДЯЩЕЙ ЗАЯВКОЙ (клиент сам оставил контакты на сайте: прайс, демо-доступ, документ, семинар). ' +
                    'Клиент ждёт звонка, но может оказаться не-ЦА — оценивай по регламенту заявок: легализация, фильтр ЦА, предложение зайти в систему.',
            );
        } else if (passport.leadWorkKind === 'lead') {
            lines.push(
                '- Лид создан ВХОДЯЩИМ ОБРАЩЕНИЕМ клиента (звонок/письмо/чат) — это не холодный выход менеджера.',
            );
        }
    } else {
        lines.push(
            '- CRM-контекст НЕИЗВЕСТЕН (сырой лид или звонок без привязки). ' +
                'ВАЖНО: это может быть действующий клиент с незнакомого номера — ' +
                'этап определяй только по содержанию разговора и НЕ штрафуй за «неуместность» этапов.',
        );
    }
    const persona: string[] = [];
    if (passport.contactName) persona.push(passport.contactName);
    if (passport.contactPosition) {
        persona.push(`должность «${passport.contactPosition}»`);
    }
    if (persona.length) {
        lines.push(
            `- Собеседник по данным CRM: ${persona.join(', ')}. ` +
                'Подсказка для специализации показа (бухгалтер/юрист/кадровик) и восстановления искажённых распознаванием имён; лексика разговора важнее.',
        );
    }
    if (passport.crmNotes) {
        lines.push(
            `- Заметки менеджера из CRM: «${passport.crmNotes}». Фон для разбора; могут быть устаревшими.`,
        );
    }
    if (passport.companyTitle) {
        lines.push(
            `- Компания клиента по данным CRM: «${passport.companyTitle}». ` +
                'Используй для восстановления искажённого распознаванием названия.',
        );
    }
    if (passport.companyNotes) {
        lines.push(
            `- Заметки менеджера о компании: «${passport.companyNotes}». Могут быть устаревшими.`,
        );
    }
    if (passport.opHistory.length) {
        lines.push(
            '- «ОП История» из CRM — последние записи менеджера о касаниях клиента:',
        );
        for (const entry of passport.opHistory) {
            lines.push(`  • ${entry}`);
        }
        lines.push(
            '  Сверь разговор с этими записями: прошлые договорённости и обещания — фон для оценки; записи могут быть неполными.',
        );
    }
    if (passport.direction) {
        lines.push(
            passport.direction === 'outgoing'
                ? '- Звонок ИСХОДЯЩИЙ: инициатор — менеджер. Приветствие оценивай как вход менеджера: представление, цель звонка в первые секунды, опора на прошлую договорённость.'
                : '- Звонок ВХОДЯЩИЙ (редкий случай): оценивай скорость включения менеджера в запрос клиента.',
        );
    }
    if (passport.identity.length) {
        const found = passport.identity
            .map(item => `${item.entityType} #${item.entityId}`)
            .join(', ');
        lines.push(
            `- По номеру телефона ПРЕДПОЛОЖИТЕЛЬНО найдены: ${found}. Это догадка (suspected), не факт — не выдавай её за установленную связь.`,
        );
    }
    if (passport.history.length) {
        lines.push('- История прошлых звонков этой сущности (новые первыми):');
        for (const item of passport.history) {
            const date = item.startedAt
                ? new Date(item.startedAt).toLocaleDateString('ru-RU')
                : 'дата неизвестна';
            lines.push(
                `  • [${date}] ${trim(item.resume ?? 'резюме отсутствует', 400)}`,
            );
        }
        lines.push(
            '  Сверь этот разговор с историей: невыполненные обещания и потерянные договорённости — обязательный флаг в разборе.',
        );
    }
    // Названия наших организаций — отдельным блоком в конце: это не факт о
    // клиенте, а правило разбора (представление своим именем — норма,
    // снижать за это оценку нельзя). Список пуст — блока нет.
    return lines.join('\n') + renderOwnOrgNamesBlock(passport.ownOrgNames);
}

/**
 * Короткая CRM-подсказка для дешёвого классификатора типа звонка: только
 * факты, влияющие на выбор типа (заявка/обращение/сделка). null —
 * подсказать нечего, инструкция классификатора не меняется.
 */
export function renderPassportClassifyHint(
    passport: CallPassport,
): string | null {
    const facts: string[] = [];
    if (passport.leadWorkKind === 'request') {
        facts.push(
            'звонок идёт по лиду, созданному ВХОДЯЩЕЙ ЗАЯВКОЙ с сайта ' +
                '(клиент сам оставил контакты) — если менеджер ссылается ' +
                "на заявку/оставленные контакты, это тип 'site_lead'",
        );
    } else if (passport.leadWorkKind === 'lead') {
        facts.push(
            'звонок идёт по лиду из входящего обращения клиента ' +
                '(звонок/письмо/чат) — это НЕ холодный выход менеджера',
        );
    }
    if (passport.certainty === 'rich') {
        facts.push(
            'звонок привязан к сделке — переговоры уже идут, первый ' +
                'холодный контакт маловероятен',
        );
    }
    // Наши собственные названия: без них классификатор читает реплику
    // «вас беспокоит Альфа-центр» как разговор о чужой организации.
    const ownOrgHint = renderOwnOrgNamesHint(passport.ownOrgNames);
    if (ownOrgHint) facts.push(ownOrgHint);
    // Приор по стадии/лиду — отдельным блоком: он называет ожидаемый тип
    // прямо, тогда как факты выше лишь сужают выбор.
    const prior = renderCallTypePrior(passport.callTypePrior);
    if (!facts.length) return prior || null;
    return (
        `\n\nКОНТЕКСТ ИЗ CRM (подсказка, не приговор — решает содержание разговора):\n- ${facts.join('\n- ')}` +
        prior
    );
}
