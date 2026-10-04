import { Placeholder } from "@/components/placeholder";

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  return (
    <Placeholder
      title={`Starter kit: ${slug}`}
      description="A starter kit with its illustration and ordered playbook list. Built in P5."
    />
  );
}
