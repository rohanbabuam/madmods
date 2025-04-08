import type { RequestEvent } from '@sveltejs/kit';
import { GoogleGenAI } from "@google/genai";
// import { PRIVATE_GEMINI_API_KEY } from '$env/static/private';
import { error, json } from '@sveltejs/kit';

/** @type {import('./$types').RequestHandler} */
export async function POST(event: RequestEvent) {

  let requestData:any;

  try {
      requestData = await event.request.json();
  } catch (err) {
      console.error('Error parsing request body:', err);
      throw error(400, 'Invalid JSON in request body.');
  }

  console.log(requestData.inputText)
  //return new Response(JSON.stringify(requestData));

  try {

    const ai = new GoogleGenAI({ apiKey: 'PRIVATE_GEMINI_API_KEY' });
    const response = await ai.models.generateContentStream({
      model: "gemini-2.5-pro-exp-03-25",
      contents: requestData.inputText,
      config: {
        maxOutputTokens: 100000,
        temperature: 1.0,
        //systemInstruction: PRIVATE_GEMINI_SYSTEM_PROMPT
      },
    });

    const headers = {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
    };

  const stream = new ReadableStream({
      async start(controller) {
          for await (const chunk of response) {
              controller.enqueue(`data: ${JSON.stringify(chunk.text)}\n\n`);
          }
          controller.close();
      }
  });

  return new Response(stream, { headers });

    // const completionResponse = await openai.chat.completions.create({
    //     messages: [{ role: "system", content: "You are a helpful assistant." }, { role: "user", content: inputText }],
    //     model: "gpt-3.5-turbo",
    //     stream: true
    // });
  }
  catch (err) {
    throw error(500, 'Failed to fetch data.');
  }
}
