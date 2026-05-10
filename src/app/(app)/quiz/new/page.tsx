import { requireFamily } from "@/lib/auth-helpers";
import { QuizNewWizard } from "./wizard";

export const dynamic = "force-dynamic";

export default async function QuizNewPage() {
  const { membership } = await requireFamily();
  return (
    <main className="mx-auto w-full max-w-md px-5 py-6">
      <QuizNewWizard familyName={membership.family_name} />
    </main>
  );
}
