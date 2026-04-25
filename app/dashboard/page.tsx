"use client";
import { useEffect, useState } from "react";

type Client = {
  id: string;
  name: string;
  business_name: string;
  email: string;
  instance_name: string;
  instance_status: string;
  bot_enabled: boolean;
  plan: string;
  subscription_status: string;
  subscription_expires_at: string | null;
  created_at: string;
};

const ADMIN_SECRET = process.env.NEXT_PUBLIC_ADMIN_SECRET || "";

function authHeaders() {
  const secret = localStorage.getItem("admin_secret") || "";
  return { "Content-Type": "application/json", Authorization: `Bearer ${secret}` };
}

export default function Dashboard() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [qrModal, setQrModal] = useState<{ instanceName: string; qr: string | null; status: string } | null>(null);
  const [knowledgeModal, setKnowledgeModal] = useState<Client | null>(null);

  useEffect(() => {
    if (!localStorage.getItem("admin_secret")) {
      const secret = prompt("Contraseña de administrador:");
      if (secret) localStorage.setItem("admin_secret", secret);
    }
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

  async function showQR(client: Client) {
    setQrModal({ instanceName: client.instance_name, qr: null, status: "loading" });
    const res = await fetch(`/api/qr/${client.instance_name}`, { headers: authHeaders() });
    if (res.ok) {
      const data = await res.json();
      setQrModal({ instanceName: client.instance_name, qr: data.qr, status: data.status });
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
                    {/* Toggle bot */}
                    <label className="flex items-center gap-2 cursor-pointer">
                      <span className="text-sm text-gray-600">Bot</span>
                      <div
                        onClick={() => toggleBot(c)}
                        className={`w-11 h-6 rounded-full transition-colors ${c.bot_enabled ? "bg-black" : "bg-gray-300"} relative cursor-pointer`}
                      >
                        <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${c.bot_enabled ? "translate-x-6" : "translate-x-1"}`} />
                      </div>
                    </label>

                    {/* Suscripción */}
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
                    📱 Ver QR WhatsApp
                  </button>
                  <button onClick={() => setKnowledgeModal(c)} className="text-xs border rounded-lg px-3 py-1.5 hover:bg-gray-50">
                    🧠 Base de conocimiento
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

      {/* Modal QR */}
      {qrModal && (
        <Modal onClose={() => setQrModal(null)} title="Conectar WhatsApp">
          <p className="text-sm text-gray-600 mb-4">Escanea el QR desde el WhatsApp del cliente.</p>
          {qrModal.status === "loading" ? (
            <p className="text-center py-8 text-gray-500">Generando QR...</p>
          ) : qrModal.qr ? (
            <img src={qrModal.qr} alt="QR WhatsApp" className="mx-auto w-64 h-64" />
          ) : (
            <p className="text-center py-8 text-gray-500">
              Estado: <strong>{qrModal.status}</strong>
              {qrModal.status === "open" && " — Ya conectado ✅"}
            </p>
          )}
          <button onClick={() => showQR({ instance_name: qrModal.instanceName } as Client)} className="w-full mt-4 border rounded-lg py-2 text-sm hover:bg-gray-50">
            Actualizar
          </button>
        </Modal>
      )}

      {/* Modal Conocimiento */}
      {knowledgeModal && (
        <KnowledgeModal client={knowledgeModal} onClose={() => setKnowledgeModal(null)} />
      )}

      {/* Modal Nuevo Cliente */}
      {showForm && <NewClientForm onClose={() => setShowForm(false)} onCreated={loadClients} />}
    </div>
  );
}

function Modal({ children, onClose, title }: { children: React.ReactNode; onClose: () => void; title: string }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-6 w-full max-w-md">
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

  return (
    <Modal onClose={onClose} title={`Conocimiento — ${client.business_name}`}>
      <div className="space-y-4">
        <div>
          <label className="text-sm font-medium block mb-1">URL del sitio web</label>
          <div className="flex gap-2">
            <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..." className="flex-1 border rounded-lg px-3 py-2 text-sm" />
            <button onClick={() => ingest("url")} disabled={!url || loading} className="bg-black text-white px-3 py-2 rounded-lg text-sm disabled:opacity-50">
              Cargar
            </button>
          </div>
        </div>
        <div>
          <label className="text-sm font-medium block mb-1">O pega texto / PDF (copiado)</label>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Pega aquí información del negocio..." />
          <button onClick={() => ingest("text")} disabled={!text || loading} className="mt-2 bg-black text-white px-3 py-2 rounded-lg text-sm disabled:opacity-50">
            {loading ? "Procesando..." : "Ingestar texto"}
          </button>
        </div>
        {result && <p className="text-sm">{result}</p>}
      </div>
    </Modal>
  );
}

function NewClientForm({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({ name: "", business_name: "", email: "", phone: "", custom_prompt: "", plan: "starter" });
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const res = await fetch("/api/clients", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(form),
    });
    if (res.ok) { onCreated(); onClose(); }
    setLoading(false);
  }

  return (
    <Modal onClose={onClose} title="Nuevo cliente">
      <form onSubmit={submit} className="space-y-3">
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
          <label className="text-sm font-medium block mb-1">Prompt personalizado (opcional)</label>
          <textarea value={form.custom_prompt} onChange={(e) => setForm({ ...form, custom_prompt: e.target.value })} rows={3} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Eres el asistente de ventas de..." />
        </div>
        <button type="submit" disabled={loading} className="w-full bg-black text-white py-2.5 rounded-lg font-medium disabled:opacity-50">
          {loading ? "Creando..." : "Crear cliente"}
        </button>
      </form>
    </Modal>
  );
}

function Input({ label, value, onChange, type = "text", required }: { label: string; value: string; onChange: (v: string) => void; type?: string; required?: boolean }) {
  return (
    <div>
      <label className="text-sm font-medium block mb-1">{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} required={required} className="w-full border rounded-lg px-3 py-2 text-sm" />
    </div>
  );
}
