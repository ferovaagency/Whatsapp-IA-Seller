import type { AIProvider, AIMessage } from "./provider";

export class GeminiProvider implements AIProvider {
  async generateResponse(messages: AIMessage[], systemPrompt: string): Promise<string> {
    const { GoogleGenerativeAI } = await import("@google/generative-ai");
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      systemInstruction: systemPrompt,
    });

    const history = messages.slice(0, -1).map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

    const chat = model.startChat({ history });
    const last = messages[messages.length - 1];
    const result = await chat.sendMessage(last.content);
    return result.response.text();
  }
}
