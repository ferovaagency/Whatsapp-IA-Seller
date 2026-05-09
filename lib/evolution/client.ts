const BASE_URL = (process.env.EVOLUTION_API_URL || "").trim().replace(/\/$/, "");
const API_KEY = (process.env.EVOLUTION_API_KEY || "").trim();

const headers = {
  "Content-Type": "application/json",
  apikey: API_KEY,
};

export async function createInstance(instanceName: string) {
  const res = await fetch(`${BASE_URL}/instance/create`, {
    method: "POST",
    headers,
    body: JSON.stringify({ instanceName, qrcode: true, integration: "WHATSAPP-BAILEYS" }),
  });
  return res.json();
}

export async function getQR(instanceName: string) {
  const res = await fetch(`${BASE_URL}/instance/connect/${instanceName}`, { method: "GET", headers });
  return res.json();
}

export async function getInstanceStatus(instanceName: string) {
  const res = await fetch(`${BASE_URL}/instance/connectionState/${instanceName}`, { method: "GET", headers });
  return res.json();
}

export async function sendMessage(instanceName: string, to: string, text: string) {
  const res = await fetch(`${BASE_URL}/message/sendText/${instanceName}`, {
    method: "POST",
    headers,
    body: JSON.stringify({ number: to, text }),
  });
  return res.json();
}

export async function getMediaBase64(instanceName: string, message: unknown) {
  const res = await fetch(`${BASE_URL}/chat/getBase64FromMediaMessage/${instanceName}`, {
    method: "POST",
    headers,
    body: JSON.stringify({ message }),
  });
  return res.json();
}

export async function setWebhook(instanceName: string, webhookUrl: string) {
  const res = await fetch(`${BASE_URL}/webhook/set/${instanceName}`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      webhook: {
        enabled: true,
        url: webhookUrl,
        webhookByEvents: false,
        webhookBase64: false,
        events: ["MESSAGES_UPSERT"],
      },
    }),
  });
  return res.json();
}

export async function deleteInstance(instanceName: string) {
  const res = await fetch(`${BASE_URL}/instance/delete/${instanceName}`, { method: "DELETE", headers });
  return res.json();
}

// Crea la instancia y configura el webhook. Retorna true si tuvo éxito.
export async function provisionInstance(instanceName: string, webhookUrl: string): Promise<boolean> {
  try {
    if (!BASE_URL || !API_KEY) return false;

    const createRes = await fetch(`${BASE_URL}/instance/create`, {
      method: "POST",
      headers,
      body: JSON.stringify({ instanceName, qrcode: true, integration: "WHATSAPP-BAILEYS" }),
    });
    const createData = await createRes.json() as Record<string, unknown>;

    if (!createRes.ok) {
      const msg = String(createData?.message ?? createData?.error ?? "").toLowerCase();
      const alreadyExists = msg.includes("already") || msg.includes("exists") || msg.includes("exist");
      if (!alreadyExists) return false;
    }

    if (webhookUrl) {
      await fetch(`${BASE_URL}/webhook/set/${instanceName}`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          webhook: {
            enabled: true,
            url: webhookUrl,
            webhookByEvents: false,
            webhookBase64: false,
            events: ["MESSAGES_UPSERT"],
          },
        }),
      });
    }

    return true;
  } catch {
    return false;
  }
}

// Retorna true si el error de Evolution API indica que la instancia no existe
export function isInstanceNotFound(data: unknown): boolean {
  if (!data || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;
  const msg = String(d.message ?? d.error ?? d.response ?? "").toLowerCase();
  return (
    msg.includes("not found") ||
    msg.includes("no instance") ||
    msg.includes("instance not") ||
    d.status === 404
  );
}
