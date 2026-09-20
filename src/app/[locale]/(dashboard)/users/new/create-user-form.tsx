"use client";

import { UserForm } from "@/components/user-form";
import { createUser } from "@/lib/api/users";
import type { CreateUserInput, UpdateUserInput } from "@/validators/user";

interface CreateUserFormProps {
  branches: { id: string; name: string }[];
}

export function CreateUserForm({ branches }: CreateUserFormProps) {
  const handleSubmit = async (data: CreateUserInput | UpdateUserInput) => {
    return await createUser(data as CreateUserInput);
  };

  return <UserForm onSubmit={handleSubmit} branches={branches} />;
}
