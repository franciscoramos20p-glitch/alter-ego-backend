import { WebSocketServer } from 'ws';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';

dotenv.config();

// Esto le dice: "Usa el puerto que te de la nube (process.env.PORT) O usa el 8080 si estoy en casa"
const PORT = process.env.PORT || 8080;
const wss = new WebSocketServer({ port: PORT });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

console.log(`🧠 CEREBRO UNIVERSAL (CUALQUIER IDIOMA): Listo en puerto ${PORT}`);

const tempDir = path.resolve('temp_audio');
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

wss.on('connection', (ws) => {
    console.log('📱 App conectada');

    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message);
            
            // === DATOS DINÁMICOS (RECIBIDOS DE LA APP) ===
            const myLang = data.my_lang || "Español";   // IDIOMA DEL DUEÑO
            const targetLang = data.language || "Inglés"; // IDIOMA DEL EXTRANJERO
            const chosenTone = data.tone || "Neutral";
            const mode = data.mode || "interpreter"; 

            // === 🎤 AUDIO ===
            if (data.type === 'audio_input') {
                console.log(`🎤 ${mode.toUpperCase()}: ${myLang} <-> ${targetLang}`);
                
                const inputPath = path.join(tempDir, `input_${Date.now()}.m4a`);
                const buffer = Buffer.from(data.payload, 'base64');
                if (buffer.length < 2000) return; 
                fs.writeFileSync(inputPath, buffer);

                const transcription = await openai.audio.transcriptions.create({ file: fs.createReadStream(inputPath), model: "whisper-1" });
                const userText = transcription.text;
                fs.unlinkSync(inputPath);

                if (!userText || userText.trim() === "") return;

                let systemPrompt = "";

                if (mode === 'interpreter') {
                    // === LÓGICA 1 A 1 (PING PONG DINÁMICO) ===
                    systemPrompt = `
                        Eres un intérprete simultáneo universal.
                        
                        IDIOMA A (Usuario): ${myLang}.
                        IDIOMA B (Interlocutor): ${targetLang}.

                        REGLA DE ORO (CRUCE DE IDIOMAS):
                        1. Escucha el texto: "${userText}".
                        2. Si detectas que es **${myLang}** -> Tradúcelo al **${targetLang}**.
                        3. Si detectas que es **${targetLang}** -> Tradúcelo al **${myLang}**.
                        
                        Mantén el tono: ${chosenTone}. 
                        SOLO devuelve la traducción final.
                    `;
                } else {
                    // === LÓGICA AUTO (GRUPO) ===
                    // Traduce TODO lo que escuche al idioma del Usuario
                    systemPrompt = `
                        Eres un traductor universal personal.
                        Tu dueño habla: ${myLang}.
                        
                        REGLA:
                        1. Escucha el texto: "${userText}".
                        2. Si el audio está en ${myLang} -> Tradúcelo al ${targetLang}.
                        3. Si el audio está en CUALQUIER OTRO IDIOMA -> Tradúcelo al ${myLang}.

                        Tono: ${chosenTone}. SOLO devuelve la traducción.
                    `;
                }

                const completion = await openai.chat.completions.create({
                    messages: [
                        { role: "system", content: systemPrompt },
                        { role: "user", content: userText }
                    ],
                    model: "gpt-4o",
                });
                const aiText = completion.choices[0].message.content;
                
                sendResponse(ws, userText, aiText, chosenTone);
            }

            // === 👁️ VISIÓN (FOTO) ===
            if (data.type === 'image_input') {
                // Si mandas foto, te la explica en TU idioma
                const visionPrompt = `Describe esto o traduce el texto que veas al idioma: ${myLang}. Tono: ${chosenTone}.`;
                const response = await openai.chat.completions.create({
                    model: "gpt-4o",
                    messages: [
                        { role: "user", content: [ { type: "text", text: visionPrompt }, { type: "image_url", image_url: { url: `data:image/jpeg;base64,${data.payload}` } } ] },
                    ],
                });
                const aiText = response.choices[0].message.content;
                sendResponse(ws, "📸 (Foto)", aiText, chosenTone);
            }

        } catch (error) { console.error("Error:", error.message); }
    });
});

async function sendResponse(ws, userText, aiText, tone) {
    console.log(`🔄 Traducción: "${aiText}"`);
    const mp3 = await openai.audio.speech.create({ model: "tts-1", voice: "alloy", input: aiText });
    const audioBuffer = Buffer.from(await mp3.arrayBuffer());
    
    ws.send(JSON.stringify({ 
        type: 'full_response', user_text: userText, ai_text: aiText, tone: tone, audio_payload: audioBuffer.toString('base64') 
    }));
}