import { WebSocketServer } from 'ws';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';

dotenv.config();

const PORT = process.env.PORT || 8080;
const wss = new WebSocketServer({ port: PORT });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

console.log(`🧠 CEREBRO PRO (VOZ + HISTORIAL): Listo en puerto ${PORT}`);

const tempDir = path.resolve('temp_audio');
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

wss.on('connection', (ws) => {
    console.log('📱 App conectada');

    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message);
            const myLang = data.my_lang || "Español";
            const targetLang = data.language || "Inglés";
            const chosenTone = data.tone || "Neutral";
            const chosenVoice = data.voice || "alloy"; // 👈 Recibe la voz
            
            // === 🎤 AUDIO ===
            if (data.type === 'audio_input') {
                const inputPath = path.join(tempDir, `input_${Date.now()}.m4a`);
                const buffer = Buffer.from(data.payload, 'base64');
                fs.writeFileSync(inputPath, buffer);

                const transcription = await openai.audio.transcriptions.create({ 
                    file: fs.createReadStream(inputPath), model: "whisper-1" 
                });
                const userText = transcription.text;
                fs.unlinkSync(inputPath);

                if (!userText) return;

                const completion = await openai.chat.completions.create({
                    messages: [
                        { role: "system", content: `Traduce del ${myLang} al ${targetLang} (o viceversa). Tono: ${chosenTone}. Solo la traducción.` },
                        { role: "user", content: userText }
                    ],
                    model: "gpt-4o",
                    temperature: 0.3,
                });

                const aiText = completion.choices[0].message.content;
                // Pasamos la voz elegida a la función de respuesta
                sendResponse(ws, userText, aiText, chosenTone, chosenVoice);
            }

            // === 👁️ VISIÓN ===
            if (data.type === 'image_input') {
                const response = await openai.chat.completions.create({
                    model: "gpt-4o",
                    messages: [
                        { role: "user", content: [ 
                            { type: "text", text: `Traduce texto o describe imagen en ${myLang}. Tono: ${chosenTone}.` }, 
                            { type: "image_url", image_url: { url: `data:image/jpeg;base64,${data.payload}`, detail: "auto" } } 
                        ]}
                    ],
                });
                const aiText = response.choices[0].message.content;
                sendResponse(ws, "📸 (Imagen)", aiText, chosenTone, chosenVoice);
            }

        } catch (error) { console.error("Error:", error.message); }
    });
});

// Función corregida que acepta la variable 'voice'
async function sendResponse(ws, userText, aiText, tone, voice = 'alloy') {
    const mp3 = await openai.audio.speech.create({ 
        model: "tts-1", 
        voice: voice, // 👈 Aplica la voz (alloy, echo, shimmer)
        input: aiText,
        speed: 1.1 
    });
    
    const audioBuffer = Buffer.from(await mp3.arrayBuffer());
    
    ws.send(JSON.stringify({ 
        type: 'full_response', 
        user_text: userText, 
        ai_text: aiText, 
        tone: tone, 
        audio_payload: audioBuffer.toString('base64') 
    }));
}