import { RqCaseService } from '../services/rq-case.service';
import { RqCaseKind, RqGrammaticalCase } from '../dto/case.dto';

describe('RqCaseService: падежи для реквизитов и КП', () => {
    const service = new RqCaseService();
    const { PERSON, WORD } = RqCaseKind;
    const { GENITIVE, DATIVE } = RqGrammaticalCase;

    it('ФИО: родительный по умолчанию, дательный для адресата КП, женское — по отчеству', () => {
        expect(service.decline('Иванов Иван Иванович', PERSON)).toBe('Иванова Ивана Ивановича');
        expect(service.decline('Иванов Иван Иванович', PERSON, DATIVE)).toBe('Иванову Ивану Ивановичу');
        expect(service.decline('Петрова Анна Сергеевна', PERSON, DATIVE)).toBe('Петровой Анне Сергеевне');
    });

    it('должность: склоняется главная часть, хвост остаётся', () => {
        expect(service.decline('Генеральный директор', WORD, DATIVE)).toBe('Генеральному директору');
        expect(service.decline('Главный бухгалтер', WORD, GENITIVE)).toBe('Главного бухгалтера');
        expect(service.decline('Заместитель генерального директора', WORD, DATIVE)).toBe(
            'Заместителю генерального директора',
        );
        expect(service.decline('Директор по развитию', WORD, DATIVE)).toBe('Директору по развитию');
        expect(service.decline('Директор', WORD)).toBe('Директора');
    });

    it('сокращение в начале и пустое значение — как есть', () => {
        expect(service.decline('Ген. директор', WORD, DATIVE)).toBe('Ген. директор');
        expect(service.decline('  ', PERSON, DATIVE)).toBe('');
    });
});
