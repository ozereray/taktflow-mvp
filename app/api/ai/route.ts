import { NextResponse } from "next/server";
import Groq from "groq-sdk";

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

export async function POST(req: Request) {
  try {
    const { bottleneck, delay, cost } = await req.json();

    const completion = await groq.chat.completions.create({
      messages: [
        {
          role: "system",
          content:
            "You are an elite Lean Six Sigma and Industry 4.0 consultant specializing in the German manufacturing sector. Your task is to provide extremely concise, actionable, and highly technical advice. Do not use generic greetings. Provide exactly 3 bullet points of immediate action steps to resolve the identified bottleneck.",
        },
        {
          role: "user",
          content: `We detected a critical bottleneck at the '${bottleneck}' station. It is causing a total deviation of ${delay} minutes and an estimated waste cost of €${cost}. What are the 3 immediate engineering or process steps we should take to fix this?`,
        },
      ],
      // Groq'un en güncel ve desteklenen Llama 3.3 modeli
      model: "llama-3.3-70b-versatile",
      temperature: 0.3,
    });

    const aiResponse = completion.choices[0]?.message?.content;

    return NextResponse.json({ insight: aiResponse });
  } catch (error) {
    console.error("Groq API Error:", error);
    return NextResponse.json({ error: "AI Analysis failed" }, { status: 500 });
  }
}
