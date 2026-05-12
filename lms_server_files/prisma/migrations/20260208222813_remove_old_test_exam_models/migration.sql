-- DropForeignKey
ALTER TABLE "AnswerOption" DROP CONSTRAINT "AnswerOption_questionId_fkey";

-- DropForeignKey
ALTER TABLE "AttemptAnswer" DROP CONSTRAINT "AttemptAnswer_attemptId_fkey";

-- DropForeignKey
ALTER TABLE "AttemptAnswer" DROP CONSTRAINT "AttemptAnswer_questionId_fkey";

-- DropForeignKey
ALTER TABLE "Exam" DROP CONSTRAINT "Exam_courseId_fkey";

-- DropForeignKey
ALTER TABLE "ExamAnswerOption" DROP CONSTRAINT "ExamAnswerOption_questionId_fkey";

-- DropForeignKey
ALTER TABLE "ExamAttempt" DROP CONSTRAINT "ExamAttempt_examId_fkey";

-- DropForeignKey
ALTER TABLE "ExamAttempt" DROP CONSTRAINT "ExamAttempt_studentId_fkey";

-- DropForeignKey
ALTER TABLE "ExamAttemptAnswer" DROP CONSTRAINT "ExamAttemptAnswer_attemptId_fkey";

-- DropForeignKey
ALTER TABLE "ExamAttemptAnswer" DROP CONSTRAINT "ExamAttemptAnswer_questionId_fkey";

-- DropForeignKey
ALTER TABLE "ExamQuestion" DROP CONSTRAINT "ExamQuestion_examId_fkey";

-- DropForeignKey
ALTER TABLE "Question" DROP CONSTRAINT "Question_testId_fkey";

-- DropForeignKey
ALTER TABLE "Test" DROP CONSTRAINT "Test_lessonId_fkey";

-- DropForeignKey
ALTER TABLE "TestAttempt" DROP CONSTRAINT "TestAttempt_studentId_fkey";

-- DropForeignKey
ALTER TABLE "TestAttempt" DROP CONSTRAINT "TestAttempt_testId_fkey";

-- DropTable
DROP TABLE "AnswerOption";

-- DropTable
DROP TABLE "AttemptAnswer";

-- DropTable
DROP TABLE "Exam";

-- DropTable
DROP TABLE "ExamAnswerOption";

-- DropTable
DROP TABLE "ExamAttempt";

-- DropTable
DROP TABLE "ExamAttemptAnswer";

-- DropTable
DROP TABLE "ExamQuestion";

-- DropTable
DROP TABLE "Question";

-- DropTable
DROP TABLE "Test";

-- DropTable
DROP TABLE "TestAttempt";
