# План: остаток зарплаты с прошлых месяцев отдельной колонкой (2026-11-06)

## Зачем (голосовое клиентки, 2026-11-06)

> «Зарплату учителей сайт считает прошлый месяц и этот вместе, одной суммой.
> Прошу в табеле остаток октября показать отдельно».

Сейчас в таблице «Ish haqi» (`/salaries?month=M`) и на странице учителя
(`/salaries/[teacherId]?month=M`) столбцы относятся к разным периодам:

| Поле API | Что значит сейчас |
|---|---|
| `accrued` | начислено **за месяц M** (группы + премии/штрафы M) |
| `paidTotal` | выплачено **по M включительно** (накопительно, по `payoutMonth`) |
| `accruedTotal` | начислено **по M включительно** (накопительно) |
| `debt` | `accruedTotal − paidTotal` — накопительный долг центра |

Пример, Uktambayeva Ms.Iroda, ноябрь 2026: «Hisoblangan» 2 719 200 (ноябрь),
«To'langan» 2 394 000 (фактически октябрь), «Qarz» 2 907 969 = остаток
октября 188 769 + ноябрь 2 719 200. Остатка октября на экране нет.

## Решение владельца

Показать раскладку «остаток с прошлых месяцев → начислено за M → выплачено за M →
итоговый долг». Итоговый долг не меняется, меняется только раскладка.

## Правило (одно на API, таблицу, страницу учителя и кабинет учителя)

Для преподавателя T и месяца M:

```
carriedOver = Σ начислений месяцев < M (группы + премии − штрафы)
            − Σ выплат, у которых payoutMonth < M
accrued     = начислено за M (как сейчас)
paidMonth   = Σ выплат, у которых payoutMonth = M
debt        = carriedOver + accrued − paidMonth     (= нынешний accruedTotal − paidTotal)
```

- `payoutMonth(p) = p.forMonth ?? monthKey(p.paidAt)` — уже есть в `domain/salary.ts`.
- Выплаты за будущие месяцы (`payoutMonth > M`) в M не участвуют (как сейчас).
- `carriedOver` может быть отрицательным: учителю переплатили (аванс). Показываем со
  знаком, отрицательный — зелёным с подписью «аванс»/«ortiqcha to'langan».
- Фильтр филиала в обзоре действует на выплаты так же, как сейчас (`branchId` выплаты).

Важно для администратора: выплачивая долг за октябрь, в окне «To'lash» в поле
«Oy uchun» выбирать **октябрь** — тогда уменьшается остаток. Окно и сейчас
подставляет открытый на странице месяц; поведение не меняем, но подсказку под
полем добавляем (см. web, п. 4).

## Работа

### api (`api/src/modules/salary/`)

1. `domain/salary.ts` — чистая функция
   `splitTeacherBalance({ accruedByMonth, adjustments, payouts }, month)` →
   `{ carriedOver, accrued, paidMonth, paidTotal, accruedTotal, debt }`; либо
   эквивалент из уже имеющихся `totalAccrued` / `sumAdjustments` / `payoutMonth`.
   Unit-тесты в `domain/salary.spec.ts`: пустая история; долг октября + ноябрь;
   выплата за октябрь, сделанная в ноябре (`forMonth=2026-10`) уменьшает
   `carriedOver`; выплата без `forMonth` по `paidAt`; переплата (отрицательный
   остаток); выплата за будущий месяц не учитывается; премия/штраф прошлого
   месяца попадает в `carriedOver`, текущего — в `accrued`.
2. `salary.service.ts`, `overview` — в строке добавить `carriedOver`, `paidMonth`;
   в `totals` — `carriedOver`, `paidMonth`. Старые `paidTotal`, `accruedTotal`,
   `debt` оставить (ими пользуются дашборд и финансы — проверить grep’ом
   `paidTotal|accruedTotal` по api и web).
3. `salary.service.ts`, `teacherDetail` (и `/salary/me`, он через тот же код) —
   добавить `carriedOver`, `accruedMonth` (группы + корректировки только за M),
   `paidMonth`.
4. e2e `api/test/salary.e2e-spec.ts`: учитель с начислением в прошлом месяце и
   частичной выплатой → в текущем месяце `carriedOver` = остаток, `paidMonth` = 0,
   `debt` прежний; выплата `forMonth` = прошлый месяц уменьшает `carriedOver`;
   выплата `forMonth` = текущий — `paidMonth`.

### web

1. `src/lib/api/salary.ts` — типы `ApiSalaryOverviewRow`, totals, `ApiTeacherSalary`.
2. `salaries/salaries-list.tsx` (таблица «Ish haqi»): столбцы
   … | Baza | **O'tgan oylardan qoldiq** | Hisoblangan | Markaz foydasi | % |
   Mukofot / jarima | **To'langan (M uchun)** | **Jami qarz**.
   Карточки сверху: «Oy uchun hisoblangan», **«O'tgan oylardan qoldiq»**,
   **«Shu oy uchun to'langan»**, «Markaz qarzi (jami)», «Markaz foydasi».
3. `salaries/[teacherId]/teacher-salary-view.tsx` и `salaries/me/my-salary-view.tsx`:
   карточки «{prev} gacha qoldiq» → «{M} hisoblangan» → «{M} uchun to'langan» →
   «Jami qarz». Подписи — через месяц из выбора, не через слово «октябрь».
   `AccruedBreakdown` (раскрытие «группы + премии») — не ломать.
4. `create-payout-dialog.tsx` — под полем «Oy uchun» подсказка: «Eski oy qarzini
   to'lasangiz, shu oyni tanlang» / «Гасите долг прошлого месяца — выберите тот месяц».
5. Переводы в `uz.json` (основной) и `ru.json`, раздел `salaries`.

## Проверка

- `cd api && npm test`, `npx tsc --noEmit` в корне и в api, eslint по изменённым файлам.
- На проде после выкладки (только чтение): Ирода, ноябрь — остаток 188 769,
  начислено 2 719 200, выплачено за ноябрь 0, итог 2 907 969 (как сейчас).
  Сумма «Jami qarz» в таблице до и после выкладки совпадает по всем учителям.

## Открытый вопрос (не в этой задаче)

Tursunboyev Mr.Bekzod — владелец центра, преподаёт со ставкой 100 %. Себе он не
выплачивает, поэтому «Markaz qarzi» по нему растёт (75 663 428 на ноябрь) и
раздувает общий долг центра в карточке сверху. Варианты на потом: пометка
«владелец — не считать в долг центра», или показывать его отдельной строкой
итога. Решает владелец.
