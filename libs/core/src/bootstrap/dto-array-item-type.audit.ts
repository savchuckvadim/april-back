import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';

/**
 * Аудит входных DTO на «массив объектов без @Type».
 *
 * Глобальный ValidationPipe (GLOBAL_VALIDATION_PIPE_OPTIONS) работает с
 * `enableImplicitConversion`: без `@Type` class-transformer берёт тип свойства
 * из `design:type`, у массива это `Array`, и каждый элемент-объект становится
 * `new Array()` с теми же ключами. Итог — 400 от `@IsObject({ each: true })`
 * либо молча `[[]]` после JSON.stringify (очередь, лог, ответ).
 *
 * Аудит идёт ровно так, как идут данные: от параметров `@Body/@Query/
 * @MessageBody/@Payload` контроллеров по типам свойств, повторяя правила
 * class-transformer 0.5.1 и whitelist class-validator:
 *  - тип свойства = `@Type(() => X)`, иначе `design:type` (эмитится только у
 *    свойства с хотя бы одним декоратором);
 *  - базовые классы, включая PartialType/OmitType/IntersectionType —
 *    @nestjs/mapped-types копирует design:type вместе с валидацией;
 *  - whitelist спускается во вложенный класс только через `@ValidateNested`,
 *    и в таком классе выживают лишь свойства с декораторами class-validator.
 *
 * Используется в dto-array-item-type.guard.spec.ts; не импортировать в
 * рантайм-код (тянет компилятор TypeScript).
 */

/** Декораторы, задающие тип элементов явно. */
const TYPE_PROVIDING_DECORATORS = new Set(['Type', 'IsObjectArray']);
const ENTRY_PARAM_DECORATORS = new Set([
    'Body',
    'Query',
    'MessageBody',
    'Payload',
]);

export interface DtoArrayItemTypeFinding {
    /** `путь/к/файлу.ts:строка` относительно корня. */
    location: string;
    className: string;
    property: string;
    declaredType: string;
    /** `yes` — элемент точно объект; `maybe` — any/unknown. */
    elementIsObject: 'yes' | 'maybe';
    /** Как данные доходят до свойства (до трёх маршрутов). */
    routes: string[];
}

export interface DtoArrayItemTypeAuditOptions {
    /** Корень бэка (там tsconfig.json и node_modules). */
    root: string;
    /** Каталоги для поиска *.controller.ts / *.gateway.ts. */
    scanDirs?: string[];
    /** Явный список входных файлов вместо поиска (для тестов). */
    entryFiles?: string[];
    /** Виртуальные файлы: абсолютный путь → исходник (для тестов). */
    virtualFiles?: Record<string, string>;
}

export interface DtoArrayItemTypeAuditResult {
    entryPoints: number;
    findings: DtoArrayItemTypeFinding[];
}

const SKIP_DIRS = new Set([
    'node_modules',
    'dist',
    'generated',
    '__tests__',
    'coverage',
]);

const findEntryFiles = (dirs: string[]): string[] => {
    const out: string[] = [];
    const walk = (dir: string) => {
        if (!fs.existsSync(dir)) return;
        for (const name of fs.readdirSync(dir)) {
            const full = path.join(dir, name);
            if (fs.statSync(full).isDirectory()) {
                if (!SKIP_DIRS.has(name)) walk(full);
            } else if (/\.(controller|gateway)\.ts$/.test(name)) {
                out.push(full);
            }
        }
    };
    dirs.forEach(walk);
    return out;
};

const normalize = (p: string) => path.normalize(p).toLowerCase();

export function auditDtoArrayItemTypes(
    options: DtoArrayItemTypeAuditOptions,
): DtoArrayItemTypeAuditResult {
    const { root } = options;
    const virtualFiles = new Map(
        Object.entries(options.virtualFiles ?? {}).map(([file, text]) => [
            normalize(file),
            text,
        ]),
    );
    const entryFiles =
        options.entryFiles ??
        findEntryFiles(
            (options.scanDirs ?? ['apps', 'libs']).map(d => path.join(root, d)),
        );

    const configFile = ts.readConfigFile(
        path.join(root, 'tsconfig.json'),
        ts.sys.readFile,
    );
    const parsed = ts.parseJsonConfigFileContent(
        configFile.config,
        ts.sys,
        root,
    );
    const compilerOptions: ts.CompilerOptions = {
        ...parsed.options,
        noEmit: true,
        skipLibCheck: true,
    };
    const host = ts.createCompilerHost(compilerOptions, true);
    if (virtualFiles.size) {
        const { getSourceFile, fileExists, readFile } = host;
        host.fileExists = f => virtualFiles.has(normalize(f)) || fileExists(f);
        host.readFile = f => virtualFiles.get(normalize(f)) ?? readFile(f);
        host.getSourceFile = (f, lang, onError, create) => {
            const text = virtualFiles.get(normalize(f));
            return text !== undefined
                ? ts.createSourceFile(f, text, lang, true)
                : getSourceFile(f, lang, onError, create);
        };
    }
    const program = ts.createProgram(entryFiles, compilerOptions, host);
    const checker = program.getTypeChecker();
    const entrySet = new Set(entryFiles.map(normalize));

    const decoratorsOf = (node: ts.Node): readonly ts.Decorator[] =>
        ts.canHaveDecorators(node) ? (ts.getDecorators(node) ?? []) : [];
    const calleeOf = (d: ts.Decorator): ts.Expression =>
        ts.isCallExpression(d.expression)
            ? d.expression.expression
            : d.expression;
    const decoName = (d: ts.Decorator): string => {
        const callee = calleeOf(d);
        return ts.isPropertyAccessExpression(callee)
            ? callee.name.text
            : callee.getText();
    };
    const resolveSymbol = (node: ts.Node): ts.Symbol | undefined => {
        const sym = checker.getSymbolAtLocation(node);
        return sym && sym.flags & ts.SymbolFlags.Alias
            ? checker.getAliasedSymbol(sym)
            : sym;
    };
    const isValidatorDecorator = (d: ts.Decorator): boolean => {
        const callee = calleeOf(d);
        const sym = resolveSymbol(
            ts.isPropertyAccessExpression(callee) ? callee.name : callee,
        );
        const origin = sym?.declarations?.[0]
            ?.getSourceFile()
            .fileName.replace(/\\/g, '/');
        if (origin?.includes('/class-validator/')) return true;
        if (origin?.includes('/node_modules/')) return false;
        // собственные обёртки над class-validator (IsObjectArray, IsNumberOrString…)
        return /^(Is[A-Z]|Validate|Allow$)/.test(decoName(d));
    };
    const classOfExpression = (
        expr: ts.Expression,
    ): ts.ClassDeclaration | undefined =>
        resolveSymbol(expr)?.declarations?.find(ts.isClassDeclaration);
    const classOfType = (type: ts.Type): ts.ClassDeclaration | undefined =>
        type.getSymbol()?.declarations?.find(ts.isClassDeclaration);
    /** `@Type(() => X)` → класс X, если это класс проекта. */
    const typeDecoratorTarget = (
        d: ts.Decorator,
    ): ts.ClassDeclaration | undefined => {
        if (decoName(d) !== 'Type' || !ts.isCallExpression(d.expression)) {
            return undefined;
        }
        const fn = d.expression.arguments[0];
        if (!fn || !ts.isArrowFunction(fn) || ts.isBlock(fn.body)) {
            return undefined;
        }
        return classOfExpression(fn.body);
    };

    const nonNullMembers = (type: ts.Type): ts.Type[] =>
        type.isUnion()
            ? type.types.filter(
                  t =>
                      !(t.flags & (ts.TypeFlags.Null | ts.TypeFlags.Undefined)),
              )
            : [type];
    const PRIMITIVE_FLAGS =
        ts.TypeFlags.StringLike |
        ts.TypeFlags.NumberLike |
        ts.TypeFlags.BooleanLike |
        ts.TypeFlags.EnumLike |
        ts.TypeFlags.BigIntLike |
        ts.TypeFlags.ESSymbolLike |
        ts.TypeFlags.Null |
        ts.TypeFlags.Undefined;
    const objectness = (t: ts.Type): 'yes' | 'maybe' | 'no' => {
        if (t.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) return 'maybe';
        if (t.isUnion()) {
            const parts = t.types.map(objectness);
            if (parts.includes('yes')) return 'yes';
            return parts.includes('maybe') ? 'maybe' : 'no';
        }
        if (t.flags & PRIMITIVE_FLAGS) return 'no';
        return 'yes';
    };

    const propertiesWithBases = (
        cls: ts.ClassDeclaration,
        seen = new Set<ts.ClassDeclaration>(),
    ): ts.PropertyDeclaration[] => {
        if (seen.has(cls)) return [];
        seen.add(cls);
        const own = cls.members.filter(ts.isPropertyDeclaration);
        const ext = cls.heritageClauses?.find(
            h => h.token === ts.SyntaxKind.ExtendsKeyword,
        )?.types[0];
        if (!ext) return own;
        const bases = (expr: ts.Expression): ts.ClassDeclaration[] => {
            if (ts.isCallExpression(expr)) return expr.arguments.flatMap(bases);
            const c = classOfExpression(expr);
            return c ? [c] : [];
        };
        return [
            ...own,
            ...bases(ext.expression).flatMap(b => propertiesWithBases(b, seen)),
        ];
    };

    const relative = (file: string) =>
        path.relative(root, file).replace(/\\/g, '/');
    const findings = new Map<string, DtoArrayItemTypeFinding>();
    const visited = new Set<string>();

    const visitClass = (
        cls: ts.ClassDeclaration,
        whitelisted: boolean,
        trail: string,
    ) => {
        const key = `${cls.getSourceFile().fileName}#${cls.pos}#${whitelisted}`;
        if (visited.has(key)) return;
        visited.add(key);

        for (const prop of propertiesWithBases(cls)) {
            const decorators = decoratorsOf(prop);
            // без декоратора нет design:type — class-transformer его не трогает
            if (!decorators.length) continue;
            // в «белом» классе свойство без валидатора срезается целиком
            const survives =
                !whitelisted || decorators.some(isValidatorDecorator);
            if (!survives) continue;
            const nested = decorators.some(
                d => decoName(d) === 'ValidateNested',
            );
            const propTrail = `${trail}.${prop.name.getText()}`;

            const typeDecorator = decorators.find(d =>
                TYPE_PROVIDING_DECORATORS.has(decoName(d)),
            );
            if (typeDecorator) {
                const target = typeDecoratorTarget(typeDecorator);
                if (target) visitClass(target, whitelisted && nested, propTrail);
                continue;
            }

            const members = nonNullMembers(checker.getTypeAtLocation(prop));
            const arrays = members.filter(
                t => checker.isArrayType(t) || checker.isTupleType(t),
            );
            if (arrays.length && arrays.length === members.length) {
                const element = checker.getTypeArguments(
                    arrays[0] as ts.TypeReference,
                )[0];
                const elementIsObject = element ? objectness(element) : 'maybe';
                if (elementIsObject === 'no') continue;
                const sf = prop.getSourceFile();
                const { line } = sf.getLineAndCharacterOfPosition(
                    prop.getStart(),
                );
                const location = `${relative(sf.fileName)}:${line + 1}`;
                const finding = findings.get(location) ?? {
                    location,
                    className: cls.name?.text ?? '(anonymous)',
                    property: prop.name.getText(),
                    declaredType:
                        prop.type?.getText().replace(/\s+/g, ' ') ??
                        checker.typeToString(arrays[0]),
                    elementIsObject,
                    routes: [],
                };
                if (finding.routes.length < 3) finding.routes.push(propTrail);
                findings.set(location, finding);
                continue;
            }

            if (members.length === 1) {
                const nestedClass = classOfType(members[0]);
                if (nestedClass) {
                    visitClass(nestedClass, whitelisted && nested, propTrail);
                }
            }
        }
    };

    let entryPoints = 0;
    for (const sf of program.getSourceFiles()) {
        if (!entrySet.has(normalize(sf.fileName))) continue;
        const visit = (node: ts.Node) => {
            if (ts.isMethodDeclaration(node)) {
                for (const param of node.parameters) {
                    const entry = decoratorsOf(param).find(d =>
                        ENTRY_PARAM_DECORATORS.has(decoName(d)),
                    );
                    if (!entry) continue;
                    const cls = classOfType(checker.getTypeAtLocation(param));
                    if (!cls) continue;
                    entryPoints++;
                    const owner = ts.isClassDeclaration(node.parent)
                        ? node.parent.name?.text
                        : '?';
                    visitClass(
                        cls,
                        true,
                        `${owner}.${node.name.getText()}(@${decoName(entry)} ${cls.name?.text})`,
                    );
                }
            }
            ts.forEachChild(node, visit);
        };
        visit(sf);
    }

    return { entryPoints, findings: [...findings.values()] };
}
