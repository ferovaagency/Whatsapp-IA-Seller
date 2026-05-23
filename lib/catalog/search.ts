import { supabaseAdmin } from "../supabase/client";

export interface CatalogProduct {
  url_producto: string;
  nombre: string;
  precio: string;
  imagen_url: string;
  categoria: string;
}

export async function clientHasCatalog(clientId: string): Promise<boolean> {
  const { count } = await supabaseAdmin
    .from("product_catalog")
    .select("url_producto", { count: "exact", head: true })
    .eq("client_id", clientId)
    .then((r) => ({ count: r.count ?? 0 }));
  return count > 0;
}

export async function searchCatalog(
  clientId: string,
  query: string,
  limit = 3,
): Promise<CatalogProduct[]> {
  // Full-text search first
  const { data: ftsData } = await supabaseAdmin
    .from("product_catalog")
    .select("url_producto, nombre, precio, imagen_url, categoria")
    .eq("client_id", clientId)
    .textSearch("nombre", query, { type: "websearch", config: "spanish" })
    .limit(limit);

  if (ftsData && ftsData.length > 0) return ftsData as CatalogProduct[];

  // ILIKE fallback for partial matches
  const { data: likeData } = await supabaseAdmin
    .from("product_catalog")
    .select("url_producto, nombre, precio, imagen_url, categoria")
    .eq("client_id", clientId)
    .ilike("nombre", `%${query}%`)
    .limit(limit);

  return (likeData ?? []) as CatalogProduct[];
}
