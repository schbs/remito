import { Revision } from "@/components/Revision";

export const dynamic = "force-dynamic";

export default async function PaginaRevisionIngles({ searchParams }: { searchParams: Promise<{ doc?: string }> }) {
  const { doc } = await searchParams;
  return <Revision idioma="en" docId={doc} />;
}
