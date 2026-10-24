import Anthropic from "@anthropic-ai/sdk";

// Credenciais: ANTHROPIC_API_KEY ou perfil do `ant auth login`.
export const client = new Anthropic();
export const MODEL = process.env.MODEL ?? "claude-opus-5-5";
