import { z } from "zod";

export const submitLeadSchema = z.object({
  courseId: z.string().min(1, "courseRequired"),
  fullName: z.string().min(2, "fullNameRequired").max(100, "maxChars100"),
  phone: z.string().min(5, "phoneRequired").max(30, "maxChars30"),
  message: z.string().max(1000, "maxChars1000").optional(),
  // Honeypot: real users never fill this in; bots that auto-fill every field do.
  website: z.string().max(0, "").optional(),
});

export type SubmitLeadInput = z.infer<typeof submitLeadSchema>;
