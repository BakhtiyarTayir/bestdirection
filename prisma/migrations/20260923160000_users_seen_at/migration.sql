-- Отметка «администратор видел список пользователей» для цифры новых
-- пользователей в меню. Нынешним администраторам ставим «сейчас», иначе
-- цифра в первый же день показала бы всех, кого когда-либо заводили.
ALTER TABLE "User" ADD COLUMN "usersSeenAt" TIMESTAMP(3);

UPDATE "User" SET "usersSeenAt" = CURRENT_TIMESTAMP WHERE "role" = 'ADMIN';
