"use client";

import { UserForm } from "@/components/user-form";
import { createUser } from "@/lib/api/users";
import type { CreateUserInput, UpdateUserInput } from "@/validators/user";

export function CreateUserForm() {
  const handleSubmit = async (data: CreateUserInput | UpdateUserInput) => {
    return await createUser(data as CreateUserInput);
  };

  return <UserForm onSubmit={handleSubmit} />;
}
