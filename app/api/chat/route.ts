
import Groq from "groq-sdk";
import { createClient } from "@supabase/supabase-js";

const MODEL = "openai/gpt-oss-20b";

// Save chat history securely on the server
async function saveChatHistory(
  visitorId: string,
  conversationId: string,
  userMessage: string,
  aiResponse: string
) {
  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SECRET_KEY;

    if (!supabaseUrl || !supabaseKey) {
      console.error("Supabase environment variables are missing.");
      return;
    }

    const uuidPattern =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    if (
      !uuidPattern.test(conversationId) ||
      !visitorId ||
      !userMessage.trim() ||
      !aiResponse.trim()
    ) {
      console.error("Invalid chat data. Chat was not saved.");
      return;
    }

    const supabase = createClient(
      supabaseUrl,
      supabaseKey,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      }
    );

    const { error } = await supabase
      .from("chat_history")
      .insert({
        visitor_id: visitorId,
        conversation_id: conversationId,
        user_message: userMessage,
        ai_response: aiResponse,
      });

    if (error) {
      console.error("Supabase save error:", error.message);
    } else {
      console.log("Chat history saved successfully.");
    }
  } catch (error) {
    console.error("Chat history error:", error);
  }
}

export async function POST(req: Request) {
  try {
    const apiKey = process.env.GROQ_API_KEY;

    if (!apiKey) {
      return Response.json(
        { error: "GROQ_API_KEY is missing." },
        { status: 500 }
      );
    }

    const groq = new Groq({
      apiKey,
      timeout: 60_000,
      maxRetries: 1,
    });

    let body: any;

    try {
      body = await req.json();
    } catch {
      return Response.json(
        { error: "Invalid JSON request." },
        { status: 400 }
      );
    }

    if (!body || !Array.isArray(body.messages)) {
      return Response.json(
        { error: "Messages array is required." },
        { status: 400 }
      );
    }

    const messages = body.messages.map((m: any) => ({
      role: m.role === "user" ? "user" : "assistant",
      content: typeof m.content === "string" ? m.content : "",
    }));

    const visitorId =
      typeof body.visitorId === "string"
        ? body.visitorId
        : "";

    const conversationId =
      typeof body.conversationId === "string"
        ? body.conversationId
        : "";

    const lastUserMessage =
      messages
        .filter((m: any) => m.role === "user")
        .pop()?.content || "";

    if (!lastUserMessage.trim()) {
      return Response.json(
        { error: "User message is required." },
        { status: 400 }
      );
    }

    // Bangladesh National Anthem special response
    const lowerMessage = lastUserMessage.toLowerCase();

    if (
      lowerMessage.includes("national anthem") ||
      lowerMessage.includes("natinal song") ||
      lowerMessage.includes("amar shonar bangla")
    ) {
      const answer =
        "The national anthem of Bangladesh is Amar Shonar Bangla. It was written and composed by Rabindranath Tagore in 1905.";

      await saveChatHistory(
        visitorId,
        conversationId,
        lastUserMessage,
        answer
      );

      return new Response(answer, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
        },
      });
    }

    // Groq AI request — existing model unchanged
    const result = await groq.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: "system",
          content:
            "You are Tapas_AI, an advanced, intelligent and helpful AI assistant created by Tapas Datta. Always reply in English. Use clear and natural language. Avoid unnecessary markdown symbols. When asked who created you, mention Tapas Datta, his email taposdatta610@gmail.com, and his LinkedIn profile https://www.linkedin.com/feed/.",
        },
        ...messages,
      ],
      stream: true,
      max_completion_tokens: 2048,
    });

    const encoder = new TextEncoder();

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        let completeAnswer = "";

        try {
          for await (const chunk of result) {
            let content =
              chunk.choices[0]?.delta?.content || "";

            content = content.replace(/[*_#`~]/g, "");

            if (content) {
              completeAnswer += content;
              controller.enqueue(encoder.encode(content));
            }
          }

          // Save the complete conversation after generation
          await saveChatHistory(
            visitorId,
            conversationId,
            lastUserMessage,
            completeAnswer
          );

          controller.close();
        } catch (error) {
          console.error("Groq streaming error:", error);

          try {
            controller.enqueue(
              encoder.encode(
                "\n\n[AI response interrupted. Please try again.]"
              )
            );
            controller.close();
          } catch {
            // Stream may already be closed
          }
        }
      },

      cancel() {
        // Client cancelled the stream
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error: any) {
    console.error("Tapas_AI backend error:", error);

    return Response.json(
      {
        error:
          error?.message ||
          "AI server error occurred. Please try again.",
      },
      { status: 502 }
    );
  }
}
