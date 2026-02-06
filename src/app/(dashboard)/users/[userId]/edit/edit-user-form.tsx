"use client";

import { UserForm } from "@/components/user-form";
import { updateUser } from "@/actions/user-actions";
import type { UpdateUserInput } from "@/validators/user";
import type { User } from "@/generated/prisma";

interface EditUserFormProps {
  user: User;
}

export function EditUserForm({ user }: EditUserFormProps) {
  const handleSubmit = async (data: UpdateUserInput) => {
    return await updateUser(data);
  };

  return <UserForm user={user} onSubmit={handleSubmit} />;
}
