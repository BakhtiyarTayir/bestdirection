"use client";

import { UserForm } from "@/components/user-form";
import { updateUser } from "@/lib/api/users";
import type { CreateUserInput, UpdateUserInput } from "@/validators/user";
import type { Role } from "@/validators/user";

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
    branchId?: string | null;
  };
  branches: { id: string; name: string }[];
}

export function EditUserForm({ user, branches }: EditUserFormProps) {
  const handleSubmit = async (data: CreateUserInput | UpdateUserInput) => {
    return await updateUser(user.id, data as UpdateUserInput);
  };

  return <UserForm user={user} onSubmit={handleSubmit} branches={branches} />;
}
