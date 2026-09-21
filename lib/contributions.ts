import { z } from "zod";
export const contributionCategories = ["design", "development", "creative", "marketing", "idea", "experience_event", "other"] as const;
export const contributionStatuses = ["submitted", "reviewing", "accepted", "declined"] as const;
export const categoryLabels = { design: "Design", development: "Development", creative: "Creative", marketing: "Marketing", idea: "Idea", experience_event: "Experience / Event", other: "Other" };
const optionalText = (max: number) => z.string().trim().max(max).transform(value => value || null);
export const contributionSchema = z.object({
 category: z.enum(contributionCategories), title: z.string().trim().min(1).max(200), description: z.string().trim().min(1).max(12000),
 work_url: z.string().trim().max(2000).refine(value => !value || (URL.canParse(value) && ["https:", "http:"].includes(new URL(value).protocol)), "Use an http or https URL.").transform(value => value || null),
 additional_notes: optionalText(3000),
});
export const milestoneSchema = z.array(z.object({ title: z.string(), threshold: z.coerce.number(), earned_at: z.string() }));
export const referralActivitySchema = z.array(z.object({ date: z.string(), filth_awarded: z.coerce.number() }));
export const earningsHistorySchema = z.array(z.object({ id: z.string(), commission_amount: z.coerce.number(), status: z.enum(["pending", "available"]), created_at: z.string(), available_at: z.string(), matured_at: z.string().nullable() }));
export const contributionDate = (date: string) => new Intl.DateTimeFormat("en-ZA", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(date));
