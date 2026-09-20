"use client";

import { UserForm } from "@/components/user-form";
import { createUser } from "@/lib/api/users";
import type { ApiUsersFormOptions } from "@/lib/api/users";
import type { CreateUserInput, UpdateUserInput } from "@/validators/user";

interface CreateUserFormProps {
  branches: { id: string; name: string }[];
  formOptions: ApiUsersFormOptions;
}

export function CreateUserForm({ branches, formOptions }: CreateUserFormProps) {
  const handleSubmit = async (data: CreateUserInput | UpdateUserInput) => {
    return await createUser(data as CreateUserInput);
  };

  return <UserForm onSubmit={handleSubmit} branches={branches} formOptions={formOptions} />;
}
