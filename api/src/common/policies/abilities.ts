import { Ability, AbilityBuilder } from "@casl/ability";
import {
  accessibleBy,
  createPrismaAbility,
  type PrismaModel,
  type PrismaQueryOf,
  type Subjects,
} from "@casl/prisma/runtime";
import { Injectable } from "@nestjs/common";
import type { AuditLog, Branch, Course, EnrollmentRequest, Group, Prisma, User } from "../../../generated/prisma";
import type { SessionUser } from "../auth/session-user";

// Все права api описываются здесь. Условия пишутся синтаксисом Prisma where:
// той же записью CASL проверяет объект в памяти, а accessibleBy превращает её в
// фильтр выборки. Поэтому ручного `if (role === "STUDENT")` в сервисах нет, и
// роль, для которой правило не написано (как PARENT в аудите 2.4), ничего не
// получает.
//
// Клиент Prisma лежит не в @prisma/client, а в api/generated/prisma, поэтому
// CASL подключается через @casl/prisma/runtime с типами этого клиента.
// Модели добавляются в AppSubjects по мере переноса модулей.

export type Action = "manage" | "create" | "read" | "update" | "delete";

export type AppSubjects =
  | "all"
  // Виртуальные субъекты: отчёт и справочник — не таблицы, но права на них
  // описываются так же, как на модели, и проверка маршрута остаётся однородной.
  // UserDirectory — доступ к списку людей вообще, отдельно от права видеть
  // конкретного человека (свой профиль есть у всех).
  | "HomeworkStatistics"
  | "UserDirectory"
  // Деньги: начисления, долги, оплаты — только администратор
  | "Billing"
  // Зарплата преподавателей: администратор — всё, преподаватель — только
  // свою (сужение по teacherId делает сервис, как TeacherAttendanceService)
  | "Salary"
  // Каталог самозаписи — ученику; заявки подтверждает персонал; Корзина — администратор
  | "Catalog"
  | "Trash"
  // Вести занятия, смотреть отчёт по преподавателям, править связи «родитель —
  // ученик». Объектные проверки (чьё занятие, чей ребёнок) делают сервисы.
  // Черновики: неопубликованные уроки, тесты и задания. Право есть у персонала,
  // и именно оно заменило проверку `role === "STUDENT"`, из-за которой
  // черновики доставались роли PARENT (аудит 2.4).
  | "UnpublishedContent"
  // Правильные ответы в тестах. Отдельно от чтения теста: ученик видит вопросы,
  // но не ключи.
  | "AssessmentAnswers"
  | "Attendance"
  | "TeacherAttendance"
  | "ParentLink"
  | Subjects<{
      User: User;
      AuditLog: AuditLog;
      Course: Course;
      EnrollmentRequest: EnrollmentRequest;
      Group: Group;
      Branch: Branch;
    }>;

export type PrismaQuery<T extends PrismaModel = PrismaModel> = PrismaQueryOf<Prisma.TypeMap, T>;

export type AppAbility = Ability<[Action, AppSubjects], PrismaQuery>;

export { accessibleBy };

export function defineAbilityFor(user: Pick<SessionUser, "id" | "role">): AppAbility {
  const { can, build } = new AbilityBuilder<AppAbility>(createPrismaAbility);

  switch (user.role) {
    case "ADMIN":
      can("manage", "all");
      break;

    case "TEACHER":
      // Ученики целиком (преподаватели подменяют друг друга — решение владельца
      // от 2026-09-16) и свой профиль
      can("read", "User", { role: "STUDENT" });
      can("read", "User", { id: user.id });
      can("read", "UserDirectory");
      can("read", "HomeworkStatistics");
      // Чужой курс преподаватель может открыть (подмены), но менять и удалять —
      // только свои. Решение владельца от 2026-09-16.
      can("read", "Course");
      can("manage", "Course", { teacherId: user.id });
      // Заявки на свои курсы: список сужает сервис, право — общее
      can("update", "EnrollmentRequest");
      // Группы: смотреть можно любые (подмены), менять — только в своих курсах
      can("read", "Group");
      can("manage", "Group", { course: { is: { teacherId: user.id } } });
      // Занятия ведёт педагог курса, педагог группы или записанный заменяющий —
      // это решает canManageSession в модуле посещаемости
      can("manage", "Attendance");
      can("read", "TeacherAttendance");
      // Черновики и ключи к тестам — часть работы преподавателя
      can("read", "UnpublishedContent");
      can("read", "AssessmentAnswers");
      // Справочник филиалов: нужен, чтобы показать название филиала группы
      can("read", "Branch");
      // Своя зарплата — сумма чужих начислений и составов групп ему не
      // видна: сервис сужает GET /salary/:teacherId и /salary/me до себя
      can("read", "Salary");
      break;

    case "STUDENT":
      can("read", "User", { id: user.id });
      // Опубликованный курс, на который записан. Отчисленный (unenrolledAt)
      // доступ теряет — запись жива только ради истории начислений;
      // приостановленный (billingEndsAt есть, unenrolledAt нет) курс не
      // теряет — пауза останавливает только начисления, не доступ.
      can("read", "Course", {
        isPublished: true,
        enrollments: { some: { studentId: user.id, unenrolledAt: null } },
      });
      // Каталог и заявка на курс — только ученику
      can("read", "Catalog");
      can("create", "EnrollmentRequest");
      can("read", "Branch");
      break;

    case "PARENT":
      // Только свой профиль. Права на данные детей появятся на этапе 3c.
      can("read", "User", { id: user.id });
      break;
  }

  return build();
}

/**
 * Условие выборки по правам, пригодное для подстановки в AND.
 *
 * Прямо accessibleBy() внутрь AND класть нельзя: когда правил на модель нет,
 * он возвращает { OR: [] }, а Prisma игнорирует пустой OR внутри AND — запрос
 * молча отдаёт ВСЕ строки вместо ни одной. Проверено на настоящей базе.
 * Поэтому пустые права заменяются заведомо невыполнимым условием.
 */
/**
 * Тип условия задаёт вызывающий: Prisma.CourseWhereInput и подобные. Выводить
 * его из имени модели здесь нельзя — объединение по всем моделям слишком
 * большое, и TypeScript отказывается его считать.
 */
export function accessibleWhere<TWhere>(
  ability: AppAbility,
  subject: Extract<AppSubjects, string>,
  action: Action = "read"
): TWhere {
  const where = accessibleBy(ability, action).ofType(subject as never) as TWhere & { OR?: unknown[] };
  const hasNoRules = Array.isArray(where.OR) && where.OR.length === 0;
  return hasNoRules ? ({ id: { in: [] } } as TWhere) : where;
}

@Injectable()
export class AbilityFactory {
  createForUser(user: Pick<SessionUser, "id" | "role">): AppAbility {
    return defineAbilityFor(user);
  }
}
