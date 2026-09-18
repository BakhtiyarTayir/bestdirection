// Перенесено из src/lib/assessment-scoring.ts в web без изменений.
// Подсчёт баллов попытки теста или экзамена. Чистая функция без "use server":
// так её можно проверить скриптом (assessment-scoring.spec.ts), а
// экспорт не становится открытым эндпоинтом.

export type SubmittedAnswer = { questionId: string; selectedOptionIds: string[] };

type ScoredQuestion = {
  id: string;
  points: number;
  options: { id: string; isCorrect: boolean }[];
};

export type ScoredAnswer = SubmittedAnswer & { isCorrect: boolean; pointsEarned: number };

/**
 * Ответы приходят прямым вызовом server action, поэтому им не доверяем:
 * - на вопрос засчитывается только первый ответ. Раньше каждый дубль
 *   добавлял баллы и в score, и в maxScore, и десять копий одного верного
 *   ответа поднимали 50% до 91%;
 * - ответы на чужие вопросы отбрасываются;
 * - maxScore — сумма баллов всех вопросов теста, от присланного не зависит.
 */
export function scoreAssessment(questions: ScoredQuestion[], submitted: SubmittedAnswer[]) {
  const questionById = new Map(questions.map((q) => [q.id, q]));
  const answered = new Set<string>();
  const answers: ScoredAnswer[] = [];
  let score = 0;

  for (const answer of submitted) {
    const question = questionById.get(answer.questionId);
    if (!question || answered.has(question.id)) continue;
    answered.add(question.id);

    const selected = [...new Set(answer.selectedOptionIds)].sort();
    const correct = question.options
      .filter((o) => o.isCorrect)
      .map((o) => o.id)
      .sort();
    const isCorrect =
      correct.length === selected.length && correct.every((id, i) => id === selected[i]);
    const pointsEarned = isCorrect ? question.points : 0;

    score += pointsEarned;
    answers.push({ questionId: question.id, selectedOptionIds: selected, isCorrect, pointsEarned });
  }

  const maxScore = questions.reduce((sum, q) => sum + q.points, 0);
  const percentage = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;

  return { answers, score, maxScore, percentage };
}
