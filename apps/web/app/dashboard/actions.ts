"use server";

import { revalidatePath } from "next/cache";

import { setArticleOverride } from "@inkrelay/db";

import { requireOwner } from "@/lib/auth";
import { enqueueDashboardJob } from "@/lib/queue";
import { database } from "@/lib/runtime";

export async function updateOverride(formData: FormData) {
  const actor = await requireOwner();
  const articleId = requiredField(formData, "articleId");
  const mode = requiredField(formData, "mode");
  if (!(["none", "promote", "suppress", "lock"] as const).includes(mode as never)) {
    throw new Error("Invalid override mode");
  }
  await setArticleOverride(
    database(),
    articleId,
    mode as "none" | "promote" | "suppress" | "lock",
    actor,
  );
  revalidatePath("/dashboard");
}

export async function enqueueArticleAction(formData: FormData) {
  await requireOwner();
  const articleId = requiredField(formData, "articleId");
  const job = requiredField(formData, "job");
  if (
    !(["extract-article", "evaluate-article", "generate-cover"] as const).includes(job as never)
  ) {
    throw new Error("Invalid article job");
  }
  await enqueueDashboardJob(
    job as "extract-article" | "evaluate-article" | "generate-cover",
    articleId,
  );
  revalidatePath("/dashboard");
}

function requiredField(formData: FormData, name: string): string {
  const value = formData.get(name);
  if (typeof value !== "string" || !value) throw new Error(`Missing ${name}`);
  return value;
}
