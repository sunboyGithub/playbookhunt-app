import { Placeholder } from "@/components/placeholder";

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  return (
    <Placeholder
      title={`Category: ${slug}`}
      description="A category page listing its playbooks with the usual filters and sorting. Built in P5."
    />
  );
}
