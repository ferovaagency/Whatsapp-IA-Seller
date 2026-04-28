"use client";
import { useEffect, useState, useRef } from "react";
import { useParams } from "next/navigation";

type ClientData = {
  id: string;
  business_name: string;
  bot_enabled: boolean;
  instance_status: string;
  subscription_status: string;
  custom_prompt: string | null;
};

type KnowledgeSource = {
  source: string;
  chunks: number;
  added_at: string;
};

export default function ClientPortal() {
  const { clientId } = useParams<{ clientId: string }>();
  const [client, setClient] = useState<ClientData | null>(null);
  const [knowledge, setKnowledge] = useState<KnowledgeSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [section, setSection] = useState<"bot" | "knowledge" | "report">("bot");

  useEffect(() => {
    loadClient();
  }, [clientId]);

  async function loadClient() {
    const res = await fetch(`/api/portal/${clientId}`);
    if (!res.ok) { setNotFound(true); setLoading(false); return; }
    setClient(await res.json());
    setLoading(false);
    loadKnowledge();
  }

  async function loadKnowledge() {
    const res = await fetch(`/api/portal/${clientId}/knowledge`);
    if (res.ok) setKnowledge(await res.json());
  }

  async function toggleBot() {
    if (!client) return;
    const newVal = !client.bot_enabled;
    setClient({ ...client, bot_enabled: newVal });
    await fetch(`/api/portal/${clientId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bot_enabled: newVal }),
    });
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <p className="text-gray-400">Cargando...</p>
    </div>
  );

  if (notFound) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <p className="text-gray-500">Portal no encontrado.</p>
    </div>
  );

  if (!client) return null;

  const statusColor = client.subscription_status === "active"
    ? "bg-green-100 text-green-700"
    : client.subscription_status === "trial"
    ? "bg-yellow-100 text-yellow-700"
    : "bg-red-100 text-red-700";

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-5 py-4">
        <div className="max-w-lg mx-auto">
          <h1 className="text-lg font-bold">{client.business_name}</h1>
          <div className="flex gap-2 mt-1">
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor}`}>
              {client.subscription_status === "active" ? "Activo" : client.subscription_status === "trial" ? "Prueba" : "Suspendido"}
            </span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${client.instance_status === "open" || client.instance_status === "connected" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
              WhatsApp: {client.instance_status}
            </span>
          </div>
        </div>
      </header>

      <div className="max-w-lg mx-auto px-4 py-4">
        {/* Tab nav */}
        <div className="flex gap-1 bg-gray-200 rounded-xl p-1 mb-6">
          {([["bot", "🤖 Mi Bot"], ["knowledge", "🧠 Conocimiento"], ["report", "🚨 Reportar"]] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setSection(key)}
              className={`flex-1 text-sm py-2 rounded-lg font-medium transition-colors ${section === key ? "bg-white shadow text-black" : "text-gray-500"}`}
            >
              {label}
            </button>
          ))}
        </div>

        {section === "bot" && (
          <BotSection client={client} onToggle={toggleBot} />
        )}
        {section === "knowledge" && (
          <KnowledgeSection clientId={clientId} sources={knowledge} onRefresh={loadKnowledge} />
        )}
        {section === "report" && (
          <ReportSection clientId={clientId} />
        )}
      </div>
    </div>
  );
}

function BotSection({ client, onToggle }: { client: ClientData; onToggle: () => void }) {
  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl p-6 border">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-base">Asistente de WhatsApp</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              {client.bot_enabled ? "Respondiendo mensajes automáticamente" : "Bot pausado — no responde"}
            </p>
          </div>
          <button
            onClick={onToggle}
            className={`w-14 h-8 rounded-full transition-colors relative ${client.bot_enabled ? "bg-black" : "bg-gray-300"}`}
          >
            <div className={`absolute top-1 w-6 h-6 bg-white rounded-full shadow transition-transform ${client.bot_enabled ? "translate-x-7" : "translate-x-1"}`} />
          </button>
        </div>
        <div className={`mt-4 px-4 py-3 rounded-xl text-sm font-medium ${client.bot_enabled ? "bg-green-50 text-green-700" : "bg-yellow-50 text-yellow-700"}`}>
          {client.bot_enabled ? "Tu bot está activo y atendiendo clientes." : "Tu bot está pausado. Actívalo cuando quieras retomar la atención automática."}
        </div>
      </div>

      <div className="bg-white rounded-2xl p-5 border">
        <h3 className="font-semibold text-sm mb-1">¿Cuándo pausar el bot?</h3>
        <ul className="text-sm text-gray-500 space-y-1 list-disc list-inside">
          <li>Cuando quieras atender personalmente</li>
          <li>Durante reuniones o eventos importantes</li>
          <li>Si el bot está dando respuestas incorrectas</li>
        </ul>
        <p className="text-xs text-gray-400 mt-3">Puedes activarlo y pausarlo cuando quieras, las veces que necesites.</p>
      </div>
    </div>
  );
}

function KnowledgeSection({ clientId, sources, onRefresh }: { clientId: string; sources: KnowledgeSource[]; onRefresh: () => void }) {
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  async function add(type: "url" | "text") {
    setLoading(true); setResult("");
    const res = await fetch(`/api/portal/${clientId}/knowledge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: type === "url" ? url : undefined,
        text: type === "text" ? text : undefined,
        source: type === "url" ? url : "manual",
      }),
    });
    const data = await res.json();
    setResult(res.ok ? `Listo. ${data.characters} caracteres guardados.` : `Error: ${data.error}`);
    if (res.ok) { setUrl(""); setText(""); onRefresh(); }
    setLoading(false);
  }

  async function deleteSource(source: string) {
    if (!confirm(`¿Eliminar "${source}"?`)) return;
    setLoading(true);
    await fetch(`/api/portal/${clientId}/knowledge`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source }),
    });
    onRefresh();
    setLoading(false);
  }

  async function ingestFile(file: File) {
    setLoading(true); setResult("");
    const formData = new FormData();
    formData.append("file", file);
    formData.append("client_id", clientId);
    const res = await fetch("/api/knowledge/file", { method: "POST", body: formData });
    const data = await res.json();
    setResult(res.ok ? `Archivo procesado. ${data.characters} caracteres guardados.` : `Error: ${data.error}`);
    if (res.ok) onRefresh();
    setLoading(false);
  }

  return (
    <div className="space-y-4">
      {sources.length > 0 && (
        <div className="bg-white rounded-2xl border p-4">
          <h3 className="font-semibold text-sm mb-3">Fuentes actuales</h3>
          <div className="space-y-2">
            {sources.map((s) => (
              <div key={s.source} className="flex items-center justify-between py-2 border-b last:border-0">
                <div>
                  <p className="text-sm font-medium truncate max-w-[200px]">{s.source === "manual" ? "Texto manual" : s.source}</p>
                  <p className="text-xs text-gray-400">{s.chunks} fragmentos</p>
                </div>
                <button onClick={() => deleteSource(s.source)} className="text-xs text-red-500 hover:underline">Eliminar</button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl border p-4 space-y-4">
        <h3 className="font-semibold text-sm">Agregar información</h3>

        <div>
          <p className="text-xs font-medium text-gray-500 mb-2">Archivo (.txt o .pdf)</p>
          <input ref={fileRef} type="file" accept=".txt,.pdf" className="hidden"
            onChange={(e) => { if (e.target.files?.[0]) ingestFile(e.target.files[0]); }} />
          <button onClick={() => fileRef.current?.click()} disabled={loading}
            className="w-full border-2 border-dashed border-gray-200 rounded-xl py-4 text-sm text-gray-500 hover:border-black hover:bg-gray-50 disabled:opacity-50 transition-colors">
            {loading ? "Procesando..." : "Seleccionar archivo"}
          </button>
        </div>

        <div>
          <p className="text-xs font-medium text-gray-500 mb-2">Sitio web</p>
          <div className="flex gap-2">
            <input value={url} onChange={(e) => setUrl(e.target.value)}
              placeholder="https://..." className="flex-1 border rounded-lg px-3 py-2 text-sm" />
            <button onClick={() => add("url")} disabled={!url || loading}
              className="bg-black text-white px-4 py-2 rounded-lg text-sm disabled:opacity-40">
              {loading ? "..." : "Cargar"}
            </button>
          </div>
        </div>

        <div>
          <p className="text-xs font-medium text-gray-500 mb-2">Texto libre</p>
          <textarea value={text} onChange={(e) => setText(e.target.value)}
            rows={4} className="w-full border rounded-lg px-3 py-2 text-sm"
            placeholder="Horarios, precios, políticas, FAQs..." />
          <button onClick={() => add("text")} disabled={!text || loading}
            className="mt-2 w-full bg-black text-white py-2.5 rounded-lg text-sm font-medium disabled:opacity-40">
            {loading ? "Guardando..." : "Guardar texto"}
          </button>
        </div>

        {result && (
          <p className={`text-sm p-3 rounded-lg ${result.startsWith("Error") ? "bg-red-50 text-red-600" : "bg-green-50 text-green-700"}`}>
            {result}
          </p>
        )}
      </div>
    </div>
  );
}

function ReportSection({ clientId }: { clientId: string }) {
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError("");
    const res = await fetch(`/api/portal/${clientId}/report`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description }),
    });
    if (res.ok) { setSent(true); setDescription(""); }
    else { const d = await res.json(); setError(d.error ?? "Error al enviar"); }
    setLoading(false);
  }

  if (sent) return (
    <div className="bg-white rounded-2xl border p-8 text-center">
      <p className="text-3xl mb-3">✅</p>
      <p className="font-semibold">Reporte enviado</p>
      <p className="text-sm text-gray-500 mt-1">El equipo de Ferova revisará tu caso pronto.</p>
      <button onClick={() => setSent(false)} className="mt-4 text-sm text-gray-400 hover:underline">
        Enviar otro reporte
      </button>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border p-5">
        <h3 className="font-semibold mb-1">Reportar un problema</h3>
        <p className="text-sm text-gray-500 mb-4">Cuéntanos qué está pasando con tu bot y lo revisamos a la brevedad.</p>
        <form onSubmit={submit} className="space-y-3">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={5}
            required
            placeholder="Ej: El bot respondió información incorrecta sobre los precios, no contestó después de las 8pm, etc."
            className="w-full border rounded-xl px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-black"
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button type="submit" disabled={loading || !description.trim()}
            className="w-full bg-black text-white py-3 rounded-xl font-medium text-sm disabled:opacity-40">
            {loading ? "Enviando..." : "Enviar reporte"}
          </button>
        </form>
      </div>

      <div className="bg-gray-50 rounded-2xl p-4 text-sm text-gray-500">
        <p className="font-medium text-gray-700 mb-1">Respuesta esperada</p>
        <p>El equipo revisa los reportes en horario hábil. Para urgencias puedes escribirnos directamente por WhatsApp.</p>
      </div>
    </div>
  );
}
