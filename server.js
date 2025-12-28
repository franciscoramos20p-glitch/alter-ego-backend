import { WebSocketServer } from 'ws';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';

dotenv.config();

const PORT = process.env.PORT || 8080;
const wss = new WebSocketServer({ port: PORT });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

console.log(`🧠 CEREBRO UNIVERSAL PRO: Listo en puerto ${PORT}`);

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
            const mode = data.mode || "interpreter"; 

            // === 🎤 AUDIO: TRADUCCIÓN ULTRA RÁPIDA ===
            if (data.type === 'audio_input') {
                const inputPath = path.join(tempDir, `input_${Date.now()}.m4a`);
                const buffer = Buffer.from(data.payload, 'base64');
                if (buffer.length < 2000) return; 
                fs.writeFileSync(inputPath, buffer);

                // Transcripción veloz con Whisper
                const transcription = await openai.audio.transcriptions.create({ 
                    file: fs.createReadStream(inputPath), 
                    model: "whisper-1" 
                });
                const userText = transcription.text;
                fs.unlinkSync(inputPath);

                if (!userText || userText.trim() === "") return;

                // Prompt optimizado para respuestas de menos de 1 segundo
                const completion = await openai.chat.completions.create({
                    messages: [
                        { 
                            role: "system", 
                            content: `Eres un traductor instantáneo. Traduce de forma precisa pero directa. 
                            Si detectas ${myLang}, pasa a ${targetLang}. Si detectas ${targetLang}, pasa a ${myLang}.
                            Tono: ${chosenTone}. NO agregues comentarios, solo la traducción.` 
                        },
                        { role: "user", content: userText }
                    ],
                    model: "gpt-4o", // Usamos el modelo más rápido y capaz
                    temperature: 0.3, // Menos "creatividad" = más velocidad y precisión
                });

                const aiText = completion.choices[0].message.content;
                sendResponse(ws, userText, aiText, chosenTone);
            }

            // === 👁️ VISIÓN: PRECISIÓN TOTAL (FOTO) ===
            if (data.type === 'image_input') {
                console.log("📸 Procesando Imagen de alta precisión...");
                
                const response = await openai.chat.completions.create({
                    model: "gpt-4o",
                    messages: [
                        { 
                            role: "user", 
                            content: [ 
                                { 
                                    type: "text", 
                                    text: `Analiza esta imagen con cuidado. Traduce cualquier texto que veas al ${myLang}. 
                                    Si es un objeto o lugar, explícalo en ${myLang} con un tono ${chosenTone}. 
                                    Sé preciso y profesional.` 
                                }, 
                                { 
                                    type: "image_url", 
                                    image_url: { 
                                        url: `data:image/jpeg;base64,${data.payload}`,
                                        detail: "auto" // "auto" permite que la IA decida si necesita alta resolución para leer textos pequeños
                                    } 
                                } 
                            ] 
                        },
                    ],
                });

                const aiText = response.choices[0].message.content;
                sendResponse(ws, "📸 (Imagen analizada)", aiText, chosenTone);
            }

        } catch (error) { 
            console.error("Error:", error.message); 
        }
    });
});

async function sendResponse(ws, userText, aiText, tone) {
    // Generación de voz natural de alta velocidad
    const mp3 = await openai.audio.speech.create({ 
        model: "tts-1", 
        voice: "alloy", 
        input: aiText,
        speed: 1.1 // Aumentamos ligeramente la velocidad de habla para que se sienta más fluido
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