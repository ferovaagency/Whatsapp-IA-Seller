"use client";
import { useEffect, useState, useRef } from "react";

type Client = {
  id: string;
  name: string;
  business_name: string;
  email: string;
  phone: string;
  instance_name: string;
  instance_status: string;
  bot_enabled: boolean;
  plan: string;
  custom_prompt: string | null;
  subscription_status: string;
  subscription_expires_at: string | null;
  created_at: string;
};

const ADMIN_KEY = process.env.NEXT_PUBLIC_ADMIN_SECRET || "ferova_admin_2026";

function authHeaders() {
  return { "Content-Type": "application/json", Authorization: `Bearer ${ADMIN_KEY}` };
}

function fileAuthHeaders() {
  return { Authorization: `Bearer ${ADMIN_KEY}` };
}

export default function Dashboard() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [qrModal, setQrModal] = useState<{ instanceName: string; qr: string | null; status: string; detail?: string } | null>(null);
  const [knowledgeModal, setKnowledgeModal] = useState<Client | null>(null);
  const [editModal, setEditModal] = useState<Client | null>(null);

  useEffect(() => {
    loadClients();
  }, []);

  async function loadClients() {
    setLoading(true);
    const res = await fetch("/api/clients", { headers: authHeaders() });
    if (res.ok) setClients(await res.json());
    setLoading(false);
  }

  async function toggleBot(client: Client) {
    await fetch(`/api/clients/${client.id}`, {
      method: "PATCH",
      headers: authHeaders(),
      body: JSON.stringify({ bot_enabled: !client.bot_enabled }),
    });
    loadClients();
  }

  async function updateSubscription(client: Client, status: string) {
    const expires = status === "active"
      ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
      : null;
    await fetch(`/api/clients/${client.id}`, {
      method: "PATCH",
      headers: authHeaders(),
      body: JSON.stringify({ subscription_status: status, subscription_expires_at: expires, bot_enabled: status === "active" }),
    });
    loadClients();
  }

  async function deleteClient(client: Client) {
    if (!confirm(`¿Eliminar a ${client.business_name}? Esta acción no se puede deshacer.`)) return;
    await fetch(`/api/clients/${client.id}`, { method: "DELETE", headers: authHeaders() });
    loadClients();
  }

  async function showQR(client: Client) {
    setQrModal({ instanceName: client.instance_name, qr: null, status: "loading" });
    try {
      const res = await fetch(`/api/qr/${client.instance_name}`, { headers: authHeaders() });
      const data = await res.json();
      if (res.ok) {
        setQrModal({ instanceName: client.instance_name, qr: data.qr, status: data.status });
      } else {
        setQrModal({ instanceName: client.instance_name, qr: null, status: data.status ?? "error", detail: data.detail ?? data.error });
      }
    } catch {
      setQrModal({ instanceName: client.instance_name, qr: null, status: "error: sin conexión" });
    }
  }

  const statusColor = (s: string) => ({
    active: "bg-green-100 text-green-800",
    trial: "bg-yellow-100 text-yellow-800",
    suspended: "bg-red-100 text-red-800",
    cancelled: "bg-gray-100 text-gray-600",
  }[s] || "bg-gray-100 text-gray-600");

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-6 py-4 flex justify-between items-center">
        <div>
          <h1 className="text-xl font-bold">Ferova AI — Panel Admin</h1>
          <p className="text-sm text-gray-500">Gestión de clientes WhatsApp AI</p>
        </div>
        <button onClick={() => setShowForm(true)} className="bg-black text-white px-4 py-2 rounded-lg text-sm font-medium">
          + Nuevo cliente
        </button>
      </header>

      <main className="p-6 max-w-7xl mx-auto">
        {loading ? (
          <p className="text-gray-500 text-center py-12">Cargando clientes...</p>
        ) : clients.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <p className="text-lg">No hay clientes aún</p>
            <p className="text-sm mt-1">Crea el primero con el botón de arriba</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {clients.map((c) => (
              <div key={c.id} className="bg-white rounded-xl border p-5">
                <div className="flex justify-between items-start">
                  <div>
                    <h2 className="font-semibold text-lg">{c.business_name}</h2>
                    <p className="text-sm text-gray-500">{c.name} · {c.email}</p>
                    <div className="flex gap-2 mt-2 flex-wrap">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColor(c.subscription_status)}`}>
                        {c.subscription_status}
                      </span>
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                        {c.plan}
                      </span>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${c.instance_status === "connected" ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-600"}`}>
                        WhatsApp: {c.instance_status}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 items-end">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <span className="text-sm text-gray-600">Bot</span>
                      <div
                        onClick={() => toggleBot(c)}
                        className={`w-11 h-6 rounded-full transition-colors ${c.bot_enabled ? "bg-black" : "bg-gray-300"} relative cursor-pointer`}
                      >
                        <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${c.bot_enabled ? "translate-x-6" : "translate-x-1"}`} />
                      </div>
                    </label>

                    <select
                      value={c.subscription_status}
                      onChange={(e) => updateSubscription(c, e.target.value)}
                      className="text-xs border rounded px-2 py-1 bg-white"
                    >
                      <option value="trial">Trial</option>
                      <option value="active">Activo</option>
                      <option value="suspended">Suspendido</option>
                      <option value="cancelled">Cancelado</option>
                    </select>
                  </div>
                </div>

                <div className="flex gap-2 mt-4 flex-wrap">
                  <button onClick={() => showQR(c)} className="text-xs border rounded-lg px-3 py-1.5 hover:bg-gray-50">
                    📱 Conectar WhatsApp
                  </button>
                  <button onClick={() => setKnowledgeModal(c)} className="text-xs border rounded-lg px-3 py-1.5 hover:bg-gray-50">
                    🧠 Base de conocimiento
                  </button>
                  <button onClick={() => setEditModal(c)} className="text-xs border rounded-lg px-3 py-1.5 hover:bg-gray-50">
                    ✏️ Editar
                  </button>
                  <button onClick={() => deleteClient(c)} className="text-xs border border-red-200 text-red-600 rounded-lg px-3 py-1.5 hover:bg-red-50">
                    🗑️ Eliminar
                  </button>
                  {c.subscription_expires_at && (
                    <span className="text-xs text-gray-400 self-center">
                      Vence: {new Date(c.subscription_expires_at).toLocaleDateString("es-CO")}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {qrModal && (
        <Modal onClose={() => setQrModal(null)} title="Conectar WhatsApp">
          <p className="text-sm text-gray-600 mb-4">Escanea el QR desde el WhatsApp del cliente.</p>
          {qrModal.status === "loading" ? (
            <p className="text-center py-8 text-gray-500">Generando QR...</p>
          ) : qrModal.qr ? (
            <img src={qrModal.qr} alt="QR WhatsApp" className="mx-auto w-64 h-64" />
          ) : qrModal.status === "open" ? (
            <p className="text-center py-8 text-green-600 font-medium">Ya conectado ✅</p>
          ) : qrModal.status === "not_created" ? (
            <div className="text-center py-6 space-y-3">
              <p className="text-red-600 font-medium">Instancia no creada en Evolution API</p>
              <p className="text-sm text-gray-500">{qrModal.detail}</p>
              <a
                href="https://evolution-api-production-0686.up.railway.app/manager/"
                target="_blank"
                rel="noreferrer"
                className="inline-block mt-2 bg-black text-white text-sm px-4 py-2 rounded-lg"
              >
                Abrir Manager de Evolution API
              </a>
            </div>
          ) : (
            <p className="text-center py-8 text-gray-500">
              Estado: <strong>{qrModal.status}</strong>
              {qrModal.detail && <span className="block text-xs text-red-500 mt-1">{qrModal.detail}</span>}
            </p>
          )}
          <button onClick={() => showQR({ instance_name: qrModal.instanceName } as Client)} className="w-full mt-4 border rounded-lg py-2 text-sm hover:bg-gray-50">
            Actualizar QR
          </button>
        </Modal>
      )}

      {knowledgeModal && (
        <KnowledgeModal client={knowledgeModal} onClose={() => setKnowledgeModal(null)} />
      )}

      {editModal && (
        <EditClientModal client={editModal} onClose={() => setEditModal(null)} onSaved={loadClients} />
      )}

      {showForm && <NewClientForm onClose={() => setShowForm(false)} onCreated={loadClients} />}
    </div>
  );
}

function Modal({ children, onClose, title }: { children: React.ReactNode; onClose: () => void; title: string }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-semibold text-lg">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function KnowledgeModal({ client, onClose }: { client: Client; onClose: () => void }) {
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  async function ingest(type: "url" | "text") {
    setLoading(true);
    setResult("");
    const res = await fetch("/api/knowledge", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        client_id: client.id,
        url: type === "url" ? url : undefined,
        text: type === "text" ? text : undefined,
        source: type === "url" ? url : "manual",
      }),
    });
    const data = await res.json();
    setResult(res.ok ? `✅ ${data.characters} caracteres ingestados` : `❌ ${data.error}`);
    setLoading(false);
  }

  async function ingestFile(file: File) {
    setLoading(true);
    setResult("");
    const formData = new FormData();
    formData.append("file", file);
    formData.append("client_id", client.id);
    const res = await fetch("/api/knowledge/file", {
      method: "POST",
      headers: fileAuthHeaders(),
      body: formData,
    });
    const data = await res.json();
    setResult(res.ok ? `✅ ${data.characters} caracteres extraídos de "${file.name}"` : `❌ ${data.error}`);
    setLoading(false);
  }

  async function clearKnowledge() {
    if (!confirm("¿Eliminar toda la base de conocimiento de este cliente?")) return;
    setLoading(true);
    await fetch("/api/knowledge", {
      method: "DELETE",
      headers: authHeaders(),
      body: JSON.stringify({ client_id: client.id }),
    });
    setResult("🗑️ Base de conocimiento eliminada");
    setLoading(false);
  }

  return (
    <Modal onClose={onClose} title={`Conocimiento — ${client.business_name}`}>
      <div className="space-y-4">
        {/* Archivo — primera opción */}
        <div className="bg-gray-50 rounded-xl p-4">
          <p className="text-sm font-semibold mb-2">📎 Subir archivo (.txt o .pdf)</p>
          <input
            ref={fileRef}
            type="file"
            accept=".txt,.pdf"
            className="hidden"
            onChange={(e) => { if (e.target.files?.[0]) ingestFile(e.target.files[0]); }}
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={loading}
            className="w-full border-2 border-dashed border-gray-300 rounded-lg py-4 text-sm text-gray-600 font-medium hover:border-black hover:bg-white disabled:opacity-50 transition-colors"
          >
            {loading ? "Procesando archivo..." : "Clic aquí para seleccionar archivo"}
          </button>
          <p className="text-xs text-gray-400 mt-1">Los PDFs se leen automáticamente con IA</p>
        </div>

        {/* URL */}
        <div>
          <p className="text-sm font-semibold mb-2">🌐 Cargar desde sitio web</p>
          <div className="flex gap-2">
            <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..." className="flex-1 border rounded-lg px-3 py-2 text-sm" />
            <button onClick={() => ingest("url")} disabled={!url || loading} className="bg-black text-white px-4 py-2 rounded-lg text-sm disabled:opacity-50">
              {loading ? "..." : "Cargar"}
            </button>
          </div>
        </div>

        {/* Texto manual */}
        <div>
          <p className="text-sm font-semibold mb-2">📝 Pegar texto manual</p>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Horarios, precios, productos, políticas..." />
          <button onClick={() => ingest("text")} disabled={!text || loading} className="mt-2 bg-black text-white px-4 py-2 rounded-lg text-sm disabled:opacity-50 w-full">
            {loading ? "Procesando..." : "Guardar texto"}
          </button>
        </div>

        {result && <p className="text-sm font-medium p-3 bg-gray-50 rounded-lg">{result}</p>}

        <div className="border-t pt-3">
          <button onClick={clearKnowledge} disabled={loading} className="text-xs text-red-500 hover:underline disabled:opacity-50">
            Eliminar toda la base de conocimiento
          </button>
        </div>
      </div>
    </Modal>
  );
}

function EditClientModal({ client, onClose, onSaved }: { client: Client; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    name: client.name || "",
    business_name: client.business_name || "",
    email: client.email || "",
    phone: client.phone || "",
    custom_prompt: client.custom_prompt || "",
    plan: client.plan || "starter",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await fetch(`/api/clients/${client.id}`, {
      method: "PATCH",
      headers: authHeaders(),
      body: JSON.stringify(form),
    });
    if (res.ok) {
      onSaved();
      onClose();
    } else {
      const data = await res.json();
      setError(data.error || "Error al guardar");
    }
    setLoading(false);
  }

  return (
    <Modal onClose={onClose} title={`Editar — ${client.business_name}`}>
      <form onSubmit={save} className="space-y-3">
        <Input label="Nombre del contacto" value={form.name} onChange={(v) => setForm({ ...form, name: v })} required />
        <Input label="Nombre del negocio" value={form.business_name} onChange={(v) => setForm({ ...form, business_name: v })} required />
        <Input label="Email" type="email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} required />
        <Input label="Teléfono" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} />
        <div>
          <label className="text-sm font-medium block mb-1">Plan</label>
          <select value={form.plan} onChange={(e) => setForm({ ...form, plan: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm">
            <option value="starter">Starter ($49-79/mes)</option>
            <option value="business_pro">Business Pro ($129-199/mes)</option>
          </select>
        </div>
        <div>
          <label className="text-sm font-medium block mb-1">Prompt del bot (instrucciones)</label>
          <textarea
            value={form.custom_prompt}
            onChange={(e) => setForm({ ...form, custom_prompt: e.target.value })}
            rows={4}
            className="w-full border rounded-lg px-3 py-2 text-sm"
            placeholder="Eres el asistente de ventas de... Tu misión es..."
          />
          <p className="text-xs text-gray-400 mt-1">Define la personalidad y objetivo del bot</p>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose} className="flex-1 border rounded-lg py-2.5 text-sm">
            Cancelar
          </button>
          <button type="submit" disabled={loading} className="flex-1 bg-black text-white py-2.5 rounded-lg font-medium text-sm disabled:opacity-50">
            {loading ? "Guardando..." : "Guardar cambios"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function NewClientForm({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({
    name: "",
    business_name: "",
    email: "",
    phone: "",
    website_url: "",
    custom_prompt: "",
    plan: "starter",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/clients", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          name: form.name,
          business_name: form.business_name,
          email: form.email,
          phone: form.phone,
          custom_prompt: form.custom_prompt,
          plan: form.plan,
        }),
      });
      let data: Record<string, unknown> = {};
      try { data = await res.json(); } catch { /* empty body */ }
      if (!res.ok) {
        setError(`Error ${res.status}: ${(data as {error?: string}).error ?? "Error del servidor"}`);
        return;
      }
      if (form.website_url && (data as {id?: string}).id) {
        fetch("/api/knowledge", {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({ client_id: (data as {id: string}).id, url: form.website_url, source: form.website_url }),
        }).catch(() => {});
      }
      onCreated();
      onClose();
    } catch (err: unknown) {
      setError(`Error de red: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal onClose={onClose} title="Nuevo cliente">
      <form onSubmit={submit} className="space-y-3">
        <Input label="Nombre del contacto" value={form.name} onChange={(v) => setForm({ ...form, name: v })} required />
        <Input label="Nombre del negocio" value={form.business_name} onChange={(v) => setForm({ ...form, business_name: v })} required />
        <Input label="Email" type="email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} required />
        <Input label="Teléfono" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} />
        <Input label="Sitio web (opcional)" type="url" value={form.website_url} onChange={(v) => setForm({ ...form, website_url: v })} placeholder="https://..." />
        <div>
          <label className="text-sm font-medium block mb-1">Plan</label>
          <select value={form.plan} onChange={(e) => setForm({ ...form, plan: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm">
            <option value="starter">Starter ($49-79/mes)</option>
            <option value="business_pro">Business Pro ($129-199/mes)</option>
          </select>
        </div>
        <div>
          <label className="text-sm font-medium block mb-1">Prompt del bot (opcional)</label>
          <textarea value={form.custom_prompt} onChange={(e) => setForm({ ...form, custom_prompt: e.target.value })} rows={3} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Eres el asistente de ventas de..." />
        </div>
        {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
        <button type="submit" disabled={loading} className="w-full bg-black text-white py-2.5 rounded-lg font-medium disabled:opacity-50">
          {loading ? "Creando..." : "Crear cliente"}
        </button>
      </form>
    </Modal>
  );
}

function Input({ label, value, onChange, type = "text", required, placeholder }: {
  label: string; value: string; onChange: (v: string) => void;
  type?: string; required?: boolean; placeholder?: string;
}) {
  return (
    <div>
      <label className="text-sm font-medium block mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        placeholder={placeholder}
        className="w-full border rounded-lg px-3 py-2 text-sm"
      />
    </div>
  );
}
