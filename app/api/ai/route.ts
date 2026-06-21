import { NextResponse } from "next/server";
import Groq from "groq-sdk";

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

export async function POST(req: Request) {
  try {
    const { bottleneck, delay, cost } = await req.json();

    if (!bottleneck || delay === undefined || cost === undefined) {
      return NextResponse.json(
        { error: "Missing required fields: bottleneck, delay, cost" },
        { status: 400 },
      );
    }

    const completion = await groq.chat.completions.create({
      messages: [
        {
          role: "system",
          content:
            "You are an elite Lean Six Sigma and Industry 4.0 consultant specializing in the German manufacturing sector. Your task is to provide extremely concise, actionable, and highly technical advice. Do not use generic greetings. Provide exactly 3 bullet points of immediate action steps to resolve the identified bottleneck. " +
            "Do NOT invent specific numeric outcomes (percentages, exact time savings, exact cost reductions) since you were not given the underlying process data to calculate them — stating a fabricated number is misleading to a manufacturing engineer who will check it against real data. " +
            "Speak in concrete engineering and process terms instead (e.g. name the specific control method, scheduling approach, or root-cause category), without quantifying an unverified improvement.",
        },
        {
          role: "user",
          content: `We detected a critical bottleneck at the '${bottleneck}' station. It is causing a total deviation of ${delay} minutes and an estimated waste cost of €${cost}. What are the 3 immediate engineering or process steps we should take to fix this?`,
        },
      ],
      model: "llama-3.3-70b-versatile",
      temperature: 0.3,
      max_tokens: 500,
    });

    const aiResponse = completion.choices[0]?.message?.content;

    if (!aiResponse) {
      return NextResponse.json({
        insight:
          "Action plan could not be generated at this time. Please review the station data manually or retry the analysis.",
      });
    }

    return NextResponse.json({ insight: aiResponse });
  } catch (error) {
    console.error("AI provider error:", error);
    return NextResponse.json(
      { error: "AI Analysis failed. Please try again." },
      { status: 500 },
    );
  }
}
