"use client";

import { UserForm } from "@/components/user-form";
import { createUser } from "@/actions/user-actions";
import type { CreateUserInput } from "@/validators/user";

export function CreateUserForm() {
  const handleSubmit = async (data: CreateUserInput) => {
    return await createUser(data);
  };

  return <UserForm onSubmit={handleSubmit} />;
}
