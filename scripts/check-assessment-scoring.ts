/**
 * Проверка подсчёта баллов теста: npm run check:assessment-scoring
 *
 * Ответы приходят прямым вызовом server action, и раньше дубли ответа на один
 * вопрос накручивали процент (аудит 3.1). Скрипт воспроизводит эту атаку и
 * падает с ненулевым кодом, если хоть одна проверка не сошлась.
 */
import { scoreAssessment } from "../src/lib/assessment-scoring";

let failed = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  const ok = a === e;
  if (!ok) failed++;
  console.log(`${ok ? "OK  " : "FAIL"} ${name}${ok ? ` = ${a}` : `\n       ожидалось ${e}\n       получено  ${a}`}`);
}

// Два вопроса по 1 баллу, у первого верный вариант a, у второго — d.
const questions = [
  { id: "q1", points: 1, options: [{ id: "a", isCorrect: true }, { id: "b", isCorrect: false }] },
  { id: "q2", points: 1, options: [{ id: "c", isCorrect: false }, { id: "d", isCorrect: true }] },
];
const pick = (r: ReturnType<typeof scoreAssessment>) => [r.score, r.maxScore, r.percentage];

check("честно: знает только первый", pick(scoreAssessment(questions, [{ questionId: "q1", selectedOptionIds: ["a"] }])), [1, 2, 50]);

const tenCopies = Array.from({ length: 10 }, () => ({ questionId: "q1", selectedOptionIds: ["a"] }));
check("10 копий верного ответа не поднимают процент", pick(scoreAssessment(questions, tenCopies)), [1, 2, 50]);
check("из копий сохраняется один ответ", scoreAssessment(questions, tenCopies).answers.length, 1);

check(
  "засчитывается первый ответ на вопрос, а не лучший",
  pick(scoreAssessment(questions, [
    { questionId: "q1", selectedOptionIds: ["b"] },
    { questionId: "q1", selectedOptionIds: ["a"] },
  ])),
  [0, 2, 0]
);

check(
  "ответ на чужой вопрос отбрасывается и не меняет maxScore",
  [pick(scoreAssessment(questions, [
    { questionId: "q1", selectedOptionIds: ["a"] },
    { questionId: "other-test-question", selectedOptionIds: ["x"] },
  ])), scoreAssessment(questions, [{ questionId: "other-test-question", selectedOptionIds: ["x"] }]).answers.length],
  [[1, 2, 50], 0]
);

check(
  "все варианты сразу — не верный ответ",
  pick(scoreAssessment(questions, [{ questionId: "q1", selectedOptionIds: ["a", "b"] }])),
  [0, 2, 0]
);

check(
  "повтор одного варианта внутри ответа не мешает верному",
  pick(scoreAssessment(questions, [{ questionId: "q1", selectedOptionIds: ["a", "a"] }])),
  [1, 2, 50]
);

check(
  "оба верно — 100%",
  pick(scoreAssessment(questions, [
    { questionId: "q2", selectedOptionIds: ["d"] },
    { questionId: "q1", selectedOptionIds: ["a"] },
  ])),
  [2, 2, 100]
);

check(
  "баллы вопросов учитываются",
  pick(scoreAssessment(
    [{ ...questions[0], points: 3 }, questions[1]],
    [{ questionId: "q1", selectedOptionIds: ["a"] }]
  )),
  [3, 4, 75]
);

check("пустой тест", pick(scoreAssessment([], [])), [0, 0, 0]);

if (failed > 0) {
  console.error(`\n${failed} проверок не сошлись`);
  process.exit(1);
}
console.log("\nВсе проверки сошлись");
