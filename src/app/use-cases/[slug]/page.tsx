import { Placeholder } from "@/components/placeholder";

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  return (
    <Placeholder
      title={`Use case: ${slug}`}
      description="Playbooks curated for one use case, across categories. Built in P5."
    />
  );
}
