"use client";

import { UserForm } from "@/components/user-form";
import { updateUser } from "@/actions/user-actions";
import type { CreateUserInput, UpdateUserInput } from "@/validators/user";
import type { Role } from "@/generated/prisma";

interface EditUserFormProps {
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    phone: string | null;
    role: Role;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
  };
}

export function EditUserForm({ user }: EditUserFormProps) {
  const handleSubmit = async (data: CreateUserInput | UpdateUserInput) => {
    return await updateUser(user.id, data as UpdateUserInput);
  };

  return <UserForm user={user} onSubmit={handleSubmit} />;
}
