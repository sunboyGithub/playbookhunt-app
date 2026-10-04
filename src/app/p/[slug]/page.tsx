import { Placeholder } from "@/components/placeholder";

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  return (
    <Placeholder
      title={`Playbook: ${slug}`}
      description="The playbook detail page: evidence, prompt, steps and the try flow. Built in P6."
    />
  );
}
